from __future__ import annotations

import re
from calendar import monthrange
from typing import Literal, Optional, Tuple

ValidatorResult = Literal["ACCEPT", "REJECT", "FLAG_UNCERTAIN"]

_DATE_PARTS = re.compile(r"^(\d{2})([/-])(\d{2})([/-])(\d{4})$")
_DATE_LIKE_SLASH = re.compile(r"^[\d/\s]+$")
_DATE_LIKE_HYPHEN = re.compile(r"^[\d\-\s]+$")


def _split_exact_date(text: str) -> Optional[Tuple[int, int, int, str]]:
    m = _DATE_PARTS.fullmatch(text)
    if not m or m.group(2) != m.group(4):
        return None
    sep = m.group(2)
    return int(m.group(1)), int(m.group(3)), int(m.group(5)), sep


def _calendar_valid(dd: int, mm: int, yyyy: int) -> bool:
    if mm < 1 or mm > 12:
        return False
    if dd < 1 or dd > monthrange(yyyy, mm)[1]:
        return False
    return True


def validate_date_text(text: str) -> Tuple[ValidatorResult, str]:
    t = text.strip()
    if not t:
        return "REJECT", "empty"
    exact = _split_exact_date(t)
    if exact:
        d, m, y, _sep = exact
        if _calendar_valid(d, m, y):
            return "ACCEPT", "valid_calendar"
        return "REJECT", "invalid_calendar"
    if "/" in t and _DATE_LIKE_SLASH.fullmatch(t):
        parts = [p.strip() for p in t.split("/")]
        if len(parts) == 3 and all(p.isdigit() for p in parts):
            if len(parts[0]) != 2 or len(parts[1]) != 2 or len(parts[2]) != 4:
                return "FLAG_UNCERTAIN", "segment_length_mismatch"
            d, m, y = (int(p) for p in parts)
            if not _calendar_valid(d, m, y):
                return "FLAG_UNCERTAIN", "implausible_calendar"
        return "FLAG_UNCERTAIN", "malformed_date_like"
    if "-" in t and _DATE_LIKE_HYPHEN.fullmatch(t):
        parts = [p.strip() for p in t.split("-")]
        if len(parts) == 3 and all(p.isdigit() for p in parts):
            if len(parts[0]) != 2 or len(parts[1]) != 2 or len(parts[2]) != 4:
                return "FLAG_UNCERTAIN", "segment_length_mismatch"
            d, m, y = (int(p) for p in parts)
            if not _calendar_valid(d, m, y):
                return "FLAG_UNCERTAIN", "implausible_calendar"
        return "FLAG_UNCERTAIN", "malformed_date_like"
    if re.search(r"\d", t):
        return "FLAG_UNCERTAIN", "digits_without_valid_shape"
    return "REJECT", "not_date_like"
