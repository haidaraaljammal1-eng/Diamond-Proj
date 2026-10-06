from __future__ import annotations

import re
from calendar import monthrange
from typing import Literal, Optional, Tuple

ValidatorResult = Literal["ACCEPT", "REJECT", "FLAG_UNCERTAIN"]

_LATIN_TEXT = re.compile(r"^[A-Za-z][A-Za-z .'\-]*$")
_LATIN_NAME = re.compile(r"^[A-Za-z][A-Za-z .'\-]*$")
_DATE_PARTS = re.compile(r"^(\d{2})([/-])(\d{2})([/-])(\d{4})$")
_LICENSE_DIGITS = re.compile(r"^[0-9]+$")


def _parse_date_field(value: str) -> Optional[Tuple[int, int, int]]:
    m = _DATE_PARTS.fullmatch(value)
    if not m or m.group(2) != m.group(4):
        return None
    return int(m.group(1)), int(m.group(3)), int(m.group(5))


def _calendar_valid(value: str) -> bool:
    parts = _parse_date_field(value)
    if not parts:
        return False
    d, m, y = parts
    if m < 1 or m > 12:
        return False
    if d < 1 or d > monthrange(y, m)[1]:
        return False
    return True


def validate_field(field_name: str, text: str) -> ValidatorResult:
    t = text.strip()
    if not t:
        return "REJECT"
    if field_name in ("date_of_birth", "issue_date", "expiry_date"):
        if _parse_date_field(t) is None:
            return "REJECT"
        return "ACCEPT" if _calendar_valid(t) else "REJECT"
    if field_name == "license_number":
        if not _LICENSE_DIGITS.fullmatch(t):
            return "REJECT"
        if len(t) < 4 or len(t) > 15:
            return "FLAG_UNCERTAIN"
        return "ACCEPT"
    if field_name == "name_en":
        return "ACCEPT" if _LATIN_NAME.fullmatch(t) else "FLAG_UNCERTAIN"
    if field_name == "nationality":
        return "ACCEPT" if _LATIN_TEXT.fullmatch(t) else "FLAG_UNCERTAIN"
    if field_name == "place_of_issue":
        return "ACCEPT" if _LATIN_TEXT.fullmatch(t) else "FLAG_UNCERTAIN"
    return "FLAG_UNCERTAIN"
