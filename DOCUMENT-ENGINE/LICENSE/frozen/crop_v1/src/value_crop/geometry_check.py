"""Non-OCR geometric assertions for value crops."""

from __future__ import annotations

from typing import List, Optional, Tuple

import numpy as np

from src.value_crop.models import FieldStatus, LabelDetection


def _intersect_area(
    a: Tuple[int, int, int, int],
    b: Tuple[int, int, int, int],
) -> int:
    x1 = max(a[0], b[0])
    y1 = max(a[1], b[1])
    x2 = min(a[2], b[2])
    y2 = min(a[3], b[3])
    if x2 <= x1 or y2 <= y1:
        return 0
    return (x2 - x1) * (y2 - y1)


def _bbox_area(b: Tuple[int, int, int, int]) -> int:
    return max(0, b[2] - b[0]) * max(0, b[3] - b[1])


def label_ink_bbox(det: Optional[LabelDetection]) -> Optional[Tuple[int, int, int, int]]:
    if det is None:
        return None
    return det.ink_bbox


def ink_mass_in_rect(ink: np.ndarray, rect: Tuple[int, int, int, int]) -> int:
    x1, y1, x2, y2 = rect
    h, w = ink.shape[:2]
    x1, x2 = max(0, x1), min(w, x2)
    y1, y2 = max(0, y1), min(h, y2)
    if x2 <= x1 or y2 <= y1:
        return 0
    return int(np.count_nonzero(ink[y1:y2, x1:x2]))


def assert_no_overlap(
    value_bbox: Tuple[int, int, int, int],
    blockers: List[Tuple[int, int, int, int]],
    tol_px: int = 2,
) -> bool:
    """True if value does not meaningfully intersect blockers."""
    vx1, vy1, vx2, vy2 = value_bbox
    shrunk = (vx1 + tol_px, vy1 + tol_px, vx2 - tol_px, vy2 - tol_px)
    if shrunk[2] <= shrunk[0] or shrunk[3] <= shrunk[1]:
        return False
    v_area = _bbox_area(shrunk)
    if v_area <= 0:
        return False
    for b in blockers:
        ia = _intersect_area(shrunk, b)
        if ia > max(12, int(0.02 * v_area)):
            return False
    return True


def assert_value_has_ink(
    ink: np.ndarray,
    value_bbox: Tuple[int, int, int, int],
    min_pixels: int = 40,
) -> bool:
    return ink_mass_in_rect(ink, value_bbox) >= min_pixels
