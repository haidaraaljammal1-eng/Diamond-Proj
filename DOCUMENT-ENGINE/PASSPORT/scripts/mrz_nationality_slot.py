"""MRZ-A21: authoritative ICAO MRZ nationality slot validation and O↔0 correction."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "icao_mrz_nationality_codes.json"


@dataclass
class NationalitySlotResolution:
    raw_slot: str
    final_nationality: str | None
    accepted: bool
    correction_applied: bool
    correction_type: str | None
    validation_basis: str
    status: str  # ACCEPTED_RAW | CORRECTED | REVIEW
    evidence: list[str] = field(default_factory=list)
    candidate_codes: list[str] = field(default_factory=list)

    def to_audit_dict(self) -> dict[str, Any]:
        return {
            "raw_nationality": self.raw_slot,
            "final_nationality": self.final_nationality,
            "correction_applied": self.correction_applied,
            "correction_type": self.correction_type,
            "validation_basis": self.validation_basis,
            "status": self.status,
            "candidate_codes": list(self.candidate_codes),
        }


@lru_cache(maxsize=1)
def load_slot_table() -> dict[str, str]:
    payload = json.loads(_DATA_PATH.read_text(encoding="utf-8"))
    slots = payload["slots"]
    return {str(k): str(v) for k, v in slots.items()}


def raw_nationality_slot(line2: str) -> str:
    if len(line2) < 13:
        return ""
    return line2[10:13]


def _o0_toggle_candidates(raw: str) -> list[str]:
    if len(raw) != 3:
        return []
    branches: list[list[str]] = []
    for ch in raw:
        if ch == "O":
            branches.append(["O", "0"])
        elif ch == "0":
            branches.append(["0", "O"])
        else:
            branches.append([ch])

    out: list[str] = []

    def walk(i: int, acc: list[str]) -> None:
        if i == 3:
            out.append("".join(acc))
            return
        for ch in branches[i]:
            acc.append(ch)
            walk(i + 1, acc)
            acc.pop()

    walk(0, [])
    return out


def resolve_nationality_slot(raw_slot: str) -> NationalitySlotResolution:
    table = load_slot_table()
    raw = raw_slot if len(raw_slot) == 3 else raw_slot[:3].ljust(3, "<")[:3]
    evidence: list[str] = [f"raw_nationality_slot={raw!r}"]

    if raw in table:
        evidence.append("exact match in authoritative ICAO MRZ nationality dataset")
        return NationalitySlotResolution(
            raw_slot=raw,
            final_nationality=table[raw],
            accepted=True,
            correction_applied=False,
            correction_type=None,
            validation_basis="ICAO_DOC9303_DATASET",
            status="ACCEPTED_RAW",
            evidence=evidence,
            candidate_codes=[raw],
        )

    candidates = _o0_toggle_candidates(raw)
    valid = sorted({c for c in candidates if c in table})
    evidence.append(f"O↔0 candidate variants={len(candidates)} valid_in_dataset={valid}")

    if len(valid) == 1:
        chosen = valid[0]
        evidence.append(f"unique authoritative candidate {chosen!r}")
        return NationalitySlotResolution(
            raw_slot=raw,
            final_nationality=table[chosen],
            accepted=True,
            correction_applied=True,
            correction_type="O0_OCR_CONFUSION",
            validation_basis="ICAO_DOC9303_DATASET",
            status="CORRECTED",
            evidence=evidence,
            candidate_codes=valid,
        )

    if len(valid) == 0:
        evidence.append("no authoritative candidate after constrained O↔0 expansion")
        return NationalitySlotResolution(
            raw_slot=raw,
            final_nationality=None,
            accepted=False,
            correction_applied=False,
            correction_type=None,
            validation_basis="ICAO_DOC9303_DATASET",
            status="REVIEW",
            evidence=evidence,
            candidate_codes=[],
        )

    evidence.append("multiple authoritative candidates — ambiguous")
    return NationalitySlotResolution(
        raw_slot=raw,
        final_nationality=None,
        accepted=False,
        correction_applied=False,
        correction_type=None,
        validation_basis="ICAO_DOC9303_DATASET",
        status="REVIEW",
        evidence=evidence,
        candidate_codes=valid,
    )


def exhaustive_o0_collision_report() -> dict[str, Any]:
    table = load_slot_table()
    valid_codes = sorted(table.keys())
    ambiguous: list[dict[str, str]] = []
    correctable: list[dict[str, str]] = []
    no_candidate: list[str] = []

    for raw in valid_codes:
        for i, ch in enumerate(raw):
            if ch not in ("O", "0"):
                continue
            mutated = list(raw)
            mutated[i] = "0" if ch == "O" else "O"
            mut = "".join(mutated)
            if mut in table:
                continue
            res = resolve_nationality_slot(mut)
            if res.status == "CORRECTED" and res.final_nationality == table[raw]:
                correctable.append({"invalid_raw": mut, "corrects_to_slot": raw})
            elif res.status == "REVIEW" and len(res.candidate_codes) > 1:
                ambiguous.append({"invalid_raw": mut, "candidates": ",".join(res.candidate_codes)})

    for probe in ("NO0", "0OR", "N00", "ZZ0", "O00"):
        res = resolve_nationality_slot(probe)
        if res.status == "REVIEW" and not res.candidate_codes:
            no_candidate.append(probe)

    return {
        "total_valid_slots": len(valid_codes),
        "mutation_cases_from_valid_codes": sum(
            1 for c in valid_codes for ch in c if ch in ("O", "0")
        ),
        "safely_correctable_invalid_mutations": len(correctable),
        "ambiguous_invalid_mutations": len(ambiguous),
        "sample_correctable": correctable[:20],
        "sample_ambiguous": ambiguous[:20],
        "sample_no_candidate_probes": no_candidate,
    }
