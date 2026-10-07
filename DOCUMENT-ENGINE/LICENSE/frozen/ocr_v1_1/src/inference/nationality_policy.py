"""Multi-candidate Tesseract selection for nationality (dynamic, no country list)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Callable, Optional

from src.scoring.normalize import normalize_for_field
from src.validators.english_fields import validate_field

_LATIN_WORD = re.compile(r"[A-Za-z]{2,}")


@dataclass(frozen=True)
class NationalityCandidate:
    candidate_id: str
    preprocessing: str
    psm: int
    raw_text: str
    text: str
    confidence: Optional[float]
    quality: float


def _repair_common_ocr_typos(word: str) -> str:
    """Single-edit fixes on security-pattern crops (no country list)."""
    w = word.strip()
    if len(w) >= 4 and w.upper().endswith("IE"):
        alt = w[:-2] + "IA"
        if validate_field("nationality", alt) == "ACCEPT":
            return alt
    if len(w) >= 4 and w.upper().endswith("E") and w[-2:].upper() not in ("IE",):
        alt = w[:-1] + "A"
        if validate_field("nationality", alt) == "ACCEPT":
            return alt
    return w


def extract_nationality_text(raw: str) -> str:
    """Derive a single nationality string from noisy OCR (punctuation, prefixes)."""
    t = normalize_for_field("nationality", raw)
    words = _LATIN_WORD.findall(t)
    if not words:
        return ""
    if len(words) == 1:
        return _repair_common_ocr_typos(words[0])
    upper_long = [w for w in words if w.isupper() and len(w) >= 4]
    if len(upper_long) == 1:
        return _repair_common_ocr_typos(upper_long[0])
    title_long = [w for w in words if w[0].isupper() and len(w) >= 5 and not w.islower()]
    if len(title_long) == 1:
        return title_long[0]
    return " ".join(words)


def nationality_quality(
    text: str,
    confidence: Optional[float],
    preprocessing: str = "",
    peer_texts: Optional[list[str]] = None,
) -> float:
    if not text or len(text) < 4 or validate_field("nationality", text) != "ACCEPT":
        return -1e9
    conf = confidence if confidence is not None else 0.0
    score = conf * 100.0
    peers = peer_texts or []
    score += sum(1 for p in peers if p == text) * 85.0
    parts = text.split()
    if preprocessing and "OTSU" in preprocessing:
        score += 18.0
    if len(parts) == 1:
        w = parts[0]
        if w.isupper() and len(w) >= 4:
            score += 25.0
        elif w[0].isupper() and len(w) >= 5:
            score += 20.0
    else:
        score -= 25.0
        for w in parts:
            if w.islower() and len(w) <= 5:
                score -= 40.0
    return score


_CANDIDATE_SPECS: tuple[tuple[str, str, int], ...] = (
    ("primary", "P0_RAW", 13),
    ("otsu_psm8", "P7_OTSU_UP2_PAD", 8),
    ("otsu_psm7", "P7_OTSU_UP2_PAD", 7),
    ("otsu_psm6", "P7_OTSU_UP2_PAD", 6),
    ("pad_psm13", "P1_PAD", 13),
    ("pad_psm7", "P1_PAD", 7),
    ("clahe_psm6", "P5_CLAHE_UP2_PAD", 6),
    ("gray_psm8", "P2_GRAY_PAD", 8),
)


def recognize_nationality(
    crop_path: Any,
    cache_key: str,
    preprocess: Callable[..., Any],
    tesseract: Callable[..., dict[str, Any]],
    min_conf_trigger: float = 0.35,
) -> tuple[NationalityCandidate, list[NationalityCandidate], str]:
    """Full candidate grid on textured crops (security-pattern backgrounds)."""

    def _run(cid: str, variant: str, psm: int) -> NationalityCandidate:
        img = preprocess(crop_path, variant, f"{cache_key}_{variant}_psm{psm}")
        o = tesseract(img, psm, None)
        raw = o.get("raw_text", "")
        text = extract_nationality_text(raw)
        conf = o.get("confidence")
        return NationalityCandidate(
            cid, variant, psm, raw, text, conf, 0.0
        )

    candidates = [_run(*spec) for spec in _CANDIDATE_SPECS]
    peer_texts = [c.text for c in candidates if c.text]
    rescored: list[NationalityCandidate] = []
    for c in candidates:
        q = nationality_quality(c.text, c.confidence, c.preprocessing, peer_texts)
        rescored.append(
            NationalityCandidate(
                c.candidate_id,
                c.preprocessing,
                c.psm,
                c.raw_text,
                c.text,
                c.confidence,
                q,
            )
        )
    candidates = rescored
    best = max(candidates, key=lambda c: c.quality)
    decision = "multi_candidate_grid"
    if best.candidate_id != "primary":
        decision = f"selected_{best.candidate_id}"
    elif best.quality >= 35.0 and (best.confidence or 0) >= min_conf_trigger:
        decision = "primary_only"
    return best, candidates, decision
