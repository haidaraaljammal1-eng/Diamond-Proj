"""Obtain line 2 crop from existing MRZ detection (no detector changes).

Line 1 images are used only for pre-OCR gate validation — never sent to the passport-number OCR recognizer.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any

import numpy as np

from mrz_detect_orchestrator import detect_mrz_orchestrated
from mrz_detect_td3 import load_params
from mrz_detect_td3_fallback import load_fallback_params
from mrz_fallback_crop_normalize import normalize_fallback_pair_crops
from mrz_pre_ocr_gate import validate_pre_ocr
from passport_number.line2_enrich import MIN_LINE2_HEIGHT_PX, enrich_line2_from_source
from run_mrz_a2 import _params_with_a14


@dataclass
class Line2CropContext:
    ok: bool
    line2_bgr: np.ndarray | None
    detector_path: str
    message: str
    failure_stage: str | None = None
    details: dict[str, Any] | None = None
    line2_candidates: list[dict[str, Any]] | None = None


def _line2_candidate(
    image_bgr: np.ndarray,
    line2_bgr: np.ndarray,
    line2_bbox: tuple[int, int, int, int],
    label: str,
    *,
    enrich: bool,
) -> dict[str, Any]:
    if enrich:
        bgr, meta = enrich_line2_from_source(image_bgr, line2_bgr, line2_bbox)
    else:
        bgr = line2_bgr.copy()
        meta = {"applied": False, "reason": "detector_crop"}
    return {"label": label, "line2_bgr": bgr, "line2_bbox": line2_bbox, "enrich": meta}


def obtain_line2_crop(image_bgr: np.ndarray) -> Line2CropContext:
    params = _params_with_a14(load_params())
    fb = load_fallback_params()
    orch = detect_mrz_orchestrated(image_bgr, params, fb)
    det = orch.detection

    if det.status != "MRZ_FOUND" or det.line2_bgr is None:
        return Line2CropContext(
            ok=False,
            line2_bgr=None,
            detector_path=orch.detector_path,
            message=det.message,
            failure_stage="A_MRZ_detection",
            line2_candidates=[],
        )

    work = det
    norm_applied = False
    norm_status = "SKIPPED"
    raw_gate = validate_pre_ocr(det.line1_bgr, det.line2_bgr, params)

    if orch.detector_path == "FALLBACK":
        norm = normalize_fallback_pair_crops(
            image_bgr,
            det.line1_bgr,
            det.line2_bgr,
            det.line1_bbox,
            det.line2_bbox,
            params,
        )
        norm_status = norm.status
        if norm.status == "REJECTED":
            if raw_gate.status != "PASS":
                return Line2CropContext(
                    ok=False,
                    line2_bgr=None,
                    detector_path=orch.detector_path,
                    message="fallback_crop_normalization_rejected",
                    failure_stage="B_line2_geometry",
                    details={
                        "pre_ocr_gate_raw": raw_gate.status,
                        "normalization_status": norm.status,
                    },
                    line2_candidates=[],
                )
        elif norm.applied:
            work = replace(
                det,
                line1_bgr=norm.line1_bgr,
                line2_bgr=norm.line2_bgr,
                line1_bbox=norm.line1_bbox,
                line2_bbox=norm.line2_bbox,
            )
            norm_applied = True

    gate = validate_pre_ocr(work.line1_bgr, work.line2_bgr, params)
    gate_pass = gate.status == "PASS"

    candidates: list[dict[str, Any]] = []
    primary = _line2_candidate(image_bgr, work.line2_bgr, work.line2_bbox, "primary", enrich=False)
    if work.line2_bgr.shape[0] < MIN_LINE2_HEIGHT_PX:
        enriched = _line2_candidate(
            image_bgr, work.line2_bgr, work.line2_bbox, "primary", enrich=True
        )
        primary["supplemental_enriched_line2"] = enriched["line2_bgr"]
        primary["enrich_meta"] = enriched["enrich"]
    candidates.append(primary)

    if orch.detector_path == "FALLBACK":
        raw_arr = det.line2_bgr
        norm_arr = work.line2_bgr
        if raw_gate.status == "PASS" and (
            raw_arr.shape != norm_arr.shape or not np.array_equal(raw_arr, norm_arr)
        ):
            alt = _line2_candidate(image_bgr, det.line2_bgr, det.line2_bbox, "fallback_raw", enrich=False)
            if alt["line2_bgr"].shape != primary["line2_bgr"].shape or not np.array_equal(
                alt["line2_bgr"], primary["line2_bgr"]
            ):
                if det.line2_bgr.shape[0] < MIN_LINE2_HEIGHT_PX:
                    alt_en = _line2_candidate(
                        image_bgr, det.line2_bgr, det.line2_bbox, "fallback_raw", enrich=True
                    )
                    alt["supplemental_enriched_line2"] = alt_en["line2_bgr"]
                candidates.append(alt)

    primary_line2 = primary["line2_bgr"].copy()

    return Line2CropContext(
        ok=gate_pass,
        line2_bgr=primary_line2,
        detector_path=orch.detector_path,
        message=gate.status if not gate_pass else "line2_ready",
        failure_stage=None if gate_pass else "B_line2_geometry",
        details={
            "line2_wh": [int(primary_line2.shape[1]), int(primary_line2.shape[0])],
            "line2_bbox": work.line2_bbox,
            "normalization_applied": norm_applied,
            "normalization_status": norm_status,
            "pre_ocr_gate": gate.status,
            "pre_ocr_gate_raw": raw_gate.status if orch.detector_path == "FALLBACK" else None,
            "line2_available_for_focused_ocr": True,
        },
        line2_candidates=candidates,
    )
