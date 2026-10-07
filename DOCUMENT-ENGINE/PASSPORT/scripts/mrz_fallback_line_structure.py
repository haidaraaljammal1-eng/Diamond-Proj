"""Generic fallback row structure analysis (MRZ-A16) — OCR-independent."""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np

from mrz_detect_td3 import RowCandidate


def load_line_structure_params(fb: dict) -> dict:
    defaults = {
        "min_row_width_frac": 0.58,
        "max_gap_above_line1_times_height": 1.05,
        "high_horizontal_coverage": 0.88,
        "low_regularity_line_like": 0.38,
        "min_component_count_text": 8,
    }
    cfg = dict(defaults)
    cfg.update(fb.get("line_structure") or {})
    return cfg


def analyze_row_pixels(roi_gray: np.ndarray) -> dict[str, Any]:
    _, inv = cv2.threshold(roi_gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    h, w = inv.shape[:2]
    max_run = 0
    long_runs = 0
    for y in range(h):
        x = 0
        while x < w:
            while x < w and inv[y, x] == 0:
                x += 1
            x0 = x
            while x < w and inv[y, x] > 0:
                x += 1
            run = x - x0
            max_run = max(max_run, run)
            if run >= int(0.75 * w):
                long_runs += 1
    proj = (inv > 0).sum(axis=1)
    vtrans = int(np.sum(np.abs(np.diff((proj > 0).astype(int)))))
    col_occ = float(np.count_nonzero(inv.sum(axis=0) > 0)) / max(w, 1)
    n_labels, _, stats, _ = cv2.connectedComponentsWithStats(inv, connectivity=8)
    comp_heights = []
    comp_widths = []
    for i in range(1, n_labels):
        if stats[i, cv2.CC_STAT_AREA] >= 4:
            comp_heights.append(int(stats[i, cv2.CC_STAT_HEIGHT]))
            comp_widths.append(int(stats[i, cv2.CC_STAT_WIDTH]))
    return {
        "max_horizontal_run_ratio": max_run / max(w, 1),
        "long_horizontal_runs_ge_75pct_width": long_runs,
        "vertical_transition_count": vtrans,
        "column_occupancy": col_occ,
        "component_count": len(comp_widths),
        "median_component_width": float(np.median(comp_widths)) if comp_widths else 0.0,
        "median_component_height": float(np.median(comp_heights)) if comp_heights else 0.0,
    }


def classify_row_structure(
    row: RowCandidate,
    pixel_metrics: dict[str, Any],
    img_w: int,
    cfg: dict,
) -> str:
    width_frac = row.w / max(img_w, 1)
    if width_frac < cfg["min_row_width_frac"]:
        return "LINE_LIKE_ARTIFACT"
    reg = float(row.metrics.get("regularity", 0.0))
    if row.horizontal_coverage >= cfg["high_horizontal_coverage"] and reg <= cfg["low_regularity_line_like"]:
        return "LINE_LIKE_ARTIFACT"
    if row.component_count >= cfg["min_component_count_text"]:
        return "TEXT_LIKE_ROW"
    if pixel_metrics["component_count"] >= cfg["min_component_count_text"]:
        return "TEXT_LIKE_ROW"
    return "MIXED"


def apply_partial_width_rejection(rows: list[RowCandidate], img_w: int, fb: dict) -> None:
    cfg = load_line_structure_params(fb)
    for row in rows:
        if row.rejected:
            continue
        if row.w / max(img_w, 1) < cfg["min_row_width_frac"]:
            row.rejected = True
            row.reject_reason = "partial_width_decorative"


def apply_orphan_band_filter(
    rows: list[RowCandidate],
    pairs: list[Any],
    fb: dict,
) -> list[str]:
    """Reject decorative bands above the core MRZ pair when top-2 pairs are score-ambiguous."""
    cfg = load_line_structure_params(fb)
    pr = fb["pairing"]
    if len(pairs) < 2:
        return []
    margin = pairs[0].total_score - pairs[1].total_score
    if margin >= pr["min_score_margin_over_second"]:
        return []
    p0, p1 = pairs[0], pairs[1]
    core = p0 if p0.score_breakdown.get("vertical_gap", 0) >= p1.score_breakdown.get("vertical_gap", 0) else p1
    top = core.row_a if core.row_a.y <= core.row_b.y else core.row_b
    max_gap = cfg["max_gap_above_line1_times_height"] * max(top.h, 1)
    reasons: list[str] = []
    for row in rows:
        if row.rejected:
            continue
        if row.row_id == top.row_id:
            continue
        if row.y + row.h >= top.y:
            continue
        gap = top.y - (row.y + row.h)
        if gap > max_gap:
            row.rejected = True
            row.reject_reason = "line_artifact_orphan_band_above_core_pair"
            reasons.append(
                f"ROW {row.row_id}: orphan band above core MRZ line "
                f"(gap={gap}px > {max_gap:.1f}px threshold)"
            )
    return reasons
