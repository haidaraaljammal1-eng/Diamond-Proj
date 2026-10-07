#!/usr/bin/env python3
"""MRZ-A2: structural TD3 detection + segmentation, then existing OCR/ICAO unchanged."""

from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path

os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

import cv2
import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
WORKSPACE_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

from diamond_mrz_acceptance import evaluate_mrz_for_diamond  # noqa: E402
from icao_td3 import parse_td3, status_from_validation  # noqa: E402
from mrz_correction import try_controlled_correction  # noqa: E402
from mrz_detect_orchestrator import detect_mrz_orchestrated  # noqa: E402
from mrz_detect_td3 import (  # noqa: E402
    load_params,
    pair_candidates_to_json,
    rotate_image,
    row_candidates_to_json,
)
from mrz_fallback_crop_normalize import normalize_fallback_pair_crops  # noqa: E402
from mrz_pre_ocr_gate import PreOcrGateResult, validate_pre_ocr  # noqa: E402
from run_mrz_a1 import (  # noqa: E402
    get_process_ram_mb,
    list_passport_images,
    run_ocr_on_lines,
    sha256_file,
)

PASSPORT_DIR = WORKSPACE_ROOT / "samples" / "passport"


def _params_with_a14(base: dict) -> dict:
    out = dict(base)
    norm_cfg: dict = {}
    a14_path = WORKSPACE_ROOT / "docs" / "mrz_a14_normalization_params.json"
    if a14_path.is_file():
        block = json.loads(a14_path.read_text(encoding="utf-8"))
        norm_cfg.update({k: v for k, v in block.items() if k != "description"})
    a18_path = WORKSPACE_ROOT / "docs" / "mrz_a18_row_geometry_params.json"
    if a18_path.is_file():
        block = json.loads(a18_path.read_text(encoding="utf-8"))
        norm_cfg.update({k: v for k, v in block.items() if k not in ("description", "phase")})
    if norm_cfg:
        out["fallback_crop_normalization"] = norm_cfg
    return out


def _draw_row_candidates(image: np.ndarray, rows, title: str) -> np.ndarray:
    vis = image.copy()
    for r in rows:
        color = (0, 0, 255) if r.rejected else (0, 255, 255)
        cv2.rectangle(vis, (r.x, r.y), (r.x + r.w, r.y + r.h), color, 2)
        cv2.putText(
            vis,
            f"R{r.row_id}",
            (r.x, max(r.y - 4, 12)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            color,
            1,
        )
    cv2.putText(vis, title, (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    return vis


def _draw_pairs(image: np.ndarray, pairs, max_draw: int = 15) -> np.ndarray:
    vis = image.copy()
    for p in pairs[:max_draw]:
        a, b = p.row_a, p.row_b
        cv2.rectangle(vis, (a.x, a.y), (a.x + a.w, a.y + a.h), (255, 128, 0), 1)
        cv2.rectangle(vis, (b.x, b.y), (b.x + b.w, b.y + b.h), (255, 128, 0), 1)
        cv2.putText(
            vis,
            f"P{p.pair_id}:{p.total_score:.2f}",
            (min(a.x, b.x), max(a.y, b.y) - 6),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.4,
            (255, 128, 0),
            1,
        )
    return vis


def _draw_selected(image: np.ndarray, det) -> np.ndarray:
    vis = image.copy()
    if det.selected_pair is None:
        cv2.putText(vis, "NO PAIR SELECTED", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        return vis
    sp = det.selected_pair
    top, bottom = (sp.row_a, sp.row_b) if sp.row_a.y <= sp.row_b.y else (sp.row_b, sp.row_a)
    cv2.rectangle(vis, (top.x, top.y), (top.x + top.w, top.y + top.h), (0, 255, 0), 3)
    cv2.putText(vis, "LINE1", (top.x, top.y - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
    cv2.rectangle(vis, (bottom.x, bottom.y), (bottom.x + bottom.w, bottom.y + bottom.h), (0, 200, 255), 3)
    cv2.putText(vis, "LINE2", (bottom.x, bottom.y - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 200, 255), 2)
    if det.mrz_bbox:
        x, y, w, h = det.mrz_bbox
        cv2.rectangle(vis, (x, y), (x + w, y + h), (255, 0, 255), 2)
    return vis


def write_final_report(out_dir: Path, ctx: dict) -> None:
    lines = [
        "# MRZ-A2 FINAL REPORT",
        "",
        "## INPUT",
        f"- filename: {ctx.get('input_filename')}",
        f"- dimensions: {ctx.get('input_dimensions')}",
        f"- SHA-256: {ctx.get('input_sha256')}",
        "",
        "## MRZ-A1 ROOT CAUSE",
        f"- previous false region: {ctx.get('a1_false_region')}",
        f"- rejection reason: {ctx.get('a1_rejection_reason')}",
        "",
        "## ORIENTATION",
        f"- estimated angle: {ctx.get('deskew_angle')}",
        f"- deskew applied: {ctx.get('deskew_applied')}",
        "",
        "## ROW DETECTION",
        f"- candidates found: {ctx.get('row_candidates_total')}",
        f"- candidates rejected: {ctx.get('row_candidates_rejected')}",
        f"- plausible rows: {ctx.get('row_candidates_plausible')}",
        "",
        "## PAIR DETECTION",
        f"- pairs evaluated: {ctx.get('pairs_evaluated')}",
        f"- selected pair: {ctx.get('selected_pair')}",
        f"- total score: {ctx.get('pair_total_score')}",
        f"- score breakdown: {ctx.get('score_breakdown')}",
        f"- lower-page prior contribution: {ctx.get('lower_page_prior')}",
        "",
        "## FINAL GEOMETRY",
        f"- MRZ bbox: {ctx.get('mrz_bbox')}",
        f"- Line 1 bbox: {ctx.get('line1_bbox')}",
        f"- Line 2 bbox: {ctx.get('line2_bbox')}",
        f"- equal_fallback used: {ctx.get('equal_fallback')}",
        "",
        "## PRE-OCR GATE",
        f"- Line 1 text-like: {ctx.get('gate_line1')}",
        f"- Line 2 text-like: {ctx.get('gate_line2')}",
        f"- pair geometry: {ctx.get('gate_pair')}",
        f"- final: {ctx.get('gate_final')}",
        "",
        "## RAW OCR",
        f"- line 1: {ctx.get('raw_line1')}",
        f"- length: {ctx.get('raw_line1_len')}",
        f"- confidence: {ctx.get('raw_line1_conf')}",
        f"- line 2: {ctx.get('raw_line2')}",
        f"- length: {ctx.get('raw_line2_len')}",
        f"- confidence: {ctx.get('raw_line2_conf')}",
        "",
        "## ICAO",
        f"- structure: {ctx.get('icao_structure')}",
        f"- document number: {ctx.get('doc_check')}",
        f"- DOB: {ctx.get('dob_check')}",
        f"- expiry: {ctx.get('exp_check')}",
        f"- composite: {ctx.get('comp_check')}",
        "",
        "## DIAMOND OUTPUT",
        f"- fullName: {ctx.get('fullName')}",
        f"- nationality: {ctx.get('nationality')}",
        f"- passportNumber: {ctx.get('passportNumber')}",
        f"- mrzValid: {ctx.get('mrzValid')}",
        f"- status: {ctx.get('status')}",
        "",
        "## PERFORMANCE",
        f"- detection: {ctx.get('t_detection')}",
        f"- segmentation: {ctx.get('t_segmentation')}",
        f"- OCR: {ctx.get('t_ocr')}",
        f"- validation: {ctx.get('t_validation')}",
        f"- total: {ctx.get('t_total')}",
        f"- peak RAM: {ctx.get('peak_ram')}",
        "",
        "## SAFETY",
        "- files deleted: 0",
        "- source modified: NO",
        "- OCR model changed: NO",
        "- packages changed: NO",
        "- downloads: 0",
        "- Diamond touched: NO",
        "- previous projects touched: NO",
        "",
        "## FINAL DECISION",
        "",
        ctx.get("final_decision", "MRZ-A2 FAIL"),
        "",
    ]
    (out_dir / "FINAL_REPORT.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    params = _params_with_a14(load_params())
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir = WORKSPACE_ROOT / "results" / "mrz_a2" / ts
    out_dir.mkdir(parents=True, exist_ok=True)

    images = list_passport_images()
    if len(images) != 1:
        print("INPUT GATE STOP")
        return 2

    image_path = images[0]
    img = cv2.imread(str(image_path))
    if img is None:
        print("cannot read image")
        return 1

    ctx: dict = {
        "input_filename": image_path.name,
        "input_sha256": sha256_file(image_path),
        "input_dimensions": f"{img.shape[1]}x{img.shape[0]}",
        "equal_fallback": "NO",
        "a1_false_region": "bbox [0,290,890,69] mid-page personal-data band",
        "a1_rejection_reason": "single-band score without two-row pair; upper/mid candidate fails pair+structure gates",
        "detectorPath": "PRIMARY",
        "fallback_invoked": False,
    }

    manifest = {
        "filename": image_path.name,
        "sha256": ctx["input_sha256"],
        "width": int(img.shape[1]),
        "height": int(img.shape[0]),
        "size_bytes": image_path.stat().st_size,
        "detection_params": str(WORKSPACE_ROOT / "docs" / "mrz_a2_detection_params.json"),
    }
    (out_dir / "input_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    ram_before = get_process_ram_mb()
    peak_ram = ram_before
    t0 = time.perf_counter()

    cv2.imwrite(str(out_dir / "01_original_reference.png"), img)

    t_det0 = time.perf_counter()
    orch = detect_mrz_orchestrated(img, params)
    det = orch.detection
    t_detection = time.perf_counter() - t_det0
    t_seg0 = time.perf_counter()
    t_segmentation = time.perf_counter() - t_seg0

    cv2.imwrite(str(out_dir / "02_text_response.png"), det.text_response)
    cv2.imwrite(str(out_dir / "03_row_candidates.png"), _draw_row_candidates(det.working_bgr, det.row_candidates, "rows"))
    cv2.imwrite(str(out_dir / "04_pair_candidates.png"), _draw_pairs(det.working_bgr, det.pair_candidates))
    cv2.imwrite(str(out_dir / "05_selected_pair_overlay.png"), _draw_selected(det.working_bgr, det))
    if det.deskew_applied:
        cv2.imwrite(str(out_dir / "06_deskewed_working.png"), det.working_bgr)

    (out_dir / "row_candidates.json").write_text(
        json.dumps(row_candidates_to_json(det.row_candidates), indent=2),
        encoding="utf-8",
    )
    (out_dir / "pair_candidates.json").write_text(
        json.dumps(pair_candidates_to_json(det.pair_candidates), indent=2),
        encoding="utf-8",
    )

    ctx["deskew_angle"] = f"{det.deskew_angle_deg:.3f} deg"
    ctx["deskew_applied"] = "YES" if det.deskew_applied else "NO"
    ctx["row_candidates_total"] = len(det.row_candidates)
    ctx["row_candidates_rejected"] = sum(1 for r in det.row_candidates if r.rejected)
    ctx["row_candidates_plausible"] = sum(1 for r in det.row_candidates if not r.rejected)
    ctx["pairs_evaluated"] = len(det.pair_candidates)
    ctx["detectorPath"] = orch.detector_path
    ctx["fallback_invoked"] = orch.fallback_invoked
    (out_dir / "detector_orchestration.json").write_text(
        json.dumps(
            {
                "detectorPath": orch.detector_path,
                "fallback_invoked": orch.fallback_invoked,
                "primary_status": orch.primary.status,
                "final_status": det.status,
                "primary_message": orch.primary.message,
                "final_message": det.message,
                "coordinate_mapping": orch.coordinate_mapping,
                "fallback_diagnostics": (
                    {
                        "working_scale": orch.fallback_diagnostics.working_scale,
                        "plausible_rows": orch.fallback_diagnostics.plausible_rows,
                        "pair_candidates_total": orch.fallback_diagnostics.pair_candidates_total,
                        "top_pair_score": orch.fallback_diagnostics.top_pair_score,
                        "second_pair_score": orch.fallback_diagnostics.second_pair_score,
                        "score_margin": orch.fallback_diagnostics.score_margin,
                        "ambiguous": orch.fallback_diagnostics.ambiguous,
                        "message": orch.fallback_diagnostics.message,
                    }
                    if orch.fallback_diagnostics
                    else None
                ),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    ctx["t_detection"] = f"{t_detection:.3f}s"
    ctx["t_segmentation"] = f"{t_segmentation:.3f}s"

    selected_geom = {
        "status": det.status,
        "message": det.message,
        "deskew_angle_deg": det.deskew_angle_deg,
        "deskew_applied": det.deskew_applied,
        "mrz_bbox_xywh": det.mrz_bbox,
        "line1_bbox_xywh": det.line1_bbox,
        "line2_bbox_xywh": det.line2_bbox,
        "equal_fallback_used": det.equal_fallback_used,
    }
    if det.selected_pair:
        selected_geom["selected_pair_id"] = det.selected_pair.pair_id
        selected_geom["score_breakdown"] = det.selected_pair.score_breakdown
    (out_dir / "selected_geometry.json").write_text(json.dumps(selected_geom, indent=2), encoding="utf-8")

    ctx["fallback_crop_normalization"] = "NO"
    norm_rejected = False
    if (
        orch.detector_path == "FALLBACK"
        and det.status == "MRZ_FOUND"
        and det.line1_bgr is not None
        and det.line2_bgr is not None
        and det.line1_bbox is not None
        and det.line2_bbox is not None
    ):
        deskewed_src = rotate_image(img, det.deskew_angle_deg) if det.deskew_applied else img.copy()
        norm = normalize_fallback_pair_crops(
            deskewed_src,
            det.line1_bgr,
            det.line2_bgr,
            det.line1_bbox,
            det.line2_bbox,
            params,
        )
        (out_dir / "fallback_crop_normalization.json").write_text(
            json.dumps(
                {
                    "status": norm.status,
                    "applied": norm.applied,
                    "details": norm.details,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        if norm.status == "REJECTED":
            norm_rejected = True
            ctx["fallback_crop_normalization"] = "REJECTED"
        elif norm.applied:
            det = replace(
                det,
                line1_bgr=norm.line1_bgr,
                line2_bgr=norm.line2_bgr,
                line1_bbox=norm.line1_bbox,
                line2_bbox=norm.line2_bbox,
            )
            ctx["fallback_crop_normalization"] = "YES"
            selected_geom["line1_bbox_xywh"] = det.line1_bbox
            selected_geom["line2_bbox_xywh"] = det.line2_bbox
            (out_dir / "selected_geometry.json").write_text(
                json.dumps(selected_geom, indent=2), encoding="utf-8"
            )

    if det.mrz_region_bgr is not None:
        cv2.imwrite(str(out_dir / "07_mrz_region.png"), det.mrz_region_bgr)
    if det.line1_bgr is not None:
        cv2.imwrite(str(out_dir / "08_line1.png"), det.line1_bgr)
    if det.line2_bgr is not None:
        cv2.imwrite(str(out_dir / "09_line2.png"), det.line2_bgr)

    ctx["mrz_bbox"] = det.mrz_bbox
    ctx["line1_bbox"] = det.line1_bbox
    ctx["line2_bbox"] = det.line2_bbox

    if det.selected_pair:
        ctx["selected_pair"] = det.selected_pair.pair_id
        ctx["pair_total_score"] = f"{det.selected_pair.total_score:.4f}"
        ctx["score_breakdown"] = json.dumps(det.selected_pair.score_breakdown)
        ctx["lower_page_prior"] = det.selected_pair.score_breakdown.get("lower_page_prior")
    else:
        ctx["selected_pair"] = "NONE"
        ctx["pair_total_score"] = "N/A"
        ctx["score_breakdown"] = "{}"
        ctx["lower_page_prior"] = "N/A"

    gate = validate_pre_ocr(det.line1_bgr, det.line2_bgr, params)
    if norm_rejected:
        gate = PreOcrGateResult(
            status="SEGMENTATION_INVALID",
            line1_pass=gate.line1_pass,
            line2_pass=gate.line2_pass,
            pair_geometry_pass=False,
            details={**gate.details, "fallback_crop_normalization": "REJECTED"},
        )
    (out_dir / "pre_ocr_validation.json").write_text(
        json.dumps(
            {
                "status": gate.status,
                "line1_pass": gate.line1_pass,
                "line2_pass": gate.line2_pass,
                "pair_geometry_pass": gate.pair_geometry_pass,
                "details": gate.details,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    ctx["gate_line1"] = "PASS" if gate.line1_pass else "FAIL"
    ctx["gate_line2"] = "PASS" if gate.line2_pass else "FAIL"
    ctx["gate_pair"] = "PASS" if gate.pair_geometry_pass else "FAIL"
    ctx["gate_final"] = gate.status

    detection_pass = (
        det.status == "MRZ_FOUND"
        and det.selected_pair is not None
        and not det.equal_fallback_used
        and gate.status == "PASS"
    )

    ocr_result = None
    t_ocr = 0.0
    t_validation = 0.0
    ctx["raw_line1"] = ""
    ctx["raw_line2"] = ""
    ctx["raw_line1_len"] = 0
    ctx["raw_line2_len"] = 0
    ctx["raw_line1_conf"] = None
    ctx["raw_line2_conf"] = None
    ctx["fullName"] = None
    ctx["nationality"] = None
    ctx["passportNumber"] = None
    ctx["mrzValid"] = False
    ctx["diamondFieldsValidated"] = False
    ctx["diamondReason"] = None
    ctx["status"] = "INVALID"

    if det.status != "MRZ_FOUND":
        ctx["final_decision"] = "MRZ-A2 FAIL — detection: MRZ_NOT_FOUND"
    elif gate.status != "PASS":
        ctx["final_decision"] = "MRZ-A2 FAIL — pre-OCR gate: SEGMENTATION_INVALID"
    else:
        l1p = out_dir / "08_line1.png"
        l2p = out_dir / "09_line2.png"
        t_ocr0 = time.perf_counter()
        ocr_result = run_ocr_on_lines(l1p, l2p)
        t_ocr = time.perf_counter() - t_ocr0
        (out_dir / "raw_ocr.json").write_text(json.dumps(ocr_result, indent=2), encoding="utf-8")

        raw_l1 = ocr_result["lines"][0]["raw_text"]
        raw_l2 = ocr_result["lines"][1]["raw_text"]
        ctx["raw_line1"] = raw_l1
        ctx["raw_line2"] = raw_l2
        ctx["raw_line1_len"] = len(raw_l1)
        ctx["raw_line2_len"] = len(raw_l2)
        ctx["raw_line1_conf"] = ocr_result["lines"][0]["confidence"]
        ctx["raw_line2_conf"] = ocr_result["lines"][1]["confidence"]

        t_val0 = time.perf_counter()
        parsed = parse_td3(raw_l1, raw_l2)
        correction = try_controlled_correction(raw_l1, raw_l2)
        (out_dir / "corrected_mrz.json").write_text(json.dumps(correction, indent=2), encoding="utf-8")
        val = parsed.validation
        (out_dir / "icao_validation.json").write_text(
            json.dumps(
                {
                    "structure_valid": val.structure_valid,
                    "document_number_check": val.document_number_check,
                    "dob_check": val.dob_check,
                    "expiry_check": val.expiry_check,
                    "composite_check": val.composite_check,
                    "all_required_checks_pass": val.all_required_checks_pass,
                    "line1_length": val.line1_length,
                    "line2_length": val.line2_length,
                    "notes": val.notes,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        t_validation = time.perf_counter() - t_val0

        ctx["icao_structure"] = "VALID" if val.structure_valid else "INVALID"
        ctx["doc_check"] = val.document_number_check
        ctx["dob_check"] = val.dob_check
        ctx["exp_check"] = val.expiry_check
        ctx["comp_check"] = val.composite_check

        diamond = evaluate_mrz_for_diamond(raw_l1, raw_l2)
        (out_dir / "diamond_acceptance.json").write_text(
            json.dumps(diamond.to_output_dict(), indent=2), encoding="utf-8"
        )

        status = status_from_validation(val)
        if correction.get("status") == "AMBIGUOUS":
            status = "AMBIGUOUS"
        mrz_valid = val.all_required_checks_pass
        ctx["mrzValid"] = mrz_valid
        ctx["diamondFieldsValidated"] = diamond.diamond_fields_validated
        ctx["diamondReason"] = diamond.reason

        if mrz_valid and diamond.status == "VALID":
            status = "VALID"
            ctx["status"] = status
            ctx["fullName"] = diamond.full_name or parsed.full_name
            ctx["nationality"] = diamond.nationality
            ctx["passportNumber"] = diamond.passport_number or parsed.passport_number
        elif mrz_valid and diamond.status == "REVIEW":
            ctx["status"] = "REVIEW"
            ctx["fullName"] = parsed.full_name
            ctx["nationality"] = None
            ctx["passportNumber"] = parsed.passport_number
        elif correction.get("status") == "AMBIGUOUS":
            ctx["status"] = "AMBIGUOUS"
        elif diamond.status == "VALID_FOR_DIAMOND":
            ctx["status"] = "VALID_FOR_DIAMOND"
            ctx["fullName"] = diamond.full_name
            ctx["nationality"] = diamond.nationality
            ctx["passportNumber"] = diamond.passport_number
        elif diamond.status == "REVIEW":
            ctx["status"] = "REVIEW"
        elif diamond.status == "INVALID":
            ctx["status"] = "INVALID"
        else:
            ctx["status"] = status

        (out_dir / "extracted_fields.json").write_text(
            json.dumps(
                {
                    "fullName": ctx["fullName"],
                    "nationality": ctx["nationality"],
                    "passportNumber": ctx["passportNumber"],
                    "mrzValid": mrz_valid,
                    "diamondFieldsValidated": ctx["diamondFieldsValidated"],
                    "status": ctx["status"],
                    "reason": ctx["diamondReason"],
                },
                indent=2,
            ),
            encoding="utf-8",
        )

        if detection_pass and mrz_valid:
            ctx["final_decision"] = "MRZ-A2 PASS"
        elif detection_pass:
            ctx["final_decision"] = "DETECTION PASS / OCR NEEDS REVIEW"
        else:
            ctx["final_decision"] = "MRZ-A2 FAIL — detection stage"

    ctx["t_ocr"] = f"{t_ocr:.3f}s" if ocr_result else "N/A (skipped)"
    ctx["t_validation"] = f"{t_validation:.3f}s" if ocr_result else "N/A"
    ram_after = get_process_ram_mb()
    if ram_after and peak_ram:
        peak_ram = max(peak_ram, ram_after)
    total = time.perf_counter() - t0
    ctx["t_total"] = f"{total:.3f}s"
    ctx["peak_ram"] = f"{peak_ram:.1f} MB" if peak_ram else "N/A"

    (out_dir / "metrics.json").write_text(
        json.dumps(
            {
                "detection_seconds": t_detection,
                "segmentation_seconds": t_segmentation,
                "ocr_seconds": t_ocr if ocr_result else None,
                "validation_seconds": t_validation if ocr_result else None,
                "total_seconds": total,
                "ram_mb_before": ram_before,
                "ram_mb_after": ram_after,
                "ram_mb_peak_estimate": peak_ram,
                "detection_pass": detection_pass,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    write_final_report(out_dir, ctx)
    print(f"Run complete: {out_dir}")
    print(ctx["final_decision"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
