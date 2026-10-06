from __future__ import annotations

import re


def sanitize_name_ocr_output(raw: str) -> str:
    """Trim generic OCR edge garbage without changing interior spelling."""
    t = raw.strip()
    t = re.sub(r"^[^A-Za-z']+", "", t)
    t = re.sub(r"[^A-Za-z .'\-]+$", "", t)
    t = re.sub(r"[ \t]+", " ", t).strip()
    return t


def sanitize_license_ocr_output(raw: str) -> str:
    """Digit-safe trim for licence numbers (no letter→digit guessing)."""
    t = raw.strip()
    if re.search(r"[A-Za-z]", t):
        return re.sub(r"\s+", "", t)
    t = re.sub(r"[\s\-./:,;|]+", "", t)
    return re.sub(r"[^0-9]", "", t)


def sanitize_field_ocr_output(field_name: str, raw: str) -> str:
    if field_name == "license_number":
        return sanitize_license_ocr_output(raw)
    if field_name == "name_en":
        return sanitize_name_ocr_output(raw)
    raise ValueError(f"unsupported field_name for OCR sanitize: {field_name}")
