"""Controlled MRZ ambiguity correction (diagnostic only, post raw OCR)."""

from __future__ import annotations

import itertools
from typing import Iterable

from icao_td3 import TD3_LINE_LEN, compute_check_digit, normalize_mrz_line, validate_td3

AMBIGUITY_MAP = {
    "O": "0",
    "0": "O",
    "I": "1",
    "1": "I",
    "B": "8",
    "8": "B",
    "S": "5",
    "5": "S",
    "Z": "2",
    "2": "Z",
}

# Positions where only digits are valid (0-based line2 indices)
DIGIT_ONLY_RANGES_LINE2 = [(13, 19), (19, 20), (21, 27), (27, 28), (43, 44)]
# Check digit positions
CHECK_POSITIONS_LINE2 = {9, 19, 27, 43}


def _line2_char_allowed(pos: int, ch: str) -> bool:
    for a, b in DIGIT_ONLY_RANGES_LINE2:
        if a <= pos < b:
            return ch.isdigit() or ch == "<"
    if pos == 10 or pos == 20:
        return ch.isalpha() or ch == "<"
    if pos < 9:
        return ch.isalnum() or ch == "<"
    return ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<"


def _candidate_chars(pos: int, line_idx: int, ch: str) -> list[str]:
    ch = ch.upper()
    opts = {ch}
    if ch in AMBIGUITY_MAP:
        alt = AMBIGUITY_MAP[ch]
        if line_idx == 2 and _line2_char_allowed(pos, alt):
            opts.add(alt)
        elif line_idx == 1:
            opts.add(alt)
    return list(opts)


def _positions_to_vary(line: str, line_idx: int) -> list[int]:
    positions = []
    for i, ch in enumerate(line):
        if ch in AMBIGUITY_MAP:
            if line_idx == 2 and _line2_char_allowed(i, AMBIGUITY_MAP[ch]):
                positions.append(i)
            elif line_idx == 1 and i >= 5:  # avoid mangling document code / state
                positions.append(i)
    return positions[:8]  # cap combinatorial explosion


def try_controlled_correction(line1_raw: str, line2_raw: str) -> dict:
    line1 = normalize_mrz_line(line1_raw)
    line2 = normalize_mrz_line(line2_raw)

    raw_val = validate_td3(line1, line2)
    result = {
        "raw_line1": line1,
        "raw_line2": line2,
        "raw_validation_pass": raw_val.all_required_checks_pass,
        "corrected_candidates": [],
        "status": "NO_CORRECTION_NEEDED" if raw_val.all_required_checks_pass else "SEARCHING",
    }

    if raw_val.all_required_checks_pass:
        return result

    pos1 = _positions_to_vary(line1, 1)
    pos2 = _positions_to_vary(line2, 2)
    all_positions = [(1, p) for p in pos1] + [(2, p) for p in pos2]

    if not all_positions:
        result["status"] = "NO_AMBIGUITY_POSITIONS"
        return result

    valid_candidates: list[dict] = []

    def apply_combo(subset: Iterable[tuple[int, int]], choices: list[str]) -> tuple[str, str]:
        l1 = list(line1.ljust(TD3_LINE_LEN, "<")[:TD3_LINE_LEN])
        l2 = list(line2.ljust(TD3_LINE_LEN, "<")[:TD3_LINE_LEN])
        for (ln, pos), ch in zip(subset, choices):
            if ln == 1 and pos < len(l1):
                l1[pos] = ch
            elif ln == 2 and pos < len(l2):
                l2[pos] = ch
        return "".join(l1), "".join(l2)

    for r in range(1, min(4, len(all_positions) + 1)):
        for subset in itertools.combinations(all_positions, r):
            choice_lists = [
                _candidate_chars(pos, ln, line1[pos] if ln == 1 else line2[pos])
                for ln, pos in subset
            ]
            for choices in itertools.product(*choice_lists):
                c1, c2 = apply_combo(subset, list(choices))
                val = validate_td3(c1, c2)
                if val.all_required_checks_pass:
                    valid_candidates.append(
                        {
                            "line1": c1,
                            "line2": c2,
                            "changed_positions": [
                                {"line": ln, "pos": pos, "char": ch}
                                for (ln, pos), ch in zip(subset, choices)
                            ],
                        }
                    )

    result["corrected_candidates"] = valid_candidates[:10]
    if len(valid_candidates) == 1:
        result["status"] = "SINGLE_CORRECTED_CANDIDATE"
        result["corrected_line1"] = valid_candidates[0]["line1"]
        result["corrected_line2"] = valid_candidates[0]["line2"]
    elif len(valid_candidates) > 1:
        result["status"] = "AMBIGUOUS"
    else:
        result["status"] = "NO_VALID_CORRECTION"

    return result
