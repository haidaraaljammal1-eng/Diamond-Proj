"""Conservative TD3 MRZ fallback detector (MRZ-A11) — structural, OCR-independent."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from mrz_fallback_crop_assign import resolve_td3_line_rows_for_crops
from mrz_fallback_row_core_crop import refine_fallback_pair_row_crops
from mrz_fallback_line_structure import apply_orphan_band_filter, apply_partial_width_rejection
from mrz_detect_td3 import (
    PairCandidate,
    RowCandidate,
    TD3DetectionResult,
    _clamp,
    _crop_with_padding,
    estimate_skew_angle,
    load_params,
    rotate_image,
)

WORKSPACE = Path(__file__).resolve().parent.parent
DEFAULT_FALLBACK_PARAMS = WORKSPACE / "docs" / "mrz_a11_fallback_params.json"


def load_fallback_params(path: Path | None = None) -> dict[str, Any]:
    p = path or DEFAULT_FALLBACK_PARAMS
    with open(p, encoding="utf-8") as f:
        return json.load(f)


@dataclass
class FallbackDiagnostics:
    working_scale: float
    working_wh: tuple[int, int]
    original_wh: tuple[int, int]
    response_names: list[str]
    row_candidates_total: int
    plausible_rows: int
    pair_candidates_total: int
    top_pair_score: float | None
    second_pair_score: float | None
    score_margin: float | None
    ambiguous: bool
    message: str
    response_images: dict[str, np.ndarray] = field(default_factory=dict)
    gate_summary: dict[str, Any] = field(default_factory=dict)


def _scale_working_copy(bgr: np.ndarray, fb: dict) -> tuple[np.ndarray, float]:
    h, w = bgr.shape[:2]
    long_edge = max(h, w)
    target = fb["working_copy"]["min_long_edge_px"]
    scale = max(1.0, target / long_edge)
    if abs(scale - 1.0) < 1e-6:
        return bgr.copy(), 1.0
    nw = max(1, int(round(w * scale)))
    nh = max(1, int(round(h * scale)))
    interp = cv2.INTER_CUBIC
    return cv2.resize(bgr, (nw, nh), interpolation=interp), scale


def _clahe_grid(min_dim: int, fb: dict) -> int:
    r = fb["responses"]
    g = int(min_dim * r["clahe_grid_frac_of_min_dim"])
    g = max(r["clahe_grid_min"], min(r["clahe_grid_max"], g))
    return max(2, g)


def build_fallback_responses(gray: np.ndarray, fb: dict) -> dict[str, np.ndarray]:
    h, w = gray.shape[:2]
    r = fb["responses"]
    grid = _clahe_grid(min(h, w), fb)
    clahe = cv2.createCLAHE(clipLimit=r["clahe_clip"], tileGridSize=(grid, grid))
    g = clahe.apply(gray)

    bs = max(r["adaptive_block_min"], int(w * r["adaptive_block_frac_of_width"]) | 1)
    if bs % 2 == 0:
        bs += 1
    adapt = cv2.adaptiveThreshold(
        g, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, bs, r["adaptive_c"]
    )

    ow = max(r["horizontal_open_min_w"], int(w * r["horizontal_open_width_frac"]) | 1)
    oh = max(r["horizontal_open_min_h"], int(h * r["horizontal_open_height_frac"]) | 1)
    k_open = cv2.getStructuringElement(cv2.MORPH_RECT, (ow, oh))
    opened = cv2.morphologyEx(adapt, cv2.MORPH_OPEN, k_open, iterations=1)

    grad_x = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
    grad_x = np.abs(grad_x)
    grad_u8 = cv2.normalize(grad_x, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    _, grad_bw = cv2.threshold(grad_u8, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    grad_open = cv2.morphologyEx(grad_bw, cv2.MORPH_OPEN, k_open, iterations=1)

    return {
        "adaptive_inv": adapt,
        "adaptive_opened": opened,
        "gradient_opened": grad_open,
    }


def _row_structure_metrics(roi_gray: np.ndarray, gates: dict) -> dict[str, Any]:
    _, bw = cv2.threshold(roi_gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    n_labels, _, stats, _ = cv2.connectedComponentsWithStats(bw, connectivity=8)
    rh, rw = roi_gray.shape[:2]
    comps = []
    for i in range(1, n_labels):
        x, y, cw, ch, area = stats[i]
        if area < 4 or ch < rh * 0.12 or cw > rw * 0.3:
            continue
        comps.append((x, cw, ch))
    comp_count = len(comps)
    if comp_count < 2:
        return {"component_count": comp_count, "regularity": 0.0, "passes_structure": False}
    heights = [c[2] for c in comps]
    mean_h = float(np.mean(heights))
    height_cv = float(np.std(heights) / mean_h) if mean_h > 0 else 1.0
    xs = sorted(c[0] + c[1] / 2 for c in comps)
    spacings = [xs[i + 1] - xs[i] for i in range(len(xs) - 1)]
    if len(spacings) >= 2:
        med = float(np.median(spacings))
        reg = 1.0 - min(1.0, float(np.std(spacings)) / (med + 1e-6))
    else:
        reg = 0.0
    passes = (
        comp_count >= gates["min_component_count"]
        and height_cv <= gates["max_internal_height_cv"]
        and reg >= gates["min_spacing_regularity"]
    )
    return {
        "component_count": comp_count,
        "regularity": max(0.0, reg),
        "height_cv": height_cv,
        "passes_structure": passes,
    }


def _projection_band_candidates(gray: np.ndarray, binary: np.ndarray, fb: dict) -> list[tuple[int, int, int, int]]:
    h, w = binary.shape[:2]
    pb = fb["projection_bands"]
    sk = max(pb["smooth_kernel_min"], int(h * pb["smooth_kernel_frac_h"]) | 1)
    if sk % 2 == 0:
        sk += 1
    row_ink = (binary > 0).sum(axis=1).astype(np.float32)
    if sk > 1:
        row_ink = cv2.GaussianBlur(row_ink.reshape(-1, 1), (1, sk), 0).reshape(-1)
    lower = row_ink[int(h * 0.35) :]
    if lower.size == 0:
        return []
    thr = float(np.median(lower) + pb["ink_threshold_sigma"] * np.std(lower))
    min_bh = max(2, int(h * pb["min_band_height_frac"]))
    max_bh = max(min_bh + 1, int(h * pb["max_band_height_frac"]))
    bands: list[tuple[int, int, int, int]] = []
    y = 0
    while y < h:
        if row_ink[y] < thr:
            y += 1
            continue
        y0 = y
        while y < h and row_ink[y] >= thr:
            y += 1
        y1 = y
        bh = y1 - y0
        if bh < min_bh or bh > max_bh:
            continue
        slice_bin = binary[y0:y1, :]
        cols = np.where(slice_bin.sum(axis=0) > 0)[0]
        if cols.size == 0:
            continue
        x0, x1 = int(cols[0]), int(cols[-1]) + 1
        bw = x1 - x0
        if bw < w * pb["min_band_width_frac"]:
            continue
        area_frac = (bw * bh) / (w * h)
        if area_frac > pb["max_band_area_frac"]:
            continue
        bands.append((x0, y0, bw, bh))
    return bands


def _contour_band_candidates(binary: np.ndarray, w_img: int, h_img: int, gates: dict) -> list[tuple[int, int, int, int]]:
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out: list[tuple[int, int, int, int]] = []
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        if w <= 0 or h <= 0:
            continue
        area_frac = (w * h) / (w_img * h_img)
        if area_frac > gates["max_single_blob_area_frac"]:
            continue
        aspect = w / max(h, 1)
        if aspect < gates["min_aspect_ratio"]:
            continue
        if h < h_img * gates["min_height_frac"] or h > h_img * gates["max_height_frac"]:
            continue
        if w < w_img * gates["min_width_frac"]:
            continue
        out.append((x, y, w, h))
    return out


def _sort_band_boxes_bottom_up(band_boxes: list[tuple[int, int, int, int]]) -> list[tuple[int, int, int, int]]:
    """Enumerate horizontal bands from lowest Y (page bottom) upward."""
    return sorted(band_boxes, key=lambda b: b[1] + b[3], reverse=True)


def _lower_page_context(center_y_frac: float, fb: dict) -> dict:
    bu = fb.get("bottom_up") or {}
    thr = float(bu.get("lower_page_structure_relax_min_center_y_frac", 0.62))
    return {
        "is_lower_page": center_y_frac >= thr,
        "center_y_frac": center_y_frac,
        "max_ink": float(bu.get("lower_page_max_ink_density", 0.72)),
        "ink_relax_horiz": float(bu.get("lower_page_min_horizontal_coverage_for_ink_relax", 0.85)),
        "struct_relax_comps": int(bu.get("lower_page_min_components_for_structure_relax", 12)),
        "struct_relax_horiz": float(bu.get("lower_page_min_horizontal_coverage_for_structure_relax", 0.35)),
    }


def _make_row_candidates(
    working_bgr: np.ndarray,
    band_boxes: list[tuple[int, int, int, int]],
    fb: dict,
) -> list[RowCandidate]:
    gray = cv2.cvtColor(working_bgr, cv2.COLOR_BGR2GRAY)
    h_img, w_img = working_bgr.shape[:2]
    gates = fb["row_gates"]
    rows: list[RowCandidate] = []
    seen: set[tuple[int, int, int, int]] = set()
    rid = 0
    for x, y, w, h in band_boxes:
        key = (x // 2, y // 2, w // 2, h // 2)
        if key in seen:
            continue
        seen.add(key)
        aspect = w / max(h, 1)
        area_frac = (w * h) / (w_img * h_img)
        roi = gray[y : y + h, x : x + w]
        _, inv = cv2.threshold(roi, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        ink = float(inv.sum()) / (255.0 * max(w * h, 1))
        horiz = float(np.count_nonzero(inv.sum(axis=0) > 0)) / max(w, 1)
        struct = _row_structure_metrics(roi, gates)
        center_y_frac = (y + h / 2) / h_img
        lp_ctx = _lower_page_context(center_y_frac, fb)
        rejected = False
        reason = ""
        if area_frac > gates["max_single_blob_area_frac"]:
            rejected, reason = True, "solid_blob"
        elif h > h_img * gates["max_height_frac"] or h < h_img * gates["min_height_frac"]:
            rejected, reason = True, "bad_height"
        elif w < w_img * gates["min_width_frac"]:
            rejected, reason = True, "too_narrow"
        elif aspect < gates["min_aspect_ratio"]:
            rejected, reason = True, "bad_aspect"
        elif ink < gates["min_ink_density"]:
            rejected, reason = True, "bad_ink_density"
        elif ink > gates["max_ink_density"]:
            if (
                lp_ctx["is_lower_page"]
                and ink <= lp_ctx["max_ink"]
                and horiz >= lp_ctx["ink_relax_horiz"]
            ):
                pass
            else:
                rejected, reason = True, "bad_ink_density"
        elif horiz < gates["min_horizontal_coverage_frac"]:
            rejected, reason = True, "low_horizontal_coverage"
        elif struct["component_count"] < gates["min_component_count"]:
            rejected, reason = True, "few_components"
        elif not struct.get("passes_structure", False):
            if (
                lp_ctx["is_lower_page"]
                and struct["component_count"] >= lp_ctx["struct_relax_comps"]
                and horiz >= lp_ctx["struct_relax_horiz"]
                and struct.get("height_cv", 99) <= gates["max_internal_height_cv"]
            ):
                pass
            else:
                rejected, reason = True, "character_structure_fail"
        rows.append(
            RowCandidate(
                row_id=rid,
                x=x,
                y=y,
                w=w,
                h=h,
                angle_deg=0.0,
                ink_density=ink,
                component_count=struct["component_count"],
                horizontal_coverage=horiz,
                rejected=rejected,
                reject_reason=reason,
                metrics={
                    **struct,
                    "aspect_ratio": aspect,
                    "area_frac": area_frac,
                    "center_y_frac": center_y_frac,
                    "lower_page_context": lp_ctx["is_lower_page"],
                },
            )
        )
        rid += 1
    return rows


def _pair_score_fallback(a: RowCandidate, b: RowCandidate, img_h: int, fb: dict) -> dict[str, float] | None:
    pr = fb["pairing"]
    w = fb["scoring_weights"]
    top, bottom = (a, b) if a.y <= b.y else (b, a)
    gap = bottom.y - (top.y + top.h)
    if gap < 0:
        return None
    avg_h = (top.h + bottom.h) / 2.0
    if gap < avg_h * pr["min_gap_height_ratio"] or gap > avg_h * pr["max_gap_height_ratio"]:
        return None
    wr = min(top.w, bottom.w) / max(top.w, bottom.w)
    if wr < pr["min_width_ratio"]:
        return None
    hr = min(top.h, bottom.h) / max(top.h, bottom.h)
    if hr < pr["min_height_ratio"] or (top.h / max(bottom.h, 1)) > pr["max_height_ratio"]:
        return None
    x_overlap = max(0, min(top.x + top.w, bottom.x + bottom.w) - max(top.x, bottom.x))
    overlap_frac = x_overlap / max(min(top.w, bottom.w), 1)
    if overlap_frac < pr["min_x_overlap_frac"]:
        return None

    gap_score = 1.0 - min(1.0, abs(gap - avg_h * 0.35) / (avg_h * pr["max_gap_height_ratio"] + 1e-6))
    reg = (top.metrics.get("regularity", 0) + bottom.metrics.get("regularity", 0)) / 2.0
    cov = (top.horizontal_coverage + bottom.horizontal_coverage) / 2.0
    text_struct = min(1.0, (top.component_count + bottom.component_count) / 40.0)
    pair_cy = (top.y + top.h + bottom.y) / 2.0
    lower_prior = pair_cy / img_h
    breakdown = {
        "width_similarity": wr,
        "height_similarity": hr,
        "horizontal_alignment": overlap_frac,
        "vertical_gap": gap_score,
        "component_regularity": reg,
        "horizontal_coverage": cov,
        "text_structure": text_struct,
        "lower_page_prior": lower_prior,
    }
    total = sum(breakdown[k] * w[k] for k in w)
    breakdown["total_pair_score"] = total
    return breakdown


def _find_pairs(rows: list[RowCandidate], img_h: int, fb: dict) -> list[PairCandidate]:
    valid = [r for r in rows if not r.rejected]
    if len(valid) < 2:
        return []
    bu = fb.get("bottom_up") or {}
    prior_w = float(bu.get("pair_center_y_prior_weight", 0.12))
    min_score = float(fb["pairing"]["min_pair_total_score"])
    valid.sort(key=lambda r: r.y + r.h / 2, reverse=True)
    pairs: list[PairCandidate] = []
    pid = 0
    for i, lower_row in enumerate(valid):
        for upper_row in valid[i + 1 :]:
            bd = _pair_score_fallback(upper_row, lower_row, img_h, fb)
            if bd is None:
                continue
            top, bottom = (upper_row, lower_row) if upper_row.y <= lower_row.y else (lower_row, upper_row)
            pair_cy_norm = (top.y + top.h + bottom.y) / 2.0 / img_h
            bd = dict(bd)
            y_prior = pair_cy_norm * prior_w
            bd["bottom_up_y_prior"] = y_prior
            bd["total_pair_score"] = bd["total_pair_score"] + y_prior
            pairs.append(
                PairCandidate(
                    pair_id=pid,
                    row_a_id=upper_row.row_id,
                    row_b_id=lower_row.row_id,
                    score_breakdown=bd,
                    total_score=bd["total_pair_score"],
                    row_a=upper_row,
                    row_b=lower_row,
                )
            )
            pid += 1
        if pairs:
            best = max(pairs, key=lambda p: p.total_score)
            if best.total_score >= min_score:
                pairs.sort(key=lambda p: p.total_score, reverse=True)
                return pairs[: fb["pairing"]["max_pairs_to_evaluate"]]
    pairs.sort(key=lambda p: p.total_score, reverse=True)
    return pairs[: fb["pairing"]["max_pairs_to_evaluate"]]


def _select_pair_bottom_up(
    pairs: list[PairCandidate],
    plausible_count: int,
    fb: dict,
) -> tuple[PairCandidate | None, bool, str]:
    """Require two plausible rows; prefer credible lower-page pair (early success)."""
    pr = fb["pairing"]
    if plausible_count < 2:
        return None, False, "fallback: single row insufficient for TD3 pair"
    if not pairs:
        return None, False, "fallback: no pair above confidence gate"
    ranked = sorted(pairs, key=lambda p: p.total_score, reverse=True)
    top = ranked[0]
    second = ranked[1] if len(ranked) > 1 else None
    margin = top.total_score - second.total_score if second else top.total_score
    if top.total_score < pr["min_pair_total_score"]:
        return None, False, "fallback: no confident pair"
    if second and margin < pr["min_score_margin_over_second"]:
        return None, True, "AMBIGUOUS_MRZ_CANDIDATES"
    return top, False, f"fallback pair_id={top.pair_id} score={top.total_score:.4f}"


def _map_box_to_original(box: tuple[int, int, int, int], scale: float) -> tuple[int, int, int, int]:
    if scale == 1.0:
        return box
    x, y, w, h = box
    inv = 1.0 / scale
    return (
        int(round(x * inv)),
        int(round(y * inv)),
        max(1, int(round(w * inv))),
        max(1, int(round(h * inv))),
    )


def detect_td3_mrz_fallback(
    image_bgr: np.ndarray,
    primary_params: dict | None = None,
    fallback_params: dict | None = None,
) -> tuple[TD3DetectionResult, FallbackDiagnostics]:
    primary_params = primary_params or load_params()
    fb = fallback_params or load_fallback_params()
    orig_h, orig_w = image_bgr.shape[:2]

    gray0 = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    angle = estimate_skew_angle(gray0, primary_params)
    deskew_applied = abs(angle) >= primary_params["orientation"]["min_deskew_deg_to_apply"]
    deskewed = rotate_image(image_bgr, angle) if deskew_applied else image_bgr.copy()

    working, scale = _scale_working_copy(deskewed, fb)
    gray = cv2.cvtColor(working, cv2.COLOR_BGR2GRAY)
    responses = build_fallback_responses(gray, fb)

    band_boxes: list[tuple[int, int, int, int]] = []
    for name, resp in responses.items():
        band_boxes.extend(_projection_band_candidates(gray, resp, fb))
        band_boxes.extend(_contour_band_candidates(resp, working.shape[1], working.shape[0], fb["row_gates"]))

    band_boxes = _sort_band_boxes_bottom_up(band_boxes)

    rows = _make_row_candidates(working, band_boxes, fb)
    h_img = working.shape[0]
    w_img = working.shape[1]
    apply_partial_width_rejection(rows, w_img, fb)
    plausible = [r for r in rows if not r.rejected]
    pairs_pre = _find_pairs(rows, h_img, fb)
    structure_notes = apply_orphan_band_filter(rows, pairs_pre, fb)
    plausible = [r for r in rows if not r.rejected]
    pairs = _find_pairs(rows, h_img, fb)

    pr = fb["pairing"]
    plausible_count = len(plausible)
    selected, ambiguous, sel_msg = _select_pair_bottom_up(pairs, plausible_count, fb)
    top_score = selected.total_score if selected else (pairs[0].total_score if pairs else None)
    second_score = None
    margin = None
    if pairs:
        ranked = sorted(pairs, key=lambda p: p.total_score, reverse=True)
        if selected and len(ranked) > 1:
            second_score = ranked[1].total_score if ranked[0] is selected else ranked[0].total_score
            margin = selected.total_score - (second_score or 0)
        elif len(ranked) > 1:
            second_score = ranked[1].total_score
            margin = ranked[0].total_score - second_score

    status = "MRZ_NOT_FOUND"
    msg = sel_msg
    if ambiguous:
        status = "MRZ_NOT_FOUND"
        msg = "AMBIGUOUS_MRZ_CANDIDATES"
    elif selected:
        status = "MRZ_FOUND"
        msg = sel_msg

    lp = primary_params["line_crop_padding"]
    rp = primary_params["region_padding"]
    line1 = line2 = mrz_region = None
    l1_bb = l2_bb = mrz_bb = None
    row_core_notes: dict[str, Any] | None = None

    if selected:
        line1_row, line2_row = resolve_td3_line_rows_for_crops(selected, rows, fb)
        # Map to deskewed-original coordinates then crop from deskewed (OCR source = original orientation)
        def crop_orig(row: RowCandidate):
            box_w = (row.x, row.y, row.w, row.h)
            box_o = _map_box_to_original(box_w, scale)
            return _crop_with_padding(deskewed, *box_o, lp)

        line1, l1_bb = crop_orig(line1_row)
        line2, l2_bb = crop_orig(line2_row)
        row_core_notes: dict[str, Any] = {}
        line1, l1_bb, line2, l2_bb, row_core_notes = refine_fallback_pair_row_crops(
            deskewed, line1, line2, l1_bb, l2_bb, fb
        )
        x0 = min(l1_bb[0], l2_bb[0])
        y0 = min(l1_bb[1], l2_bb[1])
        x1 = max(l1_bb[0] + l1_bb[2], l2_bb[0] + l2_bb[2])
        y1 = max(l1_bb[1] + l1_bb[3], l2_bb[1] + l2_bb[3])
        px = max(rp["min_x_px"], int((x1 - x0) * rp["x_frac"]))
        py = max(rp["min_y_px"], int((y1 - y0) * rp["y_frac"]))
        ih, iw = deskewed.shape[:2]
        rx0 = _clamp(x0 - px, 0, iw - 1)
        ry0 = _clamp(y0 - py, 0, ih - 1)
        rx1 = _clamp(x1 + px, 1, iw)
        ry1 = _clamp(y1 + py, 1, ih)
        mrz_region = deskewed[ry0:ry1, rx0:rx1].copy()
        mrz_bb = (rx0, ry0, rx1 - rx0, ry1 - ry0)

    combined_vis = np.max(np.stack(list(responses.values()), axis=0), axis=0)
    diag = FallbackDiagnostics(
        working_scale=scale,
        working_wh=(working.shape[1], working.shape[0]),
        original_wh=(orig_w, orig_h),
        response_names=list(responses.keys()),
        row_candidates_total=len(rows),
        plausible_rows=sum(1 for r in rows if not r.rejected),
        pair_candidates_total=len(pairs),
        top_pair_score=top_score,
        second_pair_score=second_score,
        score_margin=margin,
        ambiguous=ambiguous,
        message=msg,
        response_images={**responses, "combined_max": combined_vis},
        gate_summary={
            "min_pair_score": pr["min_pair_total_score"],
            "min_margin": pr["min_score_margin_over_second"],
            "line_structure_notes": structure_notes,
            "bottom_up_discovery": True,
            "plausible_count": plausible_count,
            "row_core_crop": row_core_notes if selected else None,
        },
    )

    result = TD3DetectionResult(
        status=status,
        message=msg,
        working_bgr=working,
        deskew_angle_deg=angle,
        deskew_applied=deskew_applied,
        text_response=combined_vis,
        row_candidates=rows,
        pair_candidates=pairs,
        selected_pair=selected,
        mrz_region_bgr=mrz_region,
        line1_bgr=line1,
        line2_bgr=line2,
        line1_bbox=l1_bb,
        line2_bbox=l2_bb,
        mrz_bbox=mrz_bb,
        equal_fallback_used=False,
        params=primary_params,
        diagnostics={
            "fallback": True,
            "scale": scale,
            "line_structure_notes": structure_notes,
            "row_core_crop": row_core_notes if selected else None,
        },
    )
    return result, diag
