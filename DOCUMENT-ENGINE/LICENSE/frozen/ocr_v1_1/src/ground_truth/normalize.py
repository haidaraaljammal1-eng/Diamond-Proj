"""Storage normalization for human-entered ground truth (not OCR)."""

from __future__ import annotations

import re
import unicodedata
from typing import Optional

from src.ground_truth.constants import DATE_FIELDS


def normalize_stored_value(field_name: str, raw: str) -> str:
    text = unicodedata.normalize("NFC", raw)
    text = text.strip()
    text = re.sub(r"[ \t]+", " ", text)
    if field_name in DATE_FIELDS:
        text = re.sub(r"\s*([/-])\s*", r"\1", text)
    return text


def validate_date_shape(value: str) -> bool:
    m = re.fullmatch(r"^(\d{2})([/-])(\d{2})([/-])(\d{4})$", value)
    return bool(m and m.group(2) == m.group(4))


def warn_if_date_invalid(field_name: str, value: Optional[str]) -> Optional[str]:
    if value and field_name in DATE_FIELDS and not validate_date_shape(value):
        return f"Expected DD/MM/YYYY for {field_name}, got: {value}"
    return None
