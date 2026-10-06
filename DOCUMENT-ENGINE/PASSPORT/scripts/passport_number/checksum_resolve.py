"""Passport number resolution with ICAO check digit (no icao_td3 edits)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from icao_td3 import compute_check_digit, verify_check_digit

AMBIGUITY = {
    "O": "0",
    "0": "O",
    "I": "1",
    "1": "I",
    "B": "8",
    "8": "B",
    "S": "5",
    "5": "S",
    "G": "6",
    "6": "G",
    "Z": "2",
    "2": "Z",
}


@dataclass
class PassportNumberResult:
    passport_number: str | None
    status: str  # VALID | REVIEW | NO_RELIABLE_EXTRACTION
    check_digit: str | None
    sequence_10: str | None
    checksum_pass: bool | None
    failure_stage: str | None
    details: dict[str, Any]


def _checksum_ok(doc9: str, cd: str) -> bool | None:
    if len(doc9) != 9 or len(cd) != 1:
        return False
    r = verify_check_digit(doc9, cd)
    return r is True


def public_passport_from_validated_doc9(doc9: str) -> str:
    """After ICAO checksum on the raw 9-cell field: drop trailing MRZ fillers only."""
    core = doc9.rstrip("<")
    if not core or not core.isalnum():
        return doc9
    return core


def resolve_from_doc9_and_check(doc9: str, check_char: str | None, ocr_conf: float | None = None) -> PassportNumberResult:
    doc9 = doc9.upper()[:9]
    if len(doc9) != 9 or not doc9.replace("<", "").isalnum() or "<" in doc9:
        return PassportNumberResult(
            passport_number=None,
            status="NO_RELIABLE_EXTRACTION",
            check_digit=None,
            sequence_10=None,
            checksum_pass=None,
            failure_stage="D_focused_ocr",
            details={"doc9": doc9},
        )
    cd = (check_char or "")[:1]
    if cd.isdigit():
        ok = _checksum_ok(doc9, cd)
        if ok:
            return PassportNumberResult(
                passport_number=public_passport_from_validated_doc9(doc9),
                status="VALID",
                check_digit=cd,
                sequence_10=doc9 + cd,
                checksum_pass=True,
                failure_stage=None,
                details={"path": "doc9_plus_observed_check", "ocr_confidence": ocr_conf},
            )
    expected = str(compute_check_digit(doc9))
    if cd.isdigit() and int(cd) != int(expected):
        return resolve_from_sequence_10(doc9 + cd, ocr_conf)
    if not cd.isdigit() or cd == "<":
        return PassportNumberResult(
            passport_number=public_passport_from_validated_doc9(doc9),
            status="VALID",
            check_digit=expected,
            sequence_10=doc9 + expected,
            checksum_pass=True,
            failure_stage=None,
            details={"path": "doc9_with_computed_check", "ocr_confidence": ocr_conf},
        )
    return resolve_from_sequence_10(doc9 + (cd if cd.isdigit() else expected), ocr_conf)


def resolve_from_sequence_10(seq: str, ocr_conf: float | None = None) -> PassportNumberResult:
    seq = seq.upper()
    if len(seq) < 10:
        return PassportNumberResult(
            passport_number=None,
            status="NO_RELIABLE_EXTRACTION",
            check_digit=None,
            sequence_10=seq,
            checksum_pass=False,
            failure_stage="D_focused_ocr",
            details={"reason": "sequence_shorter_than_10"},
        )

    doc9 = seq[:9]
    cd = seq[9]
    ok = _checksum_ok(doc9, cd)
    if ok:
        return PassportNumberResult(
            passport_number=public_passport_from_validated_doc9(doc9),
            status="VALID",
            check_digit=cd,
            sequence_10=seq[:10],
            checksum_pass=True,
            failure_stage=None,
            details={"ocr_confidence": ocr_conf},
        )

    if seq[0] == "I" and len(seq) >= 10:
        doc9_strike = seq[1:10]
        if len(doc9_strike) == 9 and doc9_strike.isalnum():
            cd_exp = str(compute_check_digit(doc9_strike))
            if _checksum_ok(doc9_strike, cd_exp):
                return PassportNumberResult(
                    passport_number=public_passport_from_validated_doc9(doc9_strike),
                    status="VALID",
                    check_digit=cd_exp,
                    sequence_10=doc9_strike + cd_exp,
                    checksum_pass=True,
                    failure_stage=None,
                    details={
                        "resolved_by": "leading_i_strike_recheck",
                        "ocr_confidence": ocr_conf,
                    },
                )

    alts = _ambiguous_candidates(seq[:10])
    valid = [c for c in alts if _checksum_ok(c[:9], c[9])]
    if len(valid) == 1:
        c = valid[0]
        return PassportNumberResult(
            passport_number=public_passport_from_validated_doc9(c[:9]),
            status="VALID",
            check_digit=c[9],
            sequence_10=c,
            checksum_pass=True,
            failure_stage=None,
            details={"resolved_by": "single_checksum_candidate", "ocr_confidence": ocr_conf},
        )
    if len(valid) > 1:
        return PassportNumberResult(
            passport_number=None,
            status="REVIEW",
            check_digit=None,
            sequence_10=seq[:10],
            checksum_pass=False,
            failure_stage="G_unresolved_ambiguity",
            details={"checksum_candidates": valid},
        )

    return PassportNumberResult(
        passport_number=None,
        status="REVIEW",
        check_digit=cd,
        sequence_10=seq[:10],
        checksum_pass=False if ok is False else None,
        failure_stage="F_checksum_validation",
        details={"ocr_confidence": ocr_conf},
    )


def _ambiguous_candidates(seq10: str, max_changes: int = 2) -> list[str]:
    """Generate limited single-position ambiguity variants."""
    base = list(seq10)
    out = {seq10}
    for i in range(9):
        ch = base[i]
        alt = AMBIGUITY.get(ch)
        if not alt:
            continue
        v = base.copy()
        v[i] = alt
        out.add("".join(v))
    if base[0] == "I":
        v = base.copy()
        v[0] = "L"
        out.add("".join(v))
    if max_changes >= 2:
        for i in range(9):
            for j in range(i + 1, 9):
                ci, cj = base[i], base[j]
                if ci not in AMBIGUITY and cj not in AMBIGUITY:
                    continue
                v = base.copy()
                if ci in AMBIGUITY:
                    v[i] = AMBIGUITY[ci]
                if cj in AMBIGUITY:
                    v[j] = AMBIGUITY[cj]
                out.add("".join(v))
    return list(out)
