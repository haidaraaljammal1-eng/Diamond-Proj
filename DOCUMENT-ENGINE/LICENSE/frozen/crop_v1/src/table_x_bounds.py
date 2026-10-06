"""Refine table left/right (x) bounds from accepted row separator evidence."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from src.detect_table import _horizontal_line_mask


@dataclass
class SegmentEvidence:
    left: int
    right: int
    span: int
    segment_count: int
    strongest_span: int

    def to_dict(self) -> Dict[str, Any]:
        return {
            "leftmost_credible_x": self.left,
            "rightmost_credible_x": self.right,
            "horizontal_coverage_px": self.span,
            "segment_count": self.segment_count,
            "strongest_continuous_span_px": self.strongest_span,
        }


@dataclass
class BoundaryXEvidence:
    y: int
    segments: List[SegmentEvidence]
    selected_left: int
    selected_right: int

    def to_dict(self) -> Dict[str, Any]:
        return {
            "y": self.y,
            "selected_left": self.selected_left,
            "selected_right": self.selected_right,
            "segments": [s.to_dict() for s in self.segments],
        }


@dataclass
class TableXRefinementResult:
    old_x1: int
    old_x2: int
    new_x1: int
    new_x2: int
    per_boundary: List[BoundaryXEvidence]
    left_endpoint_pool: List[int]
    right_endpoint_pool: List[int]
    outer_right_pool: List[int]
    vertical_border_left: Optional[int]
    vertical_border_right: Optional[int]
    old_x2_reason: str
    confidence: float
    x2_method: str = "outer_cluster"

    def to_dict(self) -> Dict[str, Any]:
        w_old = self.old_x2 - self.old_x1
        w_new = self.new_x2 - self.new_x1
        return {
            "old_table_bbox_x": [self.old_x1, self.old_x2],
            "new_table_bbox_x": [self.new_x1, self.new_x2],
            "old_x2_reason": self.old_x2_reason,
            "per_boundary": [b.to_dict() for b in self.per_boundary],
            "left_endpoint_pool": self.left_endpoint_pool,
            "right_endpoint_pool": self.right_endpoint_pool,
            "outer_right_pool": self.outer_right_pool,
            "vertical_border_left": self.vertical_border_left,
            "vertical_border_right": self.vertical_border_right,
            "confidence": round(self.confidence, 4),
            "x2_method": self.x2_method,
            "left_boundary_changed": self.new_x1 != self.old_x1,
            "right_boundary_changed": self.new_x2 != self.old_x2,
        }


def _extract_horizontal_runs(active_cols: np.ndarray) -> List[Tuple[int, int]]:
    runs: List[Tuple[int, int]] = []
    w = active_cols.shape[0]
    x = 0
    while x < w:
        if not active_cols[x]:
            x += 1
            continue
        start = x
        while x < w and active_cols[x]:
            x += 1
        runs.append((start, x - 1))
    return runs


def _segments_at_y(
    gray: np.ndarray,
    horiz_mask: np.ndarray,
    y: int,
    tcfg: Dict[str, Any],
) -> Tuple[List[Tuple[int, int, int]], int, int, int, int]:
    h, w = gray.shape[:2]
    band = int(tcfg.get("x_endpoint_y_band_px", 3))
    y0 = max(0, y - band)
    y1 = min(h, y + band + 1)

    mask_band = np.max(horiz_mask[y0:y1, :] > 0, axis=0)
    if int(np.sum(mask_band)) < w * 0.02:
        strip = gray[y0:y1, :]
        blur = cv2.GaussianBlur(strip, (3, 3), 0)
        block = int(tcfg.get("adaptive_block_size", 31))
        if block % 2 == 0:
            block += 1
        binary = cv2.adaptiveThreshold(
            blur,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            block,
            int(tcfg.get("adaptive_c", 12)),
        )
        mask_band = (np.max(binary > 0, axis=0) > 0).astype(np.uint8)

    min_run = max(20, int(w * float(tcfg.get("min_segment_width_frac", 0.07))))
    runs = _extract_horizontal_runs(mask_band.astype(bool))
    credible = [(a, b, b - a + 1) for a, b in runs if (b - a + 1) >= min_run]
    if not credible and runs:
        longest = max(runs, key=lambda r: r[1] - r[0])
        credible = [(longest[0], longest[1], longest[1] - longest[0] + 1)]

    if not credible:
        return [], 0, 0, 0, 0

    left = min(c[0] for c in credible)
    right = max(c[1] for c in credible)
    strongest = max(c[2] for c in credible)
    return credible, left, right, len(credible), strongest


def _legacy_estimate_x(
    gray: np.ndarray,
    boundaries: List[int],
    search_x1: int,
    search_x2: int,
    horiz_mask: np.ndarray,
    y_offset: int,
    tcfg: Dict[str, Any],
) -> Tuple[int, int]:
    """Previous percentile-on-mask-endpoints estimator (for diagnostics)."""
    lefts: List[int] = []
    rights: List[int] = []
    for y_g in boundaries:
        y_l = y_g - y_offset
        if y_l < 0 or y_l >= horiz_mask.shape[0]:
            continue
        span_mask = horiz_mask[y_l : y_l + 1, :]
        cols = np.where(span_mask[0] > 0)[0]
        if cols.size < 5:
            row = gray[y_g, search_x1:search_x2]
            gx = cv2.Sobel(row.reshape(1, -1), cv2.CV_32F, 1, 0, ksize=3)[0]
            cols = np.where(np.abs(gx) > np.percentile(np.abs(gx), 85))[0] + search_x1
        if cols.size < 2:
            continue
        lefts.append(int(cols[0]))
        rights.append(int(cols[-1]))

    if not lefts:
        return search_x1, search_x2

    x1 = int(np.percentile(lefts, 15))
    x2 = int(np.percentile(rights, 85))
    x1 = max(search_x1, x1)
    x2 = min(search_x2, x2)
    return max(0, x1), min(gray.shape[1] - 1, x2)


def _rightmost_ink_extent_x(
    gray: np.ndarray,
    y_top: int,
    y_bot: int,
    x_lo: int,
    tcfg: Dict[str, Any],
) -> Optional[int]:
    """Rightmost ink column inside the table band (Arabic label column when x2 is too tight)."""
    h, w = gray.shape[:2]
    y0 = max(0, y_top)
    y1 = min(h, y_bot + 1)
    if y1 <= y0:
        return None
    x0 = max(0, min(x_lo, w - 1))
    roi = gray[y0:y1, x0:w]
    if roi.size == 0:
        return None
    blur = cv2.GaussianBlur(roi, (3, 3), 0)
    block = int(tcfg.get("adaptive_block_size", 31))
    if block % 2 == 0:
        block += 1
    binary = cv2.adaptiveThreshold(
        blur,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        block,
        int(tcfg.get("adaptive_c", 12)),
    )
    row_h = max(1, binary.shape[0])
    min_rows = max(3, int(row_h * float(tcfg.get("x_ink_col_min_row_frac", 0.10))))
    col_ink = np.sum(binary > 0, axis=0)
    xs = np.where(col_ink >= min_rows)[0]
    if xs.size == 0:
        return None
    return x0 + int(xs[-1])


def _detect_vertical_borders(
    gray: np.ndarray,
    y_top: int,
    y_bot: int,
    tcfg: Dict[str, Any],
) -> Tuple[Optional[int], Optional[int]]:
    h, w = gray.shape[:2]
    y0 = max(0, y_top)
    y1 = min(h, y_bot + 1)
    roi = gray[y0:y1, :]
    kh = max(15, int((y1 - y0) * 0.12))
    kw = max(2, int(w * 0.008))
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kw, kh))
    blur = cv2.GaussianBlur(roi, (3, 3), 0)
    block = int(tcfg.get("adaptive_block_size", 31))
    if block % 2 == 0:
        block += 1
    binary = cv2.adaptiveThreshold(
        blur,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        block,
        int(tcfg.get("adaptive_c", 12)),
    )
    vert = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
    col_energy = np.sum(vert > 0, axis=0).astype(np.float32)
    if col_energy.max() < 1:
        return None, None

    thresh = max(3.0, 0.28 * float(np.max(col_energy)))
    active = np.where(col_energy >= thresh)[0]
    if active.size == 0:
        return None, None

    left_region = active[active < w * 0.45]
    right_region = active[active > w * 0.55]
    v_left = int(left_region[0]) if left_region.size else None
    v_right = int(right_region[-1]) if right_region.size else None
    return v_left, v_right


def refine_table_x_bounds(
    image_bgr: np.ndarray,
    boundaries: List[int],
    search_region: Tuple[int, int, int, int],
    horiz_roi: np.ndarray,
    roi_y_offset: int,
    tcfg: Dict[str, Any],
) -> TableXRefinementResult:
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]
    sx1, sy1, sx2, sy2 = search_region

    horiz_full = _horizontal_line_mask(gray, tcfg)
    y_top, y_bot = boundaries[0], boundaries[-1]

    old_x1, old_x2 = _legacy_estimate_x(
        gray, boundaries, sx1, sx2, horiz_roi, roi_y_offset, tcfg
    )

    per_boundary: List[BoundaryXEvidence] = []
    left_pool: List[int] = []
    right_pool: List[int] = []
    span_pool: List[int] = []

    for y in boundaries:
        segs_raw, left, right, count, strongest = _segments_at_y(gray, horiz_full, y, tcfg)
        seg_ev = [
            SegmentEvidence(
                left=a,
                right=b,
                span=span,
                segment_count=1,
                strongest_span=span,
            )
            for a, b, span in segs_raw
        ]
        per_boundary.append(
            BoundaryXEvidence(
                y=y,
                segments=seg_ev,
                selected_left=left,
                selected_right=right,
            )
        )
        if segs_raw:
            longest = max(segs_raw, key=lambda s: s[2])
            left_pool.append(longest[0])
            right_pool.append(longest[1])
            span_pool.append(longest[2])

    med_span = float(np.median(span_pool)) if span_pool else 0.0
    min_span = max(
        40.0,
        med_span * float(tcfg.get("x_consensus_min_span_frac_of_median", 0.55)),
    )

    filtered_rights: List[int] = []
    filtered_lefts: List[int] = []
    for pb in per_boundary:
        if not pb.segments:
            continue
        longest = max(pb.segments, key=lambda s: s.strongest_span)
        if longest.strongest_span >= min_span:
            filtered_rights.append(longest.right)
            filtered_lefts.append(longest.left)

    if not filtered_rights:
        filtered_rights = right_pool
        filtered_lefts = left_pool

    outer_min_frac = float(tcfg.get("x_outer_min_span_frac", 0.50))
    outer_rights: List[int] = []
    for pb in per_boundary:
        if not pb.segments:
            continue
        for seg in pb.segments:
            if seg.strongest_span >= w * outer_min_frac:
                outer_rights.append(seg.right)
            elif seg.strongest_span >= w * float(tcfg.get("x_outer_alt_span_frac", 0.35)):
                outer_rights.append(seg.right)
        total_span = pb.selected_right - pb.selected_left
        if total_span >= w * float(tcfg.get("x_outer_alt_span_frac", 0.35)):
            outer_rights.append(pb.selected_right)

    if not outer_rights:
        outer_rights = list(filtered_rights)

    cluster_tol = int(tcfg.get("x_right_cluster_tol_px", 22))
    outer_rights = sorted(set(outer_rights))
    clusters: List[List[int]] = []
    for x in outer_rights:
        if not clusters or x - clusters[-1][-1] > cluster_tol:
            clusters.append([x])
        else:
            clusters[-1].append(x)
    best_cluster = max(
        clusters,
        key=lambda cl: (len(cl), int(np.median(cl))),
    )
    new_x2 = int(max(best_cluster))
    x2_method = "outer_right_cluster"
    if len(best_cluster) == 1 and outer_rights:
        far = max(outer_rights)
        if far - new_x2 > cluster_tol and any(
            s.strongest_span >= w * 0.62
            for pb in per_boundary
            for s in pb.segments
            if s.right == far
        ):
            new_x2 = far
            x2_method = "outer_right_singleton_long_span"

    new_x2 = min(w - 2, new_x2)

    left_region_frac = float(tcfg.get("x_left_region_frac", 0.45))
    left_in_region = [l for l in (filtered_lefts or left_pool) if l <= w * left_region_frac]
    if left_in_region:
        evidence_x1 = int(np.percentile(left_in_region, 8))
        new_x1 = min(old_x1, evidence_x1)
    else:
        new_x1 = old_x1
    new_x1 = max(sx1, new_x1)

    v_left, v_right = _detect_vertical_borders(gray, y_top, y_bot, tcfg)
    confidence = 0.55
    if v_right is not None and v_right >= new_x2 - 40:
        new_x2 = max(new_x2, v_right)
        confidence += 0.2
        x2_method = "outer_cluster_plus_vertical_border"
    if v_left is not None and abs(v_left - new_x1) < 35:
        new_x1 = min(new_x1, v_left)
        confidence += 0.1

    ink_right = _rightmost_ink_extent_x(gray, y_top, y_bot, new_x1, tcfg)
    ink_margin = int(tcfg.get("x_ink_right_margin_px", 8))
    ink_min_frac = float(tcfg.get("x_ink_extend_min_frac", 0.68))
    if ink_right is not None and ink_right >= int(w * ink_min_frac):
        extended = min(w - 2, ink_right + ink_margin)
        if extended > new_x2 + 4:
            new_x2 = extended
            x2_method = f"{x2_method}_plus_table_band_ink"

    new_x2 = min(w - 2, new_x2)
    new_x1 = max(0, min(new_x1, new_x2 - 50))

    min_tw = int(w * float(tcfg.get("min_table_width_frac", 0.35)))
    if new_x2 - new_x1 < min_tw:
        new_x1, new_x2 = old_x1, old_x2
        confidence *= 0.5

    old_reason = (
        "Legacy x2 used the 85th percentile of per-row morphology mask endpoints, "
        "which often stops at the value-column interior and misses the Arabic-label column."
    )

    return TableXRefinementResult(
        old_x1=old_x1,
        old_x2=old_x2,
        new_x1=new_x1,
        new_x2=new_x2,
        per_boundary=per_boundary,
        left_endpoint_pool=filtered_lefts or left_pool,
        right_endpoint_pool=filtered_rights or right_pool,
        outer_right_pool=outer_rights,
        vertical_border_left=v_left,
        vertical_border_right=v_right,
        old_x2_reason=old_reason,
        confidence=min(1.0, confidence),
        x2_method=x2_method,
    )
