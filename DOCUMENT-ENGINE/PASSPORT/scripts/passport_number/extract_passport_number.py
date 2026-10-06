"""Passport Number Engine — OCR restricted to lower MRZ line cells 0–9 (10 cells) only."""

from __future__ import annotations

from typing import Any

import cv2

from passport_number.checksum_resolve import (
    PassportNumberResult,
    resolve_from_doc9_and_check,
    resolve_from_sequence_10,
)
from passport_number.detection_bridge import obtain_line2_crop
from passport_number.focused_ocr import (
    normalize_mrz_token,
    ocr_ten_cell_corridor,
    pick_best_ten_char_reading,
)
from passport_number.line2_geometry import compute_line2_geometry, extract_ten_cell_corridor
from passport_number.ten_cell_consensus import accept_checksum_consensus, try_cell_level_consensus
from icao_td3 import verify_check_digit, compute_check_digit

OCR_CELL_COUNT = 10


def public_result(internal: dict[str, Any]) -> dict[str, Any]:
    """Application contract: passport_number only, or null + REVIEW."""
    if internal.get("passport_number"):
        return {"passport_number": internal["passport_number"]}
    return {"passport_number": None, "status": "REVIEW"}


def _first_checksum_valid_reading(readings10: list[dict], *, min_votes: int = 1) -> PassportNumberResult | None:
    votes: dict[str, list[float | None]] = {}
    for r in readings10:
        norm = normalize_mrz_token(r.get("normalized") or "")
        if len(norm) < 10:
            continue
        if verify_check_digit(norm[:9], norm[9]) is not True:
            continue
        votes.setdefault(norm[:9], []).append(r.get("confidence"))
    if not votes:
        return None
    ranked = sorted(
        votes.items(),
        key=lambda kv: (len(kv[1]), max((c or 0) for c in kv[1])),
        reverse=True,
    )
    doc9, confs = ranked[0]
    if len(confs) < min_votes:
        return None
    return resolve_from_sequence_10(doc9 + str(compute_check_digit(doc9)), max(confs))


def _count_checksum_doc9_votes(readings10: list[dict]) -> dict[str, int]:
    votes: dict[str, int] = {}
    for r in readings10:
        norm = normalize_mrz_token(r.get("normalized") or "")
        if len(norm) >= 10 and verify_check_digit(norm[:9], norm[9]) is True:
            votes[norm[:9]] = votes.get(norm[:9], 0) + 1
    return votes


def _resolve_ten_cell_readings(
    readings10: list[dict],
    crop10,
    *,
    min_checksum_votes: int = 1,
) -> PassportNumberResult:
    consensus = accept_checksum_consensus(readings10, min_votes=min_checksum_votes)
    if consensus and consensus.status == "VALID":
        return consensus

    checksum_first = _first_checksum_valid_reading(readings10, min_votes=min_checksum_votes)
    if checksum_first and checksum_first.status == "VALID":
        competing = _count_checksum_doc9_votes(readings10)
        if len(competing) == 1:
            return checksum_first

    best10 = pick_best_ten_char_reading(readings10)
    if not best10:
        cell = try_cell_level_consensus(crop10)
        if cell and cell.status == "VALID":
            return cell
        return PassportNumberResult(
            passport_number=None,
            status="NO_RELIABLE_EXTRACTION",
            check_digit=None,
            sequence_10=None,
            checksum_pass=None,
            failure_stage="D_focused_ocr",
            details={"readings_10": readings10, "ocr_scope": "line2_cells_0_9_only"},
        )

    seq = best10.get("sequence_10") or ""
    doc9 = seq[:9] if len(seq) >= 9 else None
    cd_char = seq[9] if len(seq) >= 10 else None

    if doc9 and len(doc9) == 9:
        resolved = resolve_from_doc9_and_check(doc9, cd_char, best10.get("confidence"))
        if resolved.status != "VALID":
            resolved = resolve_from_sequence_10(seq, best10.get("confidence"))
        if resolved.status != "VALID":
            cell = try_cell_level_consensus(crop10)
            if cell and cell.status == "VALID":
                return cell
        return resolved
    resolved = resolve_from_sequence_10(seq, best10.get("confidence"))
    if resolved.status != "VALID":
        cell = try_cell_level_consensus(crop10)
        if cell and cell.status == "VALID":
            return cell
    return resolved


def _extract_from_line2(line2, label: str, cand: dict | None = None) -> dict[str, Any]:
    geom = compute_line2_geometry(line2)
    crop10 = extract_ten_cell_corridor(line2, geom)
    readings10 = ocr_ten_cell_corridor(crop10)
    sup = (cand or {}).get("supplemental_enriched_line2")
    if sup is not None:
        sgeom = compute_line2_geometry(sup)
        scrop = extract_ten_cell_corridor(sup, sgeom)
        extra = ocr_ten_cell_corridor(scrop)
        for r in extra:
            r["variant"] = "enriched_" + str(r.get("variant", ""))
        readings10.extend(extra)

    resolved = _resolve_ten_cell_readings(readings10, crop10, min_checksum_votes=2)
    return {
        "candidate_label": label,
        "resolved": resolved,
        "geom": geom,
        "crop10": crop10,
        "readings10": readings10,
        "best10": pick_best_ten_char_reading(readings10),
        "ocr_scope": "line2_cells_0_9_only",
        "ocr_cell_count": OCR_CELL_COUNT,
    }


def _pick_best_attempt(attempts: list[dict[str, Any]]) -> dict[str, Any]:
    label_rank = {"primary": 0, "fallback_raw": 1}
    primary = next((a for a in attempts if a.get("candidate_label") == "primary"), None)
    if primary:
        pr = primary["resolved"]
        if pr.status == "VALID" and pr.passport_number:
            return primary
        if pr.status == "REVIEW" and pr.failure_stage in (
            "G_unresolved_ambiguity",
            "F_checksum_validation",
        ):
            return primary

    valid = [a for a in attempts if a["resolved"].status == "VALID" and a["resolved"].passport_number]
    if valid:
        valid.sort(
            key=lambda a: (
                label_rank.get(a.get("candidate_label") or "", 9),
                -(a["resolved"].details.get("ocr_confidence") or 0)
                if a["resolved"].details
                else 0,
            )
        )
        return valid[0]
    for a in attempts:
        if a["resolved"].passport_number:
            return a
    return attempts[0]


def extract_passport_number_from_image(image_bgr) -> dict[str, Any]:
    ctx = obtain_line2_crop(image_bgr)
    if not ctx.line2_candidates:
        return {
            "passport_number": None,
            "status": "REVIEW",
            "mrz_found": False,
            "failure_stage": ctx.failure_stage or "A_MRZ_detection",
            "detector_path": ctx.detector_path,
            "message": ctx.message,
            "ocr_scope": "line2_cells_0_9_only",
        }

    attempts: list[dict[str, Any]] = []
    for cand in ctx.line2_candidates:
        try:
            attempts.append(_extract_from_line2(cand["line2_bgr"], cand["label"], cand))
        except Exception as exc:
            attempts.append(
                {
                    "candidate_label": cand["label"],
                    "resolved": PassportNumberResult(
                        passport_number=None,
                        status="REVIEW",
                        check_digit=None,
                        sequence_10=None,
                        checksum_pass=None,
                        failure_stage="C_focused_crop_generation",
                        details={"error": str(exc)},
                    ),
                }
            )

    best = _pick_best_attempt(attempts)
    resolved = best["resolved"]

    focused_crop = None
    if "geom" in best:
        focused_crop = {
            "candidate_label": best.get("candidate_label"),
            "ocr_scope": "line2_cells_0_9_only",
            "ocr_cell_count": OCR_CELL_COUNT,
            "geometry": {
                "corridor_x": best["geom"].corridor_x,
                "corridor_w": best["geom"].corridor_w,
                "cell_width_px": best["geom"].cell_width_px,
                "ten_cell_crop_wh": list(best["crop10"].shape[1::-1]),
            },
            "ocr_readings_10": best.get("readings10"),
            "best_reading_10": best.get("best10"),
        }

    status = resolved.status
    if status == "NO_RELIABLE_EXTRACTION":
        status = "REVIEW"

    return {
        "passport_number": resolved.passport_number,
        "status": status,
        "mrz_found": True,
        "detector_path": ctx.detector_path,
        "check_digit": resolved.check_digit,
        "sequence_10": resolved.sequence_10,
        "checksum_pass": resolved.checksum_pass,
        "failure_stage": resolved.failure_stage,
        "ocr_scope": "line2_cells_0_9_only",
        "focused_crop": focused_crop,
        "line2_context": ctx.details,
        "resolution_details": resolved.details,
        "candidate_attempts": [
            {
                "label": a.get("candidate_label"),
                "passport_number": a["resolved"].passport_number,
                "status": a["resolved"].status,
                "failure_stage": a["resolved"].failure_stage,
            }
            for a in attempts
        ],
    }


def extract_passport_number_from_path(path: str) -> dict[str, Any]:
    bgr = cv2.imread(path)
    if bgr is None:
        return {"passport_number": None, "status": "REVIEW", "failure_stage": "image_read"}
    return extract_passport_number_from_image(bgr)
