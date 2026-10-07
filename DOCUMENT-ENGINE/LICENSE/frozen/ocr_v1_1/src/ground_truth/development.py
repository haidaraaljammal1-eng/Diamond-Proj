"""Development / holdout / special-case licence sets for OCR ground truth."""

from __future__ import annotations

DEVELOPMENT_SET = [
    "real3",
    "real5",
    "real6",
    "real7",
    "real8",
    "real10",
    "real11",
    "real12",
    "real14",
    "real_01",
    "real_02",
]

HOLDOUT_SET = ["real4"]
NEGATIVE_CONTROL_SET = ["real9"]
HARD_CASE_SET = ["real13"]

SPECIAL_SET = frozenset(HOLDOUT_SET + NEGATIVE_CONTROL_SET + HARD_CASE_SET)

BENCHMARK_MIN_VERIFIED_OCR_ELIGIBLE = 60
