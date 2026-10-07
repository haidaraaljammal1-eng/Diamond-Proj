"""Multi-candidate Tesseract selection for UAE license numbers (digits only)."""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from typing import Any, Callable, Optional

from src.validators.english_fields import validate_field

_DIGITS_WL = "0123456789"
_TYPICAL_LEN = 7
_MAX_PLAUSIBLE_LEN = 12


@dataclass(frozen=True)
class LicenseCandidate:
    candidate_id: str
    preprocessing: str
    psm: int
    raw_text: str
    text: str
    confidence: Optional[float]
    quality: float


# Raw crops on security-pattern backgrounds need binarization + upscale (P7).
_CANDIDATE_SPECS: tuple[tuple[str, str, int], ...] = (
    ("primary", "P0_RAW", 7),
    ("otsu_psm8", "P7_OTSU_UP2_PAD", 8),
    ("otsu_psm7", "P7_OTSU_UP2_PAD", 7),
    ("otsu_psm13", "P7_OTSU_UP2_PAD", 13),
    ("otsu_psm6", "P7_OTSU_UP2_PAD", 6),
    ("pad_psm13", "P1_PAD", 13),
    ("pad_psm8", "P1_PAD", 8),
    ("gray_psm8", "P2_GRAY_PAD", 8),
    ("up3_psm7", "P4_UP3_GRAY_PAD", 7),
    ("clahe_psm6", "P5_CLAHE_UP2_PAD", 6),
)


def extract_license_digits(raw: str) -> str:
    return re.sub(r"[^0-9]", "", raw.strip())


def _is_plausible_length(n: int) -> bool:
    return 4 <= n <= _MAX_PLAUSIBLE_LEN


def _reject_garbage(text: str, confidence: Optional[float]) -> bool:
    if not text:
        return True
    if len(text) > _MAX_PLAUSIBLE_LEN and (confidence or 0.0) < 0.5:
        return True
    if len(text) > 15:
        return True
    return False


def _agreement_count(text: str, peers: list[str]) -> int:
    if not text:
        return 0
    return sum(1 for p in peers if p == text)


def score_license_candidate(
    text: str,
    confidence: Optional[float],
    preprocessing: str,
    peer_texts: list[str],
) -> float:
    if _reject_garbage(text, confidence):
        return -1e9
    verdict = validate_field("license_number", text)
    if verdict == "REJECT":
        return -1e9
    conf = confidence if confidence is not None else 0.0
    score = conf * 250.0
    score += _agreement_count(text, peer_texts) * 90.0
    if verdict == "ACCEPT":
        score += 40.0
    else:
        score -= 30.0
    score -= abs(len(text) - _TYPICAL_LEN) * 10.0
    if "OTSU" in preprocessing:
        score += 25.0
    if preprocessing == "P0_RAW" and conf <= 0.0:
        score -= 15.0
    return score


def consensus_right_aligned(strings: list[str]) -> str:
    """Fallback when no single candidate wins: column vote on right-aligned digits."""
    usable = [s for s in strings if _is_plausible_length(len(s))]
    if not usable:
        return ""
    max_len = max(len(s) for s in usable)
    cols: list[str] = []
    for col in range(max_len):
        votes: list[str] = []
        for s in usable:
            if col < len(s):
                votes.append(s[-(col + 1)])
        if votes:
            cols.append(Counter(votes).most_common(1)[0][0])
    return "".join(reversed(cols))


def recognize_license(
    crop_path: Any,
    cache_key: str,
    preprocess: Callable[..., Any],
    tesseract: Callable[..., dict[str, Any]],
    min_conf_trigger: float = 0.25,
) -> tuple[LicenseCandidate, list[LicenseCandidate], str]:
    def _run(cid: str, variant: str, psm: int) -> LicenseCandidate:
        img = preprocess(crop_path, variant, f"{cache_key}_{variant}_psm{psm}")
        o = tesseract(img, psm, _DIGITS_WL)
        raw = o.get("raw_text", "")
        text = extract_license_digits(raw)
        conf = o.get("confidence")
        return LicenseCandidate(cid, variant, psm, raw, text, conf, 0.0)

    primary = _run(*_CANDIDATE_SPECS[0])
    conf0 = primary.confidence if primary.confidence is not None else 0.0
    run_all = (
        validate_field("license_number", primary.text) != "ACCEPT"
        or conf0 < min_conf_trigger
        or _reject_garbage(primary.text, primary.confidence)
    )

    candidates: list[LicenseCandidate] = [primary]
    if run_all:
        for spec in _CANDIDATE_SPECS[1:]:
            candidates.append(_run(*spec))

    peer_texts = [c.text for c in candidates if c.text and not _reject_garbage(c.text, c.confidence)]
    scored: list[LicenseCandidate] = []
    for c in candidates:
        q = score_license_candidate(c.text, c.confidence, c.preprocessing, peer_texts)
        scored.append(
            LicenseCandidate(
                c.candidate_id,
                c.preprocessing,
                c.psm,
                c.raw_text,
                c.text,
                c.confidence,
                q,
            )
        )

    best = max(scored, key=lambda c: c.quality)
    decision = "primary_only" if not run_all else "multi_candidate_select"
    if best.candidate_id != "primary":
        decision = f"selected_{best.candidate_id}"

    if best.quality < 0 and peer_texts:
        merged = consensus_right_aligned(peer_texts)
        if merged and validate_field("license_number", merged) != "REJECT":
            best = LicenseCandidate(
                "consensus_aligned",
                "consensus",
                0,
                "",
                merged,
                None,
                score_license_candidate(merged, None, "consensus", peer_texts),
            )
            decision = "consensus_right_aligned"

    return best, scored, decision
