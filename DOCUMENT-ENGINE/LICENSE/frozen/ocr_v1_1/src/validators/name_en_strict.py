from __future__ import annotations

import re
from typing import Literal, Tuple

ValidatorResult = Literal["ACCEPT", "REJECT", "FLAG_UNCERTAIN"]

_ARABIC = re.compile(r"[\u0600-\u06FF]")
_LATIN_NAME = re.compile(r"^[A-Za-z][A-Za-z .'\-]*$")
_GARBAGE = re.compile(r"[^A-Za-z .'\-]")


def validate_name_en_text(text: str) -> Tuple[ValidatorResult, str]:
    t = text.strip()
    if not t:
        return "REJECT", "empty"
    if _ARABIC.search(t):
        return "REJECT", "arabic_present"
    if _GARBAGE.search(t):
        return "FLAG_UNCERTAIN", "unexpected_characters"
    digits = sum(c.isdigit() for c in t)
    if digits > 1:
        return "FLAG_UNCERTAIN", "digit_sequence"
    if not _LATIN_NAME.fullmatch(t):
        return "FLAG_UNCERTAIN", "latin_structure"
    words = [w for w in re.split(r"\s+", t) if w]
    if len(words) < 1:
        return "REJECT", "no_words"
    short = sum(1 for w in words if len(w.replace("'", "").replace("-", "")) < 2)
    if short > max(1, len(words) // 2):
        return "FLAG_UNCERTAIN", "fragmented_words"
    return "ACCEPT", "ok"
