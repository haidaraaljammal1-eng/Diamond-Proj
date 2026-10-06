"""Pre-OCR geometric validation for MRZ line crops (MRZ-A2)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np


@dataclass
class PreOcrGateResult:
    status: str  # PASS | SEGMENTATION_INVALID
    line1_pass: bool
    line2_pass: bool
    pair_geometry_pass: bool
    details: dict[str, Any]


def _median_component_height(line_bgr: np.ndarray) -> float:
    gray = cv2.cvtColor(line_bgr, cv2.COLOR_BGR2GRAY)
    _, inv = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    n_labels, _, stats, _ = cv2.connectedComponentsWithStats(inv, connectivity=8)
    heights = [
        int(stats[i, cv2.CC_STAT_HEIGHT])
        for i in range(1, n_labels)
        if stats[i, cv2.CC_STAT_AREA] >= 4
    ]
    if not heights:
        return 0.0
    return float(np.median(heights))


def _line_metrics(line_bgr: np.ndarray, params: dict) -> dict[str, Any]:
    gray = cv2.cvtColor(line_bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]
    _, inv = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    ink = float(inv.sum()) / (255.0 * max(w * h, 1))
    n_labels, _, stats, _ = cv2.connectedComponentsWithStats(inv, connectivity=8)
    comp = 0
    for i in range(1, n_labels):
        if stats[i, cv2.CC_STAT_AREA] >= 4:
            comp += 1
    fg_std = float(np.std(gray))
    horiz = float(np.count_nonzero(inv.sum(axis=0) > 0)) / max(w, 1)
    return {
        "width": w,
        "height": h,
        "ink_density": ink,
        "component_count": comp,
        "foreground_std": fg_std,
        "horizontal_coverage": horiz,
    }


def validate_pre_ocr(
    line1_bgr: np.ndarray | None,
    line2_bgr: np.ndarray | None,
    params: dict,
) -> PreOcrGateResult:
    g = params["pre_ocr_gate"]
    details: dict[str, Any] = {"line1": {}, "line2": {}, "pair": {}}

    if line1_bgr is None or line2_bgr is None:
        return PreOcrGateResult(
            status="SEGMENTATION_INVALID",
            line1_pass=False,
            line2_pass=False,
            pair_geometry_pass=False,
            details={"error": "missing line crop"},
        )

    m1 = _line_metrics(line1_bgr, params)
    m2 = _line_metrics(line2_bgr, params)
    details["line1"] = m1
    details["line2"] = m2

    def line_ok(m: dict) -> bool:
        return (
            m["ink_density"] >= g["min_ink_density"]
            and m["component_count"] >= g["min_component_count"]
            and m["foreground_std"] >= g["min_foreground_std"]
            and m["horizontal_coverage"] >= 0.25
            and m["height"] >= 8
        )

    l1_ok = line_ok(m1)
    l2_ok = line_ok(m2)
    wr = min(m1["width"], m2["width"]) / max(m1["width"], m2["width"])
    pair_ok = wr >= (1.0 - g["max_width_ratio_diff"])

    fn = params.get("fallback_crop_normalization") or {}
    min_h_ratio = float(fn.get("min_pair_crop_height_ratio_after_gate", 0.7))
    min_glyph_ratio = float(fn.get("min_glyph_median_height_ratio_for_normalize", 0.55))
    h_ratio = min(m1["height"], m2["height"]) / max(m1["height"], m2["height"])
    med1 = _median_component_height(line1_bgr)
    med2 = _median_component_height(line2_bgr)
    glyph_ratio = min(med1, med2) / max(med1, med2) if max(med1, med2) > 0 else 0.0
    pair_height_ok = True
    if h_ratio < min_h_ratio and glyph_ratio >= min_glyph_ratio:
        pair_height_ok = False

    details["pair"] = {
        "width_ratio": wr,
        "min_width_frac_of_pair": g["min_width_frac_of_pair"],
        "crop_height_ratio_min_over_max": h_ratio,
        "glyph_median_height_ratio": glyph_ratio,
        "pair_crop_height_similarity_pass": pair_height_ok,
    }
    pair_ok = pair_ok and pair_height_ok

    if l1_ok and l2_ok and pair_ok:
        status = "PASS"
    else:
        status = "SEGMENTATION_INVALID"

    return PreOcrGateResult(
        status=status,
        line1_pass=l1_ok,
        line2_pass=l2_ok,
        pair_geometry_pass=pair_ok,
        details=details,
    )
