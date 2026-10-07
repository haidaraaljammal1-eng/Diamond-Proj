"""Multi-candidate OCR selection for place_of_issue (English emirate names)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Callable, Optional

from src.scoring.normalize import normalize_for_field
from src.validators.english_fields import validate_field

_LATIN_CHUNK = re.compile(r"[A-Za-z][A-Za-z .'-]{1,}")


@dataclass(frozen=True)
class PlaceCandidate:
    candidate_id: str
    engine: str
    preprocessing: str
    psm: Optional[int]
    raw_text: str
    text: str
    confidence: Optional[float]
    quality: float


def _normalize_uae_emirate_place(text: str) -> str:
    compact = re.sub(r"[^A-Za-z]", "", text).lower()
    if compact.startswith("abudhab"):
        return "Abu Dhabi"
    return text


def extract_place_text(raw: str) -> str:
    t = normalize_for_field("place_of_issue", raw)
    t = _normalize_uae_emirate_place(t)
    t = re.sub(r"(?i)\b(abu\s+dhabi)b\b", "Abu Dhabi", t)
    t = re.sub(r"(?i)\b(abu\s+dhabi)ab\b", "Abu Dhabi", t)
    chunks = [c.strip() for c in _LATIN_CHUNK.findall(t)]
    if not chunks:
        return ""
    chunks.sort(key=len, reverse=True)
    return chunks[0].strip()


def _trim_trailing_noise(text: str) -> str:
    """Drop common trailing OCR junk (e.g. Abu Dhabib)."""
    parts = text.split()
    if len(parts) >= 2 and parts[-1].lower().startswith(parts[-2].lower()[:4]):
        if len(parts[-1]) == len(parts[-2]) + 1:
            parts = parts[:-1]
    cleaned = " ".join(parts)
    if validate_field("place_of_issue", cleaned) == "ACCEPT":
        return cleaned
    if cleaned.lower().endswith("ab") and "dhabi" in cleaned.lower():
        drop = cleaned[:-2].rstrip()
        if validate_field("place_of_issue", drop) == "ACCEPT":
            return drop
    if cleaned.endswith("b") and len(cleaned) > 4:
        drop_b = cleaned[:-1].rstrip()
        if validate_field("place_of_issue", drop_b) == "ACCEPT":
            return drop_b
    return text


def place_quality(
    text: str,
    confidence: Optional[float],
    preprocessing: str,
) -> float:
    if not text:
        return -1e9
    verdict = validate_field("place_of_issue", text)
    if verdict == "REJECT":
        return -1e9
    conf = confidence if confidence is not None else 0.0
    score = conf * 120.0
    if verdict == "ACCEPT":
        score += 35.0
    if "OTSU" in preprocessing:
        score += 18.0
    if len(text) >= 5:
        score += 10.0
    if text.endswith("b") and "dhabi" in text.lower():
        score -= 25.0
    return score


def recognize_place(
    crop_path: Any,
    cache_key: str,
    preprocess: Callable[..., Any],
    tesseract: Callable[..., dict[str, Any]],
    rapid: Callable[..., dict[str, Any]],
    min_conf_trigger: float = 0.3,
) -> tuple[PlaceCandidate, list[PlaceCandidate], str]:
    def _tess(cid: str, variant: str, psm: int) -> PlaceCandidate:
        img = preprocess(crop_path, variant, f"{cache_key}_{cid}")
        o = tesseract(img, psm, None)
        raw = o.get("raw_text", "")
        text = _trim_trailing_noise(extract_place_text(raw))
        conf = o.get("confidence")
        return PlaceCandidate(
            cid, "tesseract", variant, psm, raw, text, conf, place_quality(text, conf, variant)
        )

    def _rapid(cid: str, variant: str) -> PlaceCandidate:
        img = preprocess(crop_path, variant, f"{cache_key}_{cid}")
        o = rapid(img)
        raw = o.get("raw_text", "")
        text = _trim_trailing_noise(extract_place_text(raw))
        conf = o.get("confidence")
        return PlaceCandidate(
            cid, "rapidocr_en", variant, None, raw, text, conf, place_quality(text, conf, variant)
        )

    specs = [
        _rapid("primary", "P1_PAD"),
        _tess("otsu_psm7", "P7_OTSU_UP2_PAD", 7),
        _tess("otsu_psm8", "P7_OTSU_UP2_PAD", 8),
        _tess("pad_psm13", "P1_PAD", 13),
        _tess("clahe_psm6", "P5_CLAHE_UP2_PAD", 6),
        _rapid("up2_pad", "P3_UP2_GRAY_PAD"),
    ]
    primary = specs[0]
    candidates = [primary]
    conf = primary.confidence if primary.confidence is not None else 0.0
    if primary.quality < 40.0 or conf < min_conf_trigger:
        candidates.extend(specs[1:])

    best = max(candidates, key=lambda c: c.quality)
    decision = "primary_only" if len(candidates) == 1 else "multi_candidate_select"
    if best.candidate_id != "primary":
        decision = f"selected_{best.candidate_id}"
    return best, candidates, decision
