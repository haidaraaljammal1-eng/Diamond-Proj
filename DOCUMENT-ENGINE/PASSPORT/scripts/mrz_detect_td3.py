"""Structural TD3 MRZ pair detection (MRZ-A2) — OpenCV only, no fallbacks."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import cv2
import numpy as np

WORKSPACE = Path(__file__).resolve().parent.parent
DEFAULT_PARAMS_PATH = WORKSPACE / "docs" / "mrz_a2_detection_params.json"


def load_params(path: Path | None = None) -> dict[str, Any]:
    p = path or DEFAULT_PARAMS_PATH
    with open(p, encoding="utf-8") as f:
        return json.load(f)


@dataclass
class RowCandidate:
    row_id: int
    x: int
    y: int
    w: int
    h: int
    angle_deg: float
    ink_density: float
    component_count: int
    horizontal_coverage: float
    rejected: bool
    reject_reason: str = ""
    metrics: dict[str, Any] = field(default_factory=dict)


@dataclass
class PairCandidate:
    pair_id: int
    row_a_id: int
    row_b_id: int
    score_breakdown: dict[str, float]
    total_score: float
    row_a: RowCandidate
    row_b: RowCandidate


@dataclass
class TD3DetectionResult:
    status: str  # MRZ_FOUND | MRZ_NOT_FOUND
    message: str
    working_bgr: np.ndarray
    deskew_angle_deg: float
    deskew_applied: bool
    text_response: np.ndarray
    row_candidates: list[RowCandidate]
    pair_candidates: list[PairCandidate]
    selected_pair: PairCandidate | None
    mrz_region_bgr: np.ndarray | None
    line1_bgr: np.ndarray | None
    line2_bgr: np.ndarray | None
    line1_bbox: tuple[int, int, int, int] | None
    line2_bbox: tuple[int, int, int, int] | None
    mrz_bbox: tuple[int, int, int, int] | None
    equal_fallback_used: bool
    params: dict[str, Any]
    diagnostics: dict[str, Any] = field(default_factory=dict)


def _clamp(v: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, v))


def estimate_skew_angle(gray: np.ndarray, params: dict) -> float:
    h, w = gray.shape[:2]
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    thresh = max(int(w * params["orientation"]["hough_threshold_frac_of_width"]), 30)
    lines = cv2.HoughLines(edges, 1, np.pi / 180, thresh)
    if lines is None:
        return 0.0
    angles: list[float] = []
    for ln in lines[:80]:
        rho, theta = ln[0]
        ang = math.degrees(theta) - 90.0
        if abs(ang) <= params["orientation"]["max_deskew_deg"]:
            angles.append(ang)
    if not angles:
        return 0.0
    return float(np.median(angles))


def rotate_image(image: np.ndarray, angle_deg: float) -> np.ndarray:
    h, w = image.shape[:2]
    m = cv2.getRotationMatrix2D((w / 2, h / 2), angle_deg, 1.0)
    return cv2.warpAffine(
        image,
        m,
        (w, h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,
    )


def build_text_response(gray: np.ndarray, params: dict) -> np.ndarray:
    h, w = gray.shape[:2]
    tr = params["text_response"]
    clahe = cv2.createCLAHE(clipLimit=tr["clahe_clip"], tileGridSize=(tr["clahe_grid"], tr["clahe_grid"]))
    g = clahe.apply(gray)
    kw = max(int(w * tr["blackhat_kernel_frac_w"]), tr["blackhat_min"])
    kh = max(int(h * tr["blackhat_kernel_frac_h"]), tr["blackhat_min"])
    k_bh = cv2.getStructuringElement(cv2.MORPH_RECT, (kw | 1, kh | 1))
    blackhat = cv2.morphologyEx(g, cv2.MORPH_BLACKHAT, k_bh)
    grad = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
    grad = np.abs(grad)
    grad = cv2.normalize(grad, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    combined = cv2.addWeighted(
        blackhat,
        tr["blackhat_weight"],
        grad,
        tr["sobel_weight"],
        0,
    )
    _, bw = cv2.threshold(combined, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    cw = max(int(w * tr["close_kernel_width_frac"]), tr["close_min_width"])
    ch = max(int(h * tr["close_kernel_height_frac"]), tr["close_min_height"])
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (cw | 1, ch | 1))
    closed = cv2.morphologyEx(bw, cv2.MORPH_CLOSE, kernel, iterations=1)
    return closed


def _row_metrics_from_roi(gray: np.ndarray, roi_gray: np.ndarray, params: dict) -> dict[str, Any]:
    cs = params["character_structure"]
    _, bw = cv2.threshold(roi_gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    n_labels, labels, stats, _ = cv2.connectedComponentsWithStats(bw, connectivity=8)
    rh, rw = roi_gray.shape[:2]
    comps = []
    for i in range(1, n_labels):
        x, y, w, h, area = stats[i]
        if area < 4 or h < rh * 0.15 or w > rw * 0.25:
            continue
        comps.append((x, w, h))
    comp_count = len(comps)
    if comp_count < 2:
        return {"component_count": comp_count, "regularity": 0.0, "height_coverage": 0.0}
    heights = [c[2] for c in comps]
    mean_h = float(np.mean(heights))
    height_cv = float(np.std(heights) / mean_h) if mean_h > 0 else 1.0
    height_coverage = min(1.0, mean_h / max(rh, 1))
    xs = sorted(c[0] + c[1] / 2 for c in comps)
    spacings = [xs[i + 1] - xs[i] for i in range(len(xs) - 1)]
    if len(spacings) >= 2:
        med = float(np.median(spacings))
        reg = 1.0 - min(1.0, float(np.std(spacings)) / (med + 1e-6))
    else:
        reg = 0.0
    return {
        "component_count": comp_count,
        "regularity": max(0.0, reg),
        "height_coverage": height_coverage,
        "height_cv": height_cv,
        "passes_structure": (
            comp_count >= cs["min_component_count"]
            and height_coverage >= cs["min_height_coverage_frac"]
            and height_cv <= cs["max_height_cv"]
            and reg >= cs["min_spacing_regularity"]
        ),
    }


def find_row_candidates(
    working_bgr: np.ndarray,
    text_response: np.ndarray,
    params: dict,
) -> list[RowCandidate]:
    h_img, w_img = working_bgr.shape[:2]
    gray = cv2.cvtColor(working_bgr, cv2.COLOR_BGR2GRAY)
    rc = params["row_candidate"]
    contours, _ = cv2.findContours(text_response, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates: list[RowCandidate] = []
    rid = 0
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        if w <= 0 or h <= 0:
            continue
        aspect = w / max(h, 1)
        area_frac = (w * h) / (w_img * h_img)
        cy = y + h / 2
        roi = gray[y : y + h, x : x + w]
        _, inv = cv2.threshold(roi, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        ink = float(inv.sum()) / (255.0 * w * h)
        struct = _row_metrics_from_roi(gray, roi, params)
        coverage = struct["component_count"] / max(w / max(h, 1), 1)
        coverage = min(1.0, coverage / 20.0)
        horiz_cov = float(np.count_nonzero(inv.sum(axis=0) > 0)) / max(w, 1)

        rejected = False
        reason = ""
        if w < w_img * rc["min_width_frac"]:
            rejected, reason = True, "too_narrow"
        elif h < h_img * rc["min_height_frac"] or h > h_img * rc["max_height_frac"]:
            rejected, reason = True, "bad_height"
        elif aspect < rc["min_aspect_ratio"] or aspect > rc["max_aspect_ratio"]:
            rejected, reason = True, "bad_aspect"
        elif ink < rc["min_ink_density"] or ink > rc["max_ink_density"]:
            rejected, reason = True, "bad_ink_density"
        elif area_frac > rc["max_single_blob_area_frac"]:
            rejected, reason = True, "blob_too_large"
        elif cy < h_img * rc["reject_upper_frac_center_y"] and horiz_cov < 0.5:
            rejected, reason = True, "upper_page_short_text"
        elif struct["component_count"] < rc["min_component_count"]:
            rejected, reason = True, "few_components"
        elif horiz_cov < rc["min_horizontal_coverage_frac"]:
            rejected, reason = True, "low_horizontal_coverage"
        elif not struct.get("passes_structure", False):
            rejected, reason = True, "character_structure_fail"

        cand = RowCandidate(
            row_id=rid,
            x=x,
            y=y,
            w=w,
            h=h,
            angle_deg=0.0,
            ink_density=ink,
            component_count=struct["component_count"],
            horizontal_coverage=horiz_cov,
            rejected=rejected,
            reject_reason=reason,
            metrics={**struct, "aspect_ratio": aspect, "area_frac": area_frac, "center_y_frac": cy / h_img},
        )
        candidates.append(cand)
        rid += 1
    return candidates


def _pair_score(row1: RowCandidate, row2: RowCandidate, img_h: int, params: dict) -> dict[str, float] | None:
    pr = params["pairing"]
    w = params["scoring_weights"]
    top, bottom = (row1, row2) if row1.y <= row2.y else (row2, row1)
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
    if hr < pr["min_height_ratio"] or (top.h / bottom.h) > pr["max_height_ratio"]:
        return None
    x_overlap = max(0, min(top.x + top.w, bottom.x + bottom.w) - max(top.x, bottom.x))
    overlap_frac = x_overlap / max(min(top.w, bottom.w), 1)
    if overlap_frac < pr["min_x_overlap_frac"]:
        return None

    width_sim = wr
    height_sim = hr
    align = overlap_frac
    gap_score = 1.0 - min(1.0, abs(gap - avg_h * 0.35) / (avg_h * pr["max_gap_height_ratio"] + 1e-6))
    dens = min(1.0, (top.ink_density + bottom.ink_density) / 0.15)
    reg = (top.metrics.get("regularity", 0) + bottom.metrics.get("regularity", 0)) / 2.0
    cov = (top.horizontal_coverage + bottom.horizontal_coverage) / 2.0
    angle_agree = 1.0
    pair_cy = (top.y + top.h + bottom.y) / 2.0
    lower_prior = pair_cy / img_h

    breakdown = {
        "width_similarity": width_sim,
        "height_similarity": height_sim,
        "horizontal_alignment": align,
        "vertical_gap": gap_score,
        "component_density": dens,
        "component_regularity": reg,
        "horizontal_coverage": cov,
        "angle_agreement": angle_agree,
        "lower_page_prior": lower_prior,
    }
    total = sum(breakdown[k] * w[k] for k in w)
    breakdown["total_pair_score"] = total
    return breakdown


def find_pair_candidates(
    rows: list[RowCandidate],
    img_h: int,
    params: dict,
) -> list[PairCandidate]:
    valid = [r for r in rows if not r.rejected]
    pairs: list[PairCandidate] = []
    pid = 0
    for i, a in enumerate(valid):
        for b in valid[i + 1 :]:
            bd = _pair_score(a, b, img_h, params)
            if bd is None:
                continue
            pairs.append(
                PairCandidate(
                    pair_id=pid,
                    row_a_id=a.row_id,
                    row_b_id=b.row_id,
                    score_breakdown=bd,
                    total_score=bd["total_pair_score"],
                    row_a=a,
                    row_b=b,
                )
            )
            pid += 1
            if len(pairs) >= params["pairing"]["max_pairs_to_evaluate"]:
                break
        if len(pairs) >= params["pairing"]["max_pairs_to_evaluate"]:
            break
    pairs.sort(key=lambda p: p.total_score, reverse=True)
    return pairs


def _crop_with_padding(
    image: np.ndarray,
    x: int,
    y: int,
    w: int,
    h: int,
    pad_cfg: dict,
) -> tuple[np.ndarray, tuple[int, int, int, int]]:
    ih, iw = image.shape[:2]
    px = max(pad_cfg["min_x_px"], int(w * pad_cfg["x_frac"]))
    py = max(pad_cfg["min_y_px"], int(h * pad_cfg["y_frac"]))
    x0 = _clamp(x - px, 0, iw - 1)
    y0 = _clamp(y - py, 0, ih - 1)
    x1 = _clamp(x + w + px, 1, iw)
    y1 = _clamp(y + h + py, 1, ih)
    return image[y0:y1, x0:x1].copy(), (x0, y0, x1 - x0, y1 - y0)


def detect_td3_mrz_pair(image_bgr: np.ndarray, params: dict | None = None) -> TD3DetectionResult:
    params = params or load_params()
    gray0 = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    angle = estimate_skew_angle(gray0, params)
    deskew_applied = abs(angle) >= params["orientation"]["min_deskew_deg_to_apply"]
    working = rotate_image(image_bgr, angle) if deskew_applied else image_bgr.copy()
    gray = cv2.cvtColor(working, cv2.COLOR_BGR2GRAY)
    text_resp = build_text_response(gray, params)
    rows = find_row_candidates(working, text_resp, params)
    h_img = working.shape[0]
    pairs = find_pair_candidates(rows, h_img, params)

    min_score = params["pairing"]["min_pair_total_score"]
    selected = pairs[0] if pairs and pairs[0].total_score >= min_score else None

    mrz_region = line1 = line2 = None
    l1_bb = l2_bb = mrz_bb = None
    status = "MRZ_NOT_FOUND"
    msg = "no pair above confidence gate"

    if selected:
        top, bottom = (
            (selected.row_a, selected.row_b)
            if selected.row_a.y <= selected.row_b.y
            else (selected.row_b, selected.row_a)
        )
        rp = params["region_padding"]
        lp = params["line_crop_padding"]
        line1, l1_bb = _crop_with_padding(working, top.x, top.y, top.w, top.h, lp)
        line2, l2_bb = _crop_with_padding(working, bottom.x, bottom.y, bottom.w, bottom.h, lp)
        x0 = min(l1_bb[0], l2_bb[0])
        y0 = min(l1_bb[1], l2_bb[1])
        x1 = max(l1_bb[0] + l1_bb[2], l2_bb[0] + l2_bb[2])
        y1 = max(l1_bb[1] + l1_bb[3], l2_bb[1] + l2_bb[3])
        px = max(rp["min_x_px"], int((x1 - x0) * rp["x_frac"]))
        py = max(rp["min_y_px"], int((y1 - y0) * rp["y_frac"]))
        ih, iw = working.shape[:2]
        rx0 = _clamp(x0 - px, 0, iw - 1)
        ry0 = _clamp(y0 - py, 0, ih - 1)
        rx1 = _clamp(x1 + px, 1, iw)
        ry1 = _clamp(y1 + py, 1, ih)
        mrz_region = working[ry0:ry1, rx0:rx1].copy()
        mrz_bb = (rx0, ry0, rx1 - rx0, ry1 - ry0)
        status = "MRZ_FOUND"
        msg = f"pair_id={selected.pair_id} score={selected.total_score:.4f}"

    return TD3DetectionResult(
        status=status,
        message=msg,
        working_bgr=working,
        deskew_angle_deg=angle,
        deskew_applied=deskew_applied,
        text_response=text_resp,
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
        params=params,
        diagnostics={
            "mrz_a1_false_region_reference": {"bbox_xywh": [0, 290, 890, 69], "note": "MRZ-A1 middle-page false positive"},
        },
    )


def row_candidates_to_json(rows: list[RowCandidate]) -> list[dict]:
    out = []
    for r in rows:
        out.append(
            {
                "row_id": r.row_id,
                "bbox_xywh": [r.x, r.y, r.w, r.h],
                "rejected": r.rejected,
                "reject_reason": r.reject_reason,
                "ink_density": r.ink_density,
                "component_count": r.component_count,
                "horizontal_coverage": r.horizontal_coverage,
                "metrics": r.metrics,
            }
        )
    return out


def pair_candidates_to_json(pairs: list[PairCandidate]) -> list[dict]:
    out = []
    for p in pairs[:50]:
        out.append(
            {
                "pair_id": p.pair_id,
                "row_a_id": p.row_a_id,
                "row_b_id": p.row_b_id,
                "total_score": p.total_score,
                "score_breakdown": p.score_breakdown,
            }
        )
    return out
