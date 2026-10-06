"""English fixed-label purity and value-bleed checks."""

from __future__ import annotations

from enum import Enum
from typing import Optional, Tuple

import cv2
import numpy as np

from src.value_crop.template_ink import InkBBox


class EnLabelBleedStatus(str, Enum):
    EN_LABEL_CLEAN = "EN_LABEL_CLEAN"
    EN_LABEL_VALUE_BLEED = "EN_LABEL_VALUE_BLEED"
    EN_LABEL_BOUNDARY_UNCERTAIN = "EN_LABEL_BOUNDARY_UNCERTAIN"


MAX_EN_LABEL_RIGHT_EXPAND_PX = 2


def _ink_column_span(
    ink: np.ndarray,
    x_lo: int,
    x_hi: int,
    y_lo: int,
    y_hi: int,
) -> Optional[Tuple[int, int]]:
    h, w = ink.shape[:2]
    x_lo = max(0, x_lo)
    x_hi = min(w, x_hi)
    y_lo = max(0, y_lo)
    y_hi = min(h, y_hi)
    if x_hi <= x_lo or y_hi <= y_lo:
        return None
    band = ink[y_lo:y_hi, x_lo:x_hi]
    cols = np.where(np.any(band > 0, axis=0))[0]
    if cols.size == 0:
        return None
    return x_lo + int(cols[0]), x_lo + int(cols[-1]) + 1


def tighten_english_label_ink(
    ink: np.ndarray,
    region: Tuple[int, int, int, int],
    mapped_ink: InkBBox,
    max_left_shift_px: int = 3,
) -> InkBBox:
    """Shrink-only local refinement for left English labels."""
    x1, y1, x2, y2 = region
    h, w = ink.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    roi = ink[y1:y2, x1:x2]
    num, _, stats, _ = cv2.connectedComponentsWithStats(roi, connectivity=8)
    boxes = []
    mx1, my1, mx2, my2 = mapped_ink
    band_tol = max(3, (my2 - my1) // 2)
    for i in range(1, num):
        bx, by, bw, bh, area = stats[i]
        if area < 12 or bh < 5:
            continue
        gx1, gy1 = x1 + bx, y1 + by
        gx2, gy2 = gx1 + bw, gy1 + bh
        cy = (gy1 + gy2) // 2
        if cy < my1 - band_tol or cy > my2 + band_tol:
            continue
        if gx1 < x1 or gx2 > x2:
            continue
        if gx1 > mx2 + MAX_EN_LABEL_RIGHT_EXPAND_PX:
            continue
        boxes.append((gx1, gy1, gx2, gy2))
    if not boxes:
        return mapped_ink

    lx1 = min(b[0] for b in boxes)
    ly1 = min(b[1] for b in boxes)
    lx2 = min(x2, max(b[2] for b in boxes))
    ly2 = max(b[3] for b in boxes)
    span = _ink_column_span(ink, x1, lx1 + 1, my1, my2)
    if span is not None:
        lx1 = min(lx1, span[0])
    span_r = _ink_column_span(ink, max(x1, lx1), min(x2, mx2 + 12), my1, my2)
    if span_r is not None:
        lx2 = max(lx2, min(x2, span_r[1]))
    lx2 = min(x2, max(lx2, mx1 + 8))
    return (int(lx1), int(ly1), int(lx2), int(ly2))


def next_value_component_x(
    ink: np.ndarray,
    label_right: int,
    text_y1: int,
    text_y2: int,
    search_px: int = 160,
) -> Optional[int]:
    """Left edge of the first text mass immediately right of the label."""
    h, w = ink.shape[:2]
    x1 = min(w - 1, max(0, label_right + 1))
    x2 = min(w, label_right + 1 + search_px)
    if x2 <= x1:
        return None
    band = ink[text_y1:text_y2, x1:x2]
    num, _, stats, _ = cv2.connectedComponentsWithStats(band, connectivity=8)
    candidates = []
    for i in range(1, num):
        bx, by, bw, bh, area = stats[i]
        if bh < 6 or area < 24:
            continue
        candidates.append(x1 + bx)
    if not candidates:
        return None
    return int(min(candidates))


def check_english_label_value_bleed(
    ink: np.ndarray,
    label_bbox: InkBBox,
    text_y1: int,
    text_y2: int,
) -> Tuple[EnLabelBleedStatus, Optional[int]]:
    lx1, ly1, lx2, ly2 = label_bbox
    nxt = next_value_component_x(ink, lx2, text_y1, text_y2)
    if nxt is None:
        return EnLabelBleedStatus.EN_LABEL_BOUNDARY_UNCERTAIN, None

    if lx2 > nxt:
        return EnLabelBleedStatus.EN_LABEL_VALUE_BLEED, nxt

    value_box = (nxt, text_y1, min(ink.shape[1], nxt + 80), text_y2)
    inter_x1 = max(lx1, value_box[0])
    inter_x2 = min(lx2, value_box[2])
    inter_y1 = max(ly1, value_box[1])
    inter_y2 = min(ly2, value_box[3])
    if inter_x2 > inter_x1 and inter_y2 > inter_y1:
        overlap = (inter_x2 - inter_x1) * (inter_y2 - inter_y1)
        label_area = max(1, (lx2 - lx1) * max(1, ly2 - ly1))
        if overlap > max(6, int(0.015 * label_area)):
            return EnLabelBleedStatus.EN_LABEL_VALUE_BLEED, nxt

    return EnLabelBleedStatus.EN_LABEL_CLEAN, nxt
