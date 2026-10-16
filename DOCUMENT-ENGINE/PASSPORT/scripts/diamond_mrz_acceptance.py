"""Diamond-specific partial MRZ acceptance (filler-loss tolerance only).

Strict ICAO validation remains authoritative in icao_td3.validate_td3.
This module adds a secondary path for incomplete OCR lines when missing
characters can be localized to safe filler regions without affecting
fullName, nationality, or passportNumber.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

from icao_td3 import (
    TD3_LINE_LEN,
    normalize_mrz_line,
    parse_name_fields,
    parse_td3,
    status_from_validation,
    validate_td3,
    verify_check_digit,
)
from mrz_nationality_slot import (
    NationalitySlotResolution,
    raw_nationality_slot,
    resolve_nationality_slot,
)

MRZ_CHAR = re.compile(r"^[A-Z0-9<]+$")
NATIONALITY_RE = re.compile(r"^[A-Z]{3}$")
NAME_TOKEN_RE = re.compile(r"^[A-Z]+$")
# Minimum observed lengths for partial Diamond acceptance (both lines short).
MIN_PARTIAL_LINE_LEN = 40


def _issuing_state(line1: str) -> Optional[str]:
    if len(line1) >= 5 and line1[2:5].isalpha() and line1[2:5].isupper():
        return line1[2:5]
    return None


def _nationality_matches_issuing_state(line1: str, line2: str) -> tuple[bool, list[str]]:
    evidence: list[str] = []
    state = _issuing_state(line1)
    if len(line2) < 13:
        evidence.append("line2 too short for nationality field")
        return False, evidence
    nat = line2[10:13]
    if not NATIONALITY_RE.match(nat):
        evidence.append("nationality is not three A-Z letters at indices 10-12")
        return False, evidence
    if state and nat != state:
        evidence.append(f"nationality '{nat}' does not match line1 issuing state '{state}'")
        return False, evidence
    if state:
        evidence.append(f"nationality '{nat}' matches line1 issuing state '{state}'")
    else:
        evidence.append(f"nationality '{nat}' present at fixed indices (line1 state unavailable)")
    return True, evidence

# TD3 line2: nationality ends at index 12 (inclusive).
LINE2_NATIONALITY_END = 12
LINE2_OPTIONAL_START = 28


class FillerLossClass(str, Enum):
    SAFE_TRAILING_FILLER_LOSS = "SAFE_TRAILING_FILLER_LOSS"
    SAFE_OPTIONAL_FILLER_REGION_LOSS = "SAFE_OPTIONAL_FILLER_REGION_LOSS"
    POSSIBLE_MEANINGFUL_CHARACTER_LOSS = "POSSIBLE_MEANINGFUL_CHARACTER_LOSS"
    UNKNOWN = "UNKNOWN"


@dataclass
class FillerLossReport:
    classification: FillerLossClass
    observed_length: int
    deficit_from_44: int
    last_meaningful_index: Optional[int]
    last_meaningful_character: Optional[str]
    filler_run_location: str
    protected_field_boundaries: dict[str, Any]
    rationale: list[str] = field(default_factory=list)


@dataclass
class FieldValidation:
    extracted: Optional[str]
    validated: bool
    evidence: list[str] = field(default_factory=list)


@dataclass
class DiamondMrzEvaluation:
    status: str  # VALID | VALID_FOR_DIAMOND | REVIEW | INVALID
    mrz_valid: bool
    diamond_fields_validated: bool
    reason: Optional[str]
    full_name: Optional[str]
    nationality: Optional[str]
    passport_number: Optional[str]
    line1_filler_loss: FillerLossReport
    line2_filler_loss: FillerLossReport
    full_name_validation: FieldValidation
    nationality_validation: FieldValidation
    passport_number_validation: FieldValidation
    strict_icao_status: str
    nationality_slot_resolution: NationalitySlotResolution | None = None

    def to_output_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "fullName": self.full_name,
            "nationality": self.nationality,
            "passportNumber": self.passport_number,
            "mrzValid": self.mrz_valid,
            "diamondFieldsValidated": self.diamond_fields_validated,
            "status": self.status,
            "reason": self.reason,
        }
        if self.nationality_slot_resolution is not None:
            out["nationalityResolution"] = self.nationality_slot_resolution.to_audit_dict()
        return out


def _last_meaningful_index(line: str) -> Optional[int]:
    for i in range(len(line) - 1, -1, -1):
        if line[i] != "<":
            return i
    return None


def _line2_prefix_integrity(line2: str) -> tuple[bool, list[str]]:
    evidence: list[str] = []
    if len(line2) < 13:
        evidence.append("line2 shorter than nationality field (need >= 13 chars)")
        return False, evidence
    prefix = line2[0:13]
    if not MRZ_CHAR.match(prefix):
        evidence.append("prefix contains invalid MRZ characters")
        return False, evidence
    doc_field = line2[0:9]
    check_char = line2[9]
    if not check_char.isdigit():
        evidence.append("document check digit position is not a digit")
        return False, evidence
    doc_check = verify_check_digit(doc_field, check_char)
    if doc_check is not True:
        evidence.append("document number ICAO checksum failed or unevaluable")
        return False, evidence
    nationality = line2[10:13]
    nat_res = resolve_nationality_slot(nationality)
    if not nat_res.accepted:
        evidence.append("nationality slot not accepted by authoritative ICAO dataset")
        evidence.extend(nat_res.evidence)
        return False, evidence
    evidence.append("fixed TD3 prefix indices 0-12 structurally intact")
    evidence.append("document number checksum PASS at index 9")
    evidence.append(f"nationality slot accepted: raw={nat_res.raw_slot!r} final={nat_res.final_nationality!r}")
    evidence.extend(nat_res.evidence)
    return True, evidence


def classify_line1_filler_loss(line1: str) -> FillerLossReport:
    observed = len(line1)
    deficit = TD3_LINE_LEN - observed
    last_idx = _last_meaningful_index(line1)
    last_ch = line1[last_idx] if last_idx is not None else None
    boundaries = {
        "document_code": "0-1",
        "issuing_state": "2-4",
        "name_field": "5-43",
        "protected_name_content_end": last_idx,
    }
    rationale: list[str] = []

    if observed > TD3_LINE_LEN:
        return FillerLossReport(
            FillerLossClass.UNKNOWN,
            observed,
            max(0, deficit),
            last_idx,
            last_ch,
            "n/a",
            boundaries,
            ["line longer than TD3"],
        )

    if observed == TD3_LINE_LEN:
        return FillerLossReport(
            FillerLossClass.UNKNOWN,
            observed,
            0,
            last_idx,
            last_ch,
            "none",
            boundaries,
            ["full length line — use strict ICAO path"],
        )

    if observed < 5 or "<<" not in line1:
        rationale.append("insufficient structure for TD3 name line")
        return FillerLossReport(
            FillerLossClass.POSSIBLE_MEANINGFUL_CHARACTER_LOSS,
            observed,
            deficit,
            last_idx,
            last_ch,
            "unknown",
            boundaries,
            rationale,
        )

    if last_idx is None or last_idx < 5:
        rationale.append("no meaningful name content detected")
        return FillerLossReport(
            FillerLossClass.POSSIBLE_MEANINGFUL_CHARACTER_LOSS,
            observed,
            deficit,
            last_idx,
            last_ch,
            "none",
            boundaries,
            rationale,
        )

    tail = line1[last_idx + 1 :]
    if tail and any(c != "<" for c in tail):
        rationale.append("non-filler characters appear after last meaningful name character")
        return FillerLossReport(
            FillerLossClass.POSSIBLE_MEANINGFUL_CHARACTER_LOSS,
            observed,
            deficit,
            last_idx,
            last_ch,
            "after_name",
            boundaries,
            rationale,
        )

    sep = line1.index("<<")
    if sep < 5 or sep > last_idx:
        rationale.append("name separator not within expected surname/given layout")
        return FillerLossReport(
            FillerLossClass.POSSIBLE_MEANINGFUL_CHARACTER_LOSS,
            observed,
            deficit,
            last_idx,
            last_ch,
            "name_field",
            boundaries,
            rationale,
        )

    surname = line1[5:sep]
    given_raw = line1[sep + 2 : last_idx + 1]
    if not surname or not NAME_TOKEN_RE.match(surname) or len(surname) < 3:
        rationale.append("surname missing, incomplete, or shorter than minimum safe token length (3)")
        return FillerLossReport(
            FillerLossClass.POSSIBLE_MEANINGFUL_CHARACTER_LOSS,
            observed,
            deficit,
            last_idx,
            last_ch,
            "surname",
            boundaries,
            rationale,
        )
    if not given_raw or not NAME_TOKEN_RE.match(given_raw) or len(given_raw) < 3:
        rationale.append("given names missing, incomplete, or shorter than minimum safe token length (3)")
        return FillerLossReport(
            FillerLossClass.POSSIBLE_MEANINGFUL_CHARACTER_LOSS,
            observed,
            deficit,
            last_idx,
            last_ch,
            "given_names",
            boundaries,
            rationale,
        )

    rationale.append(f"deficit {deficit} localized after index {last_idx} (only `<` in OCR tail)")
    rationale.append("surname and given tokens complete before suspected filler-loss region")
    return FillerLossReport(
        FillerLossClass.SAFE_TRAILING_FILLER_LOSS,
        observed,
        deficit,
        last_idx,
        last_ch,
        f"indices {last_idx + 1}-{observed - 1} (trailing `<` only)",
        boundaries,
        rationale,
    )


def classify_line2_filler_loss(line2: str) -> FillerLossReport:
    observed = len(line2)
    deficit = TD3_LINE_LEN - observed
    last_idx = _last_meaningful_index(line2)
    last_ch = line2[last_idx] if last_idx is not None else None
    boundaries = {
        "document_number_and_check": "0-9",
        "nationality": "10-12",
        "optional_data_region": "28-41",
        "composite_check": "43",
    }
    rationale: list[str] = []

    if observed > TD3_LINE_LEN:
        return FillerLossReport(
            FillerLossClass.UNKNOWN,
            observed,
            max(0, deficit),
            last_idx,
            last_ch,
            "n/a",
            boundaries,
            ["line longer than TD3"],
        )

    if observed == TD3_LINE_LEN:
        return FillerLossReport(
            FillerLossClass.UNKNOWN,
            observed,
            0,
            last_idx,
            last_ch,
            "none",
            boundaries,
            ["full length line — use strict ICAO path"],
        )

    prefix_ok, prefix_notes = _line2_prefix_integrity(line2)
    rationale.extend(prefix_notes)
    if not prefix_ok:
        return FillerLossReport(
            FillerLossClass.POSSIBLE_MEANINGFUL_CHARACTER_LOSS,
            observed,
            deficit,
            last_idx,
            last_ch,
            "prefix",
            boundaries,
            rationale,
        )

    if observed < LINE2_OPTIONAL_START:
        rationale.append(
            f"line ends before optional region (index {LINE2_OPTIONAL_START}); "
            "cannot exclude meaningful loss in DOB/expiry segment"
        )
        return FillerLossReport(
            FillerLossClass.POSSIBLE_MEANINGFUL_CHARACTER_LOSS,
            observed,
            deficit,
            last_idx,
            last_ch,
            "before_optional",
            boundaries,
            rationale,
        )

    rationale.append(
        f"observed length {observed}: missing indices {observed}-43 only (suffix truncation)"
    )
    rationale.append("protected prefix through nationality (0-12) independently verified")
    return FillerLossReport(
        FillerLossClass.SAFE_OPTIONAL_FILLER_REGION_LOSS,
        observed,
        deficit,
        last_idx,
        last_ch,
        f"missing suffix indices {observed}-43",
        boundaries,
        rationale,
    )


def _validate_full_name(line1: str, l1_class: FillerLossReport) -> FieldValidation:
    _, _, surname, given = parse_name_fields(line1)
    if given and surname:
        extracted = f"{given} {surname}".strip()
    elif surname:
        extracted = surname
    else:
        extracted = given or None

    evidence = list(l1_class.rationale)
    if l1_class.classification != FillerLossClass.SAFE_TRAILING_FILLER_LOSS:
        evidence.append("line1 filler-loss class does not allow automatic name acceptance")
        return FieldValidation(extracted, False, evidence)

    if not extracted:
        evidence.append("name fields empty after parse")
        return FieldValidation(None, False, evidence)

    evidence.append(f"extracted fullName '{extracted}' from intact name tokens before filler tail")
    return FieldValidation(extracted, True, evidence)


def _validate_passport_number(line2: str, l2_class: FillerLossReport) -> FieldValidation:
    evidence: list[str] = []
    if len(line2) >= TD3_LINE_LEN:
        doc_check = verify_check_digit(line2[0:9], line2[9])
        if doc_check is not True:
            evidence.append("full line2 present but document checksum failed")
            return FieldValidation(None, False, evidence)
        extracted = line2[0:9].replace("<", "").strip()
        evidence.append("full line2: document checksum PASS at index 9")
        evidence.append(f"passportNumber '{extracted}' from TD3 indices 0-8")
        return FieldValidation(extracted, bool(extracted), evidence)

    prefix_ok, prefix_notes = _line2_prefix_integrity(line2)
    evidence.extend(prefix_notes)
    if not prefix_ok:
        return FieldValidation(None, False, evidence)

    extracted = line2[0:9].replace("<", "").strip()
    if not extracted:
        evidence.append("document number field empty after stripping fillers")
        return FieldValidation(None, False, evidence)

    if l2_class.classification != FillerLossClass.SAFE_OPTIONAL_FILLER_REGION_LOSS:
        evidence.append("line2 filler-loss class does not allow automatic passport acceptance")
        return FieldValidation(extracted, False, evidence)

    evidence.append(f"passportNumber '{extracted}' from TD3 indices 0-8")
    return FieldValidation(extracted, True, evidence)


def _validate_nationality(line1: str, line2: str, l2_class: FillerLossReport) -> FieldValidation:
    evidence: list[str] = []
    raw = raw_nationality_slot(line2)
    nat_res = resolve_nationality_slot(raw)
    evidence.extend(nat_res.evidence)

    if len(line2) >= TD3_LINE_LEN:
        if not nat_res.accepted:
            return FieldValidation(raw, False, evidence)
        evidence.append("full line2: nationality slot resolved at indices 10-12")
        return FieldValidation(nat_res.final_nationality, True, evidence)

    prefix_ok, prefix_notes = _line2_prefix_integrity(line2)
    evidence.extend(prefix_notes)
    if not prefix_ok or not raw:
        return FieldValidation(raw or None, False, evidence)

    if not nat_res.accepted:
        return FieldValidation(raw, False, evidence)

    if l2_class.classification != FillerLossClass.SAFE_OPTIONAL_FILLER_REGION_LOSS:
        evidence.append("line2 filler-loss class does not allow automatic nationality acceptance")
        return FieldValidation(raw, False, evidence)

    evidence.append(f"nationality raw={nat_res.raw_slot!r} final={nat_res.final_nationality!r}")
    return FieldValidation(nat_res.final_nationality, True, evidence)


def evaluate_mrz_for_diamond(line1_raw: str, line2_raw: str) -> DiamondMrzEvaluation:
    line1 = normalize_mrz_line(line1_raw)
    line2 = normalize_mrz_line(line2_raw)
    strict_val = validate_td3(line1, line2)
    strict_status = status_from_validation(strict_val)

    l1_class = classify_line1_filler_loss(line1)
    l2_class = classify_line2_filler_loss(line2)
    name_val = _validate_full_name(line1, l1_class)
    passport_val = _validate_passport_number(line2, l2_class)
    nationality_val = _validate_nationality(line1, line2, l2_class)

    if strict_val.all_required_checks_pass:
        parsed = parse_td3(line1_raw, line2_raw)
        nat_res = resolve_nationality_slot(raw_nationality_slot(line2))
        if not nat_res.accepted:
            return DiamondMrzEvaluation(
                status="REVIEW",
                mrz_valid=True,
                diamond_fields_validated=False,
                reason="NATIONALITY_SLOT_REVIEW",
                full_name=parsed.full_name or None,
                nationality=None,
                passport_number=parsed.passport_number or None,
                line1_filler_loss=l1_class,
                line2_filler_loss=l2_class,
                full_name_validation=FieldValidation(parsed.full_name, True, ["strict ICAO path"]),
                nationality_validation=FieldValidation(
                    nat_res.raw_slot, False, nat_res.evidence
                ),
                passport_number_validation=FieldValidation(
                    parsed.passport_number, True, ["strict ICAO path"]
                ),
                strict_icao_status=strict_status,
                nationality_slot_resolution=nat_res,
            )
        reason = "STRICT_ICAO_VALID"
        if nat_res.correction_applied:
            reason = "STRICT_ICAO_VALID_NATIONALITY_O0_CORRECTED"
        nat_evidence = list(nat_res.evidence)
        if nat_res.correction_applied:
            nat_evidence.append(f"raw OCR slot preserved as {nat_res.raw_slot!r}")
        return DiamondMrzEvaluation(
            status="VALID",
            mrz_valid=True,
            diamond_fields_validated=True,
            reason=reason,
            full_name=parsed.full_name or None,
            nationality=nat_res.final_nationality,
            passport_number=parsed.passport_number or None,
            line1_filler_loss=l1_class,
            line2_filler_loss=l2_class,
            full_name_validation=FieldValidation(parsed.full_name, True, ["strict ICAO path"]),
            nationality_validation=FieldValidation(nat_res.final_nationality, True, nat_evidence),
            passport_number_validation=FieldValidation(
                parsed.passport_number, True, ["strict ICAO path"]
            ),
            strict_icao_status=strict_status,
            nationality_slot_resolution=nat_res,
        )

    # Explicit checksum failure on document prefix → INVALID (never REVIEW).
    if len(line2) >= 10:
        doc_check = verify_check_digit(line2[0:9], line2[9])
        if doc_check is False:
            return DiamondMrzEvaluation(
                status="INVALID",
                mrz_valid=False,
                diamond_fields_validated=False,
                reason="DOCUMENT_CHECKSUM_FAIL",
                full_name=None,
                nationality=None,
                passport_number=None,
                line1_filler_loss=l1_class,
                line2_filler_loss=l2_class,
                full_name_validation=name_val,
                nationality_validation=nationality_val,
                passport_number_validation=passport_val,
                strict_icao_status=strict_status,
            )

    if (
        name_val.validated
        and passport_val.validated
        and nationality_val.validated
        and l1_class.classification == FillerLossClass.SAFE_TRAILING_FILLER_LOSS
        and (
            l2_class.classification == FillerLossClass.SAFE_OPTIONAL_FILLER_REGION_LOSS
            or len(line2) >= TD3_LINE_LEN
        )
        and len(line1) >= MIN_PARTIAL_LINE_LEN
        and len(line2) >= MIN_PARTIAL_LINE_LEN
    ):
        return DiamondMrzEvaluation(
            status="VALID_FOR_DIAMOND",
            mrz_valid=False,
            diamond_fields_validated=True,
            reason="TRAILING_FILLER_LOSS_ONLY",
            full_name=name_val.extracted,
            nationality=nationality_val.extracted,
            passport_number=passport_val.extracted,
            line1_filler_loss=l1_class,
            line2_filler_loss=l2_class,
            full_name_validation=name_val,
            nationality_validation=nationality_val,
            passport_number_validation=passport_val,
            strict_icao_status=strict_status,
        )

    if (
        l1_class.classification == FillerLossClass.POSSIBLE_MEANINGFUL_CHARACTER_LOSS
        or l2_class.classification == FillerLossClass.POSSIBLE_MEANINGFUL_CHARACTER_LOSS
        or l1_class.classification == FillerLossClass.UNKNOWN
        or l2_class.classification == FillerLossClass.UNKNOWN
    ):
        return DiamondMrzEvaluation(
            status="REVIEW",
            mrz_valid=False,
            diamond_fields_validated=False,
            reason="MEANINGFUL_LOSS_OR_AMBIGUOUS",
            full_name=None,
            nationality=None,
            passport_number=None,
            line1_filler_loss=l1_class,
            line2_filler_loss=l2_class,
            full_name_validation=name_val,
            nationality_validation=nationality_val,
            passport_number_validation=passport_val,
            strict_icao_status=strict_status,
        )

    return DiamondMrzEvaluation(
        status="REVIEW",
        mrz_valid=False,
        diamond_fields_validated=False,
        reason="PARTIAL_FIELDS_NOT_PROVEN",
        full_name=None,
        nationality=None,
        passport_number=None,
        line1_filler_loss=l1_class,
        line2_filler_loss=l2_class,
        full_name_validation=name_val,
        nationality_validation=nationality_val,
        passport_number_validation=passport_val,
        strict_icao_status=strict_status,
    )
