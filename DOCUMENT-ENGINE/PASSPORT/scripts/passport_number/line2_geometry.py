"""TD3 line 2 geometry — isolate lower MRZ line cells 0–9 (10 cells) for OCR."""

from __future__ import annotations
from dataclasses import dataclass

import cv2
import numpy as np

TD3_CELLS = 44
DOC_FIELD_CELLS = 10


@dataclass
class Line2Geometry:
    corridor_x: int
    corridor_y: int
    corridor_w: int
    corridor_h: int
    cell_width_px: float
    crop_wh_9: tuple[int, int]
    crop_wh_10: tuple[int, int]


def _analysis_ink_mask(gray: np.ndarray) -> np.ndarray:
    h = gray.shape[0]
    if h <= 1:
        _, inv = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        return inv
    rows = []
    for r in range(h):
        row = gray[r : r + 1, :]
        _, inv = cv2.threshold(row, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        rows.append(inv[0])
    return np.stack(rows, axis=0)


def _ink_bounds(inv: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.where(inv > 0)
    if len(xs) == 0:
        h, w = inv.shape[:2]
        return 0, 0, w, h
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def compute_line2_geometry(line2_bgr: np.ndarray) -> Line2Geometry:
    h, w = line2_bgr.shape[:2]
    gray = cv2.cvtColor(line2_bgr, cv2.COLOR_BGR2GRAY)
    inv = _analysis_ink_mask(gray)
    _, y0, _, y1 = _ink_bounds(inv)
    cy0, cy1 = y0, y1
    if cy1 - cy0 < max(4, h // 4):
        cy0, cy1 = 0, h

    corridor_x = 0
    corridor_w = w
    corridor_h = cy1 - cy0
    cell_w = corridor_w / TD3_CELLS

    return Line2Geometry(
        corridor_x=corridor_x,
        corridor_y=cy0,
        corridor_w=corridor_w,
        corridor_h=corridor_h,
        cell_width_px=cell_w,
        crop_wh_9=(max(1, int(round(cell_w * 9))), corridor_h),
        crop_wh_10=(max(1, int(round(cell_w * 10))), corridor_h),
    )


def extract_ten_cell_corridor(line2_bgr: np.ndarray, geom: Line2Geometry) -> np.ndarray:
    """OCR input: lower line 2, cells 0–9 only (passport number + check digit). No line 1, no cells 10–43."""
    x0 = geom.corridor_x
    y0 = geom.corridor_y
    cw = geom.cell_width_px
    h = geom.corridor_h
    x10 = int(round(x0 + cw * DOC_FIELD_CELLS))
    crop10 = line2_bgr[y0 : y0 + h, x0:x10].copy()
    if crop10.size == 0:
        crop10 = line2_bgr.copy()[:, : max(1, line2_bgr.shape[1] * DOC_FIELD_CELLS // TD3_CELLS)]
    return crop10


def extract_cell_crops(line2_bgr: np.ndarray, geom: Line2Geometry) -> tuple[np.ndarray, np.ndarray]:
    """Legacy pair; OCR engine must use only the 10-cell crop (second return value)."""
    crop10 = extract_ten_cell_corridor(line2_bgr, geom)
    x0 = geom.corridor_x
    cw = geom.cell_width_px
    x9 = int(round(x0 + cw * 9))
    crop9 = line2_bgr[geom.corridor_y : geom.corridor_y + geom.corridor_h, x0:x9].copy()
    if crop9.size == 0:
        crop9 = crop10[:, : max(1, int(crop10.shape[1] * 9 / 10))]
    return crop9, crop10