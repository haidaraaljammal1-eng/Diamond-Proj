"""Pick passport-number readings from focused OCR variants using checksum + confidence."""

from __future__ import annotations

from passport_number.checksum_resolve import (
    PassportNumberResult,
    resolve_from_doc9_and_check,
    resolve_from_sequence_10,
)
from passport_number.focused_ocr import normalize_mrz_token
from icao_td3 import verify_check_digit


def _iter_candidate_strings(readings: list[dict]) -> list[tuple[str, float | None, str]]:
    out: list[tuple[str, float | None, str]] = []
    for r in readings:
        norm = r.get("normalized") or ""
        conf = r.get("confidence")
        variant = r.get("variant") or ""
        if not norm:
            continue
        if len(norm) >= 10:
            out.append((norm[:10], conf, variant))
        if len(norm) >= 9:
            out.append((norm[:9].ljust(10, "<"), conf, variant))
    return out


def resolve_from_focused_readings(
    readings10: list[dict],
    readings9: list[dict],
) -> PassportNumberResult:
    combined = readings10 + readings9
    exact_valid: list[tuple[str, float | None, str]] = []
    for seq, conf, variant in _iter_candidate_strings(combined):
        if len(seq) == 10 and verify_check_digit(seq[:9], seq[9]) is True:
            exact_valid.append((seq, conf, variant))

    if exact_valid:
        exact_valid.sort(key=lambda t: (-(t[1] or 0), t[0]))
        unique_doc9 = {s[:9] for s, _, _ in exact_valid}
        if len(unique_doc9) == 1:
            seq = exact_valid[0][0]
            return resolve_from_sequence_10(seq, exact_valid[0][1])
        best_seq = exact_valid[0][0]
        return resolve_from_sequence_10(best_seq, exact_valid[0][1])

    best9 = None
    best9_conf = None
    for r in readings9:
        norm = normalize_mrz_token(r.get("normalized") or "")
        if len(norm) >= 9:
            doc9 = norm[:9]
            if best9 is None or (r.get("confidence") or 0) > (best9_conf or 0):
                best9 = doc9
                best9_conf = r.get("confidence")

    best10 = None
    best10_conf = None
    cd_char = None
    for r in readings10:
        norm = normalize_mrz_token(r.get("normalized") or "")
        if len(norm) >= 10:
            if best10 is None or (r.get("confidence") or 0) > (best10_conf or 0):
                best10 = norm[:10]
                best10_conf = r.get("confidence")
                cd_char = best10[9]
        elif len(norm) >= 9 and best10 is None:
            best10 = norm[:9].ljust(10, "<")
            best10_conf = r.get("confidence")
            cd_char = best10[9]

    if best9 and len(best9) == 9:
        res = resolve_from_doc9_and_check(best9, cd_char, best9_conf)
        if res.status == "VALID":
            return res

    if best10:
        return resolve_from_sequence_10(best10, best10_conf)

    return PassportNumberResult(
        passport_number=None,
        status="NO_RELIABLE_EXTRACTION",
        check_digit=None,
        sequence_10=None,
        checksum_pass=None,
        failure_stage="D_focused_ocr",
        details={"readings_10": readings10, "readings_9": readings9},
    )
