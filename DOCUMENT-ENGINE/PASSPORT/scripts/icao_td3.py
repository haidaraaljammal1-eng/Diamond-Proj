"""ICAO Doc 9303 TD3 MRZ parser and check-digit validation (Diamond MRZ-A1)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


WEIGHTS = (7, 3, 1)
TD3_LINE_LEN = 44


def char_value(ch: str) -> int:
    if ch.isdigit():
        return int(ch)
    if "A" <= ch <= "Z":
        return ord(ch) - ord("A") + 10
    if ch == "<":
        return 0
    raise ValueError(f"invalid MRZ character: {ch!r}")


def compute_check_digit(data: str) -> int:
    total = 0
    for i, ch in enumerate(data):
        total += char_value(ch) * WEIGHTS[i % 3]
    return total % 10


def verify_check_digit(field: str, check_char: str) -> Optional[bool]:
    if len(field) == 0 or check_char == "<" or not check_char.isdigit():
        return None
    try:
        expected = compute_check_digit(field)
        return expected == int(check_char)
    except ValueError:
        return False


def normalize_mrz_line(raw: str) -> str:
    s = raw.upper().replace(" ", "")
    allowed = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<")
    return "".join(c for c in s if c in allowed)


@dataclass
class ICAOValidation:
    line1_length: int
    line2_length: int
    structure_valid: bool
    document_number_check: Optional[bool] = None
    dob_check: Optional[bool] = None
    expiry_check: Optional[bool] = None
    composite_check: Optional[bool] = None
    all_required_checks_pass: bool = False
    notes: list[str] = field(default_factory=list)


@dataclass
class TD3ParseResult:
    line1: str
    line2: str
    document_code: str
    issuing_state: str
    surname: str
    given_names: str
    passport_number: str
    nationality: str
    full_name: str
    validation: ICAOValidation


def parse_name_fields(line1: str) -> tuple[str, str, str, str]:
    if len(line1) < 5:
        return "", "", "", ""
    document_code = line1[0:2]
    issuing_state = line1[2:5]
    name_field = line1[5:44] if len(line1) >= 44 else line1[5:]
    if "<<" in name_field:
        surname, given = name_field.split("<<", 1)
    else:
        parts = name_field.split("<")
        surname = parts[0] if parts else ""
        given = " ".join(p for p in parts[1:] if p)
    surname = surname.replace("<", " ").strip()
    given = given.replace("<", " ").strip()
    return document_code, issuing_state, surname, given


def parse_td3(line1_raw: str, line2_raw: str) -> TD3ParseResult:
    line1 = normalize_mrz_line(line1_raw)
    line2 = normalize_mrz_line(line2_raw)

    document_code, issuing_state, surname, given_names = parse_name_fields(line1)
    if given_names and surname:
        full_name = f"{given_names} {surname}".strip()
    elif surname:
        full_name = surname
    else:
        full_name = given_names

    passport_number = ""
    nationality = ""
    if len(line2) >= 10:
        passport_number = line2[0:9].replace("<", "").strip()
        nationality = line2[10:13].replace("<", "").strip() if len(line2) >= 13 else ""

    val = validate_td3(line1, line2)
    return TD3ParseResult(
        line1=line1,
        line2=line2,
        document_code=document_code,
        issuing_state=issuing_state,
        surname=surname,
        given_names=given_names,
        passport_number=passport_number,
        nationality=nationality,
        full_name=full_name.strip(),
        validation=val,
    )


def validate_td3(line1: str, line2: str) -> ICAOValidation:
    notes: list[str] = []
    structure = len(line1) == TD3_LINE_LEN and len(line2) == TD3_LINE_LEN
    if not structure:
        notes.append(
            f"TD3 expects {TD3_LINE_LEN} chars per line; got {len(line1)} and {len(line2)}"
        )

    doc_check = dob_check = exp_check = comp_check = None
    if len(line2) >= 44:
        doc_field = line2[0:9]
        doc_check = verify_check_digit(doc_field, line2[9])
        dob_field = line2[13:19]
        dob_check = verify_check_digit(dob_field, line2[19])
        exp_field = line2[21:27]
        exp_check = verify_check_digit(exp_field, line2[27])
        composite_data = line2[0:10] + line2[13:20] + line2[21:28] + line2[28:43]
        comp_check = verify_check_digit(composite_data, line2[43])

    checks = [c for c in (doc_check, dob_check, exp_check, comp_check) if c is not None]
    all_pass = structure and len(checks) == 4 and all(checks)

    if line1 and line1[0] not in ("P", "I", "A", "C", "R", "V", "D"):
        notes.append(f"unexpected document code first char: {line1[0]!r}")

    return ICAOValidation(
        line1_length=len(line1),
        line2_length=len(line2),
        structure_valid=structure,
        document_number_check=doc_check,
        dob_check=dob_check,
        expiry_check=exp_check,
        composite_check=comp_check,
        all_required_checks_pass=all_pass,
        notes=notes,
    )


def status_from_validation(val: ICAOValidation) -> str:
    if val.all_required_checks_pass:
        return "VALID"
    if not val.structure_valid:
        return "INVALID"
    checks = [
        val.document_number_check,
        val.dob_check,
        val.expiry_check,
        val.composite_check,
    ]
    if any(c is False for c in checks):
        return "INVALID"
    return "INVALID"
