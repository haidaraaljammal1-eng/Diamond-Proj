"""MRZ-A14: conservative pair-aware vertical crop normalization (fallback only)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import cv2
import numpy as np


@dataclass
class FallbackCropNormalizeResult:
    status: str  # UNCHANGED | NORMALIZED | REJECTED
    applied: bool
    line1_bgr: np.ndarray | None
    line2_bgr: np.ndarray | None
    line1_bbox: tuple[int, int, int, int] | None
    line2_bbox: tuple[int, int, int, int] | None
    details: dict[str, Any] = field(default_factory=dict)


def load_normalization_params(params: dict) -> dict:
    base = {
        "min_pair_crop_height_ratio_to_trigger": 0.7,
        "min_glyph_median_height_ratio_for_normalize": 0.55,
        "min_pair_crop_height_ratio_after_gate": 0.7,
        "inter_row_boundary_margin_frac_of_gap": 0.25,
        "min_inter_row_gap_px": 1,
        "min_crop_height_to_glyph_median": 0.0,
    }
    cfg = params.get("fallback_crop_normalization") or {}
    out = dict(base)
    out.update(cfg)
    return out


def median_component_height(line_bgr: np.ndarray) -> float:
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


def _neutral_fill_bgr(crop: np.ndarray) -> tuple[int, int, int]:
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]
    border = np.concatenate([gray[0, :], gray[-1, :], gray[:, 0], gray[:, -1]])
    val = int(np.median(border))
    return (val, val, val)


def _clamp(v: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, v))


def _vertical_expand_from_source(
    deskewed_bgr: np.ndarray,
    bbox: tuple[int, int, int, int],
    target_h: int,
    y_min: int | None,
    y_max: int | None,
) -> tuple[np.ndarray, tuple[int, int, int, int], int, int]:
    """Return crop, new bbox, source_context_px_added, neutral_pad_px_added."""
    x, y, w, h = bbox
    ih, iw = deskewed_bgr.shape[:2]
    x = _clamp(x, 0, iw - 1)
    w = _clamp(w, 1, iw - x)
    cy = y + h / 2.0
    y0 = int(round(cy - target_h / 2.0))
    y1 = y0 + target_h

    if y0 < 0:
        y1 -= y0
        y0 = 0
    if y1 > ih:
        shift = y1 - ih
        y0 -= shift
        y1 = ih
        y0 = max(0, y0)

    if y_min is not None:
        y0 = max(y0, y_min)
    if y_max is not None:
        y1 = min(y1, y_max)

    if y1 <= y0:
        y0, y1 = y, y + h

    source_crop = deskewed_bgr[y0:y1, x : x + w].copy()
    source_h = source_crop.shape[0]
    source_added = max(0, source_h - h)

    if source_h >= target_h:
        if source_h > target_h:
            trim = (source_h - target_h) // 2
            source_crop = source_crop[trim : trim + target_h, :].copy()
            y0 = y0 + trim
        return source_crop, (x, y0, w, target_h), source_added, 0

    fill = _neutral_fill_bgr(source_crop)
    canvas = np.full((target_h, w, 3), fill, dtype=np.uint8)
    off = (target_h - source_h) // 2
    canvas[off : off + source_h, :] = source_crop
    neutral = target_h - source_h
    return canvas, (x, y0 - off, w, target_h), source_added, neutral


def normalize_fallback_pair_crops(
    deskewed_bgr: np.ndarray,
    line1_bgr: np.ndarray,
    line2_bgr: np.ndarray,
    line1_bbox: tuple[int, int, int, int],
    line2_bbox: tuple[int, int, int, int],
    params: dict,
) -> FallbackCropNormalizeResult:
    cfg = load_normalization_params(params)
    h1 = int(line1_bgr.shape[0])
    h2 = int(line2_bgr.shape[0])
    w1 = int(line1_bgr.shape[1])
    w2 = int(line2_bgr.shape[1])
    ratio = min(h1, h2) / max(h1, h2) if max(h1, h2) else 1.0

    med1 = median_component_height(line1_bgr)
    med2 = median_component_height(line2_bgr)
    glyph_ratio = min(med1, med2) / max(med1, med2) if max(med1, med2) > 0 else 0.0

    details: dict[str, Any] = {
        "before": {
            "line1_wh": [w1, h1],
            "line2_wh": [w2, h2],
            "crop_height_ratio_min_over_max": ratio,
            "glyph_median_heights": [med1, med2],
            "glyph_median_height_ratio": glyph_ratio,
        },
        "policy": cfg,
    }

    trigger = cfg["min_pair_crop_height_ratio_to_trigger"]
    if ratio >= trigger:
        details["action"] = "none_acceptable_ratio"
        return FallbackCropNormalizeResult(
            status="UNCHANGED",
            applied=False,
            line1_bgr=line1_bgr,
            line2_bgr=line2_bgr,
            line1_bbox=line1_bbox,
            line2_bbox=line2_bbox,
            details=details,
        )

    min_glyph = cfg["min_glyph_median_height_ratio_for_normalize"]
    if glyph_ratio < min_glyph:
        details["action"] = "reject_genuine_glyph_scale_mismatch"
        return FallbackCropNormalizeResult(
            status="REJECTED",
            applied=False,
            line1_bgr=line1_bgr,
            line2_bgr=line2_bgr,
            line1_bbox=line1_bbox,
            line2_bbox=line2_bbox,
            details=details,
        )

    target_h = max(h1, h2)
    glyph_floor = float(cfg.get("min_crop_height_to_glyph_median", 0.0))
    if glyph_floor > 0 and max(med1, med2) > 0:
        glyph_target = int(np.ceil(max(med1, med2) * glyph_floor))
        target_h = max(target_h, glyph_target)
    x1, y1, w1b, _ = line1_bbox
    x2, y2, w2b, _ = line2_bbox
    l1_bottom = y1 + h1
    l2_top = y2
    gap = max(cfg["min_inter_row_gap_px"], l2_top - l1_bottom)
    margin = max(cfg["min_inter_row_gap_px"], int(gap * cfg["inter_row_boundary_margin_frac_of_gap"]))
    mid = (l1_bottom + l2_top) // 2

    out_l1, out_l2 = line1_bgr, line2_bgr
    out_bb1, out_bb2 = line1_bbox, line2_bbox
    src_ctx = 0
    neutral = 0
    shorter: list[str] = []
    if h1 < h2:
        shorter.append("line1")
    elif h2 < h1:
        shorter.append("line2")

    y_max_l1 = mid - margin
    y_min_l2 = mid + margin

    if h1 < target_h:
        crop, bb, s_add, n_add = _vertical_expand_from_source(
            deskewed_bgr, line1_bbox, target_h, y_min=None, y_max=y_max_l1
        )
        out_l1, out_bb1 = crop, bb
        src_ctx += s_add
        neutral += n_add
    if h2 < target_h:
        crop, bb, s_add, n_add = _vertical_expand_from_source(
            deskewed_bgr, line2_bbox, target_h, y_min=y_min_l2, y_max=None
        )
        out_l2, out_bb2 = crop, bb
        src_ctx += s_add
        neutral += n_add

    details["shorter_line"] = shorter[0] if len(shorter) == 1 else ("both" if len(shorter) == 2 else "none")

    ah1, ah2 = int(out_l1.shape[0]), int(out_l2.shape[0])
    after_ratio = min(ah1, ah2) / max(ah1, ah2) if max(ah1, ah2) else 1.0
    details["after"] = {
        "line1_wh": [int(out_l1.shape[1]), ah1],
        "line2_wh": [int(out_l2.shape[1]), ah2],
        "crop_height_ratio_min_over_max": after_ratio,
        "source_context_pixels_added": src_ctx,
        "neutral_padding_pixels_added": neutral,
        "target_height_pair_derived": target_h,
        "glyph_derived_min_height": int(np.ceil(max(med1, med2) * glyph_floor)) if glyph_floor > 0 else None,
    }

    post_min = cfg["min_pair_crop_height_ratio_after_gate"]
    if after_ratio < post_min and glyph_ratio >= min_glyph:
        details["action"] = "reject_insufficient_normalization"
        return FallbackCropNormalizeResult(
            status="REJECTED",
            applied=False,
            line1_bgr=line1_bgr,
            line2_bgr=line2_bgr,
            line1_bbox=line1_bbox,
            line2_bbox=line2_bbox,
            details=details,
        )

    details["action"] = "normalized"
    return FallbackCropNormalizeResult(
        status="NORMALIZED",
        applied=True,
        line1_bgr=out_l1,
        line2_bgr=out_l2,
        line1_bbox=out_bb1,
        line2_bbox=out_bb2,
        details=details,
    )
