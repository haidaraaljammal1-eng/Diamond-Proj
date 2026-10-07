"""MRZ-A36: generic fallback row-core OCR crop refinement (pixel geometry only)."""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np


def load_row_core_config(fb: dict) -> dict:
    defaults = {
        "enabled": True,
        "min_row_horizontal_coverage": 0.52,
        "ink_row_threshold_frac_of_max": 0.15,
        "min_core_height_px": 5,
        "max_vertical_trim_frac": 0.75,
        "non_overlap_margin_px": 1,
        "min_preserved_width_frac": 0.9,
        "max_horizontal_margin_trim_frac": 0.08,
        "fallback_min_row_coverage": 0.28,
        "corridor_resplit_upper_max_cov": 0.45,
        "corridor_resplit_lower_min_max_cov": 0.65,
        "corridor_mrz_row_coverage": 0.48,
    }
    cfg = dict(defaults)
    block = fb.get("row_core_crop") or {}
    cfg.update(block)
    return cfg


def _binarize(gray: np.ndarray) -> np.ndarray:
    _, inv = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return inv


def _analysis_ink_mask(gray: np.ndarray) -> np.ndarray:
    """Ink mask for row-core geometry; per-row OTSU avoids global threshold bias on tall strips."""
    h, w = gray.shape[:2]
    if h <= 1:
        return _binarize(gray)
    rows = []
    for r in range(h):
        row = gray[r : r + 1, :]
        _, inv = cv2.threshold(row, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        rows.append(inv[0])
    return np.stack(rows, axis=0)


def _row_horizontal_coverage(inv: np.ndarray) -> np.ndarray:
    h, w = inv.shape[:2]
    if h == 0 or w == 0:
        return np.zeros(0, dtype=np.float32)
    active_cols = (inv > 0).sum(axis=0) > 0
    if not np.any(active_cols):
        return np.zeros(h, dtype=np.float32)
    # Per-row: fraction of columns that contain ink in that row
    return ((inv > 0).sum(axis=1) / max(w, 1)).astype(np.float32)


def _find_best_vertical_core(
    row_cov: np.ndarray,
    min_cov: float,
    min_height: int,
    fallback_min_cov: float,
) -> tuple[int, int, float]:
    h = len(row_cov)
    if h == 0:
        return 0, 0, 0.0

    best: tuple[int, int] | None = None
    best_score = -1.0
    i = 0
    while i < h:
        if row_cov[i] < min_cov:
            i += 1
            continue
        j = i
        while j < h and row_cov[j] >= min_cov:
            j += 1
        seg_len = j - i
        if seg_len >= min_height:
            score = float(np.mean(row_cov[i:j])) * seg_len
            if score > best_score:
                best_score = score
                best = (i, j)
        i = j

    if best is None:
        thresh = max(fallback_min_cov, float(row_cov.max()) * 0.25)
        i = 0
        while i < h:
            if row_cov[i] < thresh:
                i += 1
                continue
            j = i
            while j < h and row_cov[j] >= thresh:
                j += 1
            seg_len = j - i
            if seg_len >= max(2, min_height // 2):
                score = float(np.mean(row_cov[i:j])) * seg_len
                if score > best_score:
                    best_score = score
                    best = (i, j)
            i = j

    if best is None:
        return 0, h, float(np.mean(row_cov)) if h else 0.0
    return best[0], best[1], float(np.mean(row_cov[best[0] : best[1]]))


def _horizontal_ink_span(inv: np.ndarray, y0: int, y1: int) -> tuple[int, int]:
    band = inv[y0:y1, :]
    if band.size == 0:
        return 0, inv.shape[1]
    cols = np.where((band > 0).any(axis=0))[0]
    if len(cols) == 0:
        return 0, inv.shape[1]
    return int(cols[0]), int(cols[-1]) + 1


def _metrics_for_roi(inv: np.ndarray) -> dict[str, Any]:
    h, w = inv.shape[:2]
    fg = int(np.count_nonzero(inv))
    cov = float(np.count_nonzero(inv.sum(axis=0) > 0)) / max(w, 1)
    return {
        "wh": [w, h],
        "foreground_pixels": fg,
        "horizontal_coverage": round(cov, 4),
    }


def _bbox_max_row_coverage(deskewed_bgr: np.ndarray, bbox: tuple[int, int, int, int]) -> float:
    x, y, w, h = bbox
    roi = deskewed_bgr[y : y + h, x : x + w]
    if roi.size == 0:
        return 0.0
    inv = _analysis_ink_mask(cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY))
    cov = _row_horizontal_coverage(inv)
    return float(cov.max()) if len(cov) else 0.0


def _try_corridor_mrz_resplit(
    deskewed_bgr: np.ndarray,
    line1_bbox: tuple[int, int, int, int],
    line2_bbox: tuple[int, int, int, int],
    cfg: dict,
) -> tuple[np.ndarray, tuple[int, int, int, int], np.ndarray, tuple[int, int, int, int], dict] | None:
    """Split one continuous MRZ-like vertical run into upper/lower line cores."""
    x0 = min(line1_bbox[0], line2_bbox[0])
    x1 = max(line1_bbox[0] + line1_bbox[2], line2_bbox[0] + line2_bbox[2])
    y0 = min(line1_bbox[1], line2_bbox[1])
    y1 = max(bbox_bottom(line1_bbox), bbox_bottom(line2_bbox))
    ih, iw = deskewed_bgr.shape[:2]
    x0 = max(0, min(x0, iw - 1))
    x1 = max(x0 + 1, min(x1, iw))
    y0 = max(0, min(y0, ih - 1))
    y1 = max(y0 + 1, min(y1, ih))

    corridor = deskewed_bgr[y0:y1, x0:x1]
    inv = _analysis_ink_mask(cv2.cvtColor(corridor, cv2.COLOR_BGR2GRAY))
    cov = _row_horizontal_coverage(inv)
    thr = float(cfg.get("corridor_mrz_row_coverage", cfg["min_row_horizontal_coverage"]))
    min_h = int(cfg["min_core_height_px"])
    idx = np.flatnonzero(cov >= thr)
    if len(idx) < 2 * min_h:
        return None
    s, e = int(idx[0]), int(idx[-1])
    seg = cov[s : e + 1]
    if len(seg) < 2 * min_h:
        return None
    lo = max(1, len(seg) // 4)
    hi = max(lo + 1, (3 * len(seg)) // 4)
    split_off = lo + int(np.argmin(seg[lo:hi]))
    r1_end = s + split_off
    r2_start = s + split_off + 1
    if r1_end - s + 1 < min_h or e - r2_start + 1 < min_h:
        split_off = len(seg) // 2
        r1_end = s + split_off
        r2_start = s + split_off + 1
    gy1_a, gy1_b = y0 + s, y0 + r1_end + 1
    gy2_a, gy2_b = y0 + r2_start, y0 + e + 1
    margin = int(cfg["non_overlap_margin_px"])
    if gy1_b + margin > gy2_a:
        gy1_b = max(y0 + s, (gy1_b + gy2_a) // 2)
        gy2_a = gy1_b + margin
    bb1 = (x0, gy1_a, x1 - x0, gy1_b - gy1_a)
    bb2 = (x0, gy2_a, x1 - x0, gy2_b - gy2_a)
    l1 = deskewed_bgr[gy1_a:gy1_b, x0:x1].copy()
    l2 = deskewed_bgr[gy2_a:gy2_b, x0:x1].copy()
    d1 = {
        "mode": "corridor_resplit",
        "original_bbox": list(line1_bbox),
        "refined_bbox": list(bb1),
        "before": _metrics_for_roi(inv[s : r1_end + 1, :]),
        "after": _metrics_for_roi(_analysis_ink_mask(cv2.cvtColor(l1, cv2.COLOR_BGR2GRAY))),
    }
    d2 = {
        "mode": "corridor_resplit",
        "original_bbox": list(line2_bbox),
        "refined_bbox": list(bb2),
        "before": _metrics_for_roi(inv[r2_start : e + 1, :]),
        "after": _metrics_for_roi(_analysis_ink_mask(cv2.cvtColor(l2, cv2.COLOR_BGR2GRAY))),
    }
    return l1, bb1, l2, bb2, {"line1": d1, "line2": d2, "corridor_y_range": [y0, y1]}


def refine_line_bbox_from_deskewed(
    deskewed_bgr: np.ndarray,
    bbox: tuple[int, int, int, int],
    cfg: dict,
    y_max_exclusive: int | None = None,
    y_min_inclusive: int | None = None,
) -> tuple[np.ndarray, tuple[int, int, int, int], dict]:
    """Tighten vertical (primary) and blank horizontal margins on a row crop bbox."""
    x, y, w, h = bbox
    ih, iw = deskewed_bgr.shape[:2]
    x = max(0, min(x, iw - 1))
    w = max(1, min(w, iw - x))
    y = max(0, min(y, ih - 1))
    h = max(1, min(h, ih - y))

    roi = deskewed_bgr[y : y + h, x : x + w]
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    inv = _analysis_ink_mask(gray)
    before = _metrics_for_roi(inv)

    row_cov = _row_horizontal_coverage(inv)
    max_trim = int(h * cfg["max_vertical_trim_frac"])
    y0, y1, core_mean_cov = _find_best_vertical_core(
        row_cov,
        float(cfg["min_row_horizontal_coverage"]),
        int(cfg["min_core_height_px"]),
        float(cfg["fallback_min_row_coverage"]),
    )

    if y1 - y0 < int(cfg["min_core_height_px"]):
        y0, y1 = 0, h

    gx0, gx1 = x, x + w
    gy0, gy1 = y + y0, y + y1

    if y_max_exclusive is not None:
        gy1 = min(gy1, y_max_exclusive)
    if y_min_inclusive is not None:
        gy0 = max(gy0, y_min_inclusive)

    if gy1 <= gy0:
        gy0, gy1 = y, y + h

    min_h = int(cfg["min_core_height_px"])
    if gy1 - gy0 < min_h:
        pad = (min_h - (gy1 - gy0)) // 2 + 1
        gy0 = max(y, gy0 - pad)
        gy1 = min(ih, gy1 + pad)
    if gy1 <= gy0:
        gy0, gy1 = y, y + h

    sub = deskewed_bgr[gy0:gy1, gx0:gx1]
    sub_inv = _analysis_ink_mask(cv2.cvtColor(sub, cv2.COLOR_BGR2GRAY))
    lx, rx = _horizontal_ink_span(sub_inv, 0, sub_inv.shape[0])
    orig_w = gx1 - gx0
    min_w = max(1, int(orig_w * cfg["min_preserved_width_frac"]))
    max_trim_x = int(orig_w * cfg["max_horizontal_margin_trim_frac"])
    nx0 = gx0 + max(0, lx - 1)
    nx1 = gx1 - max(0, (orig_w - rx) - 1)
    if nx1 - nx0 < min_w:
        nx0, nx1 = gx0, gx1
    else:
        if (gx0 - nx0) > max_trim_x:
            nx0 = gx0
        if (nx1 - gx1) > max_trim_x:
            nx1 = gx1

    refined = deskewed_bgr[gy0:gy1, nx0:nx1].copy()
    new_bb = (nx0, gy0, nx1 - nx0, gy1 - gy0)
    after = _metrics_for_roi(_analysis_ink_mask(cv2.cvtColor(refined, cv2.COLOR_BGR2GRAY)))

    detail = {
        "original_bbox": [x, y, w, h],
        "refined_bbox": list(new_bb),
        "original_height": h,
        "refined_height": new_bb[3],
        "top_trim_px": (y + y0) - gy0 + y0,
        "bottom_trim_px": (y + h) - gy1,
        "left_trim_px": nx0 - gx0,
        "right_trim_px": gx1 - nx1,
        "core_mean_row_coverage": round(core_mean_cov, 4),
        "before": before,
        "after": after,
        "y_limits": {"max_exclusive": y_max_exclusive, "min_inclusive": y_min_inclusive},
    }
    detail["top_trim_px"] = max(0, gy0 - y)
    detail["bottom_trim_px"] = max(0, (y + h) - gy1)
    return refined, new_bb, detail


def bbox_bottom(bb: tuple[int, int, int, int]) -> int:
    return bb[1] + bb[3]


def bbox_top(bb: tuple[int, int, int, int]) -> int:
    return bb[1]


def overlap_px(bb1: tuple[int, int, int, int], bb2: tuple[int, int, int, int]) -> int:
    b1 = bbox_bottom(bb1)
    t2 = bbox_top(bb2)
    return max(0, b1 - t2)


def refine_fallback_pair_row_crops(
    deskewed_bgr: np.ndarray,
    line1_bgr: np.ndarray,
    line2_bgr: np.ndarray,
    line1_bbox: tuple[int, int, int, int],
    line2_bbox: tuple[int, int, int, int],
    fb: dict,
) -> tuple[np.ndarray, tuple[int, int, int, int], np.ndarray, tuple[int, int, int, int], dict]:
    cfg = load_row_core_config(fb)
    if not cfg.get("enabled", True):
        return line1_bgr, line1_bbox, line2_bgr, line2_bbox, {"applied": False}

    margin = int(cfg["non_overlap_margin_px"])
    overlap_before = overlap_px(line1_bbox, line2_bbox)

    up_max = _bbox_max_row_coverage(deskewed_bgr, line1_bbox)
    lo_max = _bbox_max_row_coverage(deskewed_bgr, line2_bbox)
    try_corridor = overlap_before > 0 and lo_max >= float(cfg["corridor_resplit_lower_min_max_cov"])
    try_corridor = try_corridor or (
        up_max < float(cfg["corridor_resplit_upper_max_cov"])
        and lo_max >= float(cfg["corridor_resplit_lower_min_max_cov"])
    )
    if try_corridor:
        resplit = _try_corridor_mrz_resplit(deskewed_bgr, line1_bbox, line2_bbox, cfg)
        if resplit is not None:
            l1, bb1, l2, bb2, parts = resplit
            overlap_after = overlap_px(bb1, bb2)
            return (
                l1,
                bb1,
                l2,
                bb2,
                {
                    "applied": True,
                    "mode": "corridor_resplit",
                    "config": cfg,
                    "overlap_px_before": overlap_before,
                    "overlap_px_after": overlap_after,
                    "upper_row_max_coverage_before": round(up_max, 4),
                    "lower_row_max_coverage_before": round(lo_max, 4),
                    **parts,
                    "non_overlap_satisfied": overlap_after == 0,
                },
            )

    # Lower row first (typically denser MRZ band)
    l2, bb2, d2 = refine_line_bbox_from_deskewed(deskewed_bgr, line2_bbox, cfg)
    boundary = bbox_top(bb2) - margin
    l1, bb1, d1 = refine_line_bbox_from_deskewed(
        deskewed_bgr, line1_bbox, cfg, y_max_exclusive=boundary
    )

    if bbox_bottom(bb1) > bbox_top(bb2) - margin:
        mid = (bbox_bottom(bb1) + bbox_top(bb2)) // 2
        l1, bb1, d1 = refine_line_bbox_from_deskewed(
            deskewed_bgr, line1_bbox, cfg, y_max_exclusive=mid
        )
        l2, bb2, d2 = refine_line_bbox_from_deskewed(
            deskewed_bgr, line2_bbox, cfg, y_min_inclusive=mid + margin
        )

    overlap_after = overlap_px(bb1, bb2)

    diagnostics = {
        "applied": True,
        "config": cfg,
        "overlap_px_before": overlap_before,
        "overlap_px_after": overlap_after,
        "line1": d1,
        "line2": d2,
        "non_overlap_satisfied": overlap_after == 0,
    }
    return l1, bb1, l2, bb2, diagnostics
