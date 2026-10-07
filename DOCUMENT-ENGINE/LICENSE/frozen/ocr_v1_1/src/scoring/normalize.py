"""Normalize OCR predictions for scoring (raw text is never modified in storage)."""

from __future__ import annotations

import re
import unicodedata

from src.ground_truth.constants import DATE_FIELDS

_ARABIC_DIACRITICS = re.compile(
    r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]"
)


def normalize_whitespace_only(text: str) -> str:
    return text.strip()


def normalize_for_field(field_name: str, text: str) -> str:
    t = unicodedata.normalize("NFC", text)
    t = t.strip()
    t = re.sub(r"[ \t]+", " ", t)
    if field_name in DATE_FIELDS:
        t = re.sub(r"\s*([/-])\s*", r"\1", t)
    return t


def normalized_exact_match(field_name: str, prediction: str, truth: str) -> bool:
    pred_n = normalize_for_field(field_name, prediction)
    truth_n = normalize_for_field(field_name, truth)
    if field_name == "name_ar":
        return pred_n == truth_n
    if field_name in DATE_FIELDS or field_name == "license_number":
        return pred_n == truth_n
    if field_name in ("name_en", "nationality", "place_of_issue"):
        return pred_n.casefold() == truth_n.casefold()
    return pred_n == truth_n


def cer_on_strings(prediction: str, truth: str) -> float:
    """Levenshtein CER using raw whitespace-trimmed strings."""
    a = normalize_whitespace_only(prediction)
    b = normalize_whitespace_only(truth)
    if not b:
        return 0.0 if not a else 1.0
    return levenshtein(a, b) / len(b)


def cer_normalized_field(field_name: str, prediction: str, truth: str) -> float:
    if field_name == "name_ar":
        a = _strip_ar_diacritics(normalize_for_field(field_name, prediction))
        b = _strip_ar_diacritics(normalize_for_field(field_name, truth))
    elif field_name in ("name_en", "nationality", "place_of_issue"):
        a = normalize_for_field(field_name, prediction).casefold()
        b = normalize_for_field(field_name, truth).casefold()
    else:
        a = normalize_for_field(field_name, prediction)
        b = normalize_for_field(field_name, truth)
    if not b:
        return 0.0 if not a else 1.0
    return levenshtein(a, b) / len(b)


def _strip_ar_diacritics(text: str) -> str:
    return _ARABIC_DIACRITICS.sub("", text)


def levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            ins = cur[j - 1] + 1
            delete = prev[j] + 1
            sub = prev[j - 1] + (0 if ca == cb else 1)
            cur.append(min(ins, delete, sub))
        prev = cur
    return prev[-1]
