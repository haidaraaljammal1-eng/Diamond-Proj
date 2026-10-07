"""Canonical row normalization for label localization."""

from __future__ import annotations

from typing import Tuple

import cv2
import numpy as np


def normalize_row(
    row_bgr: np.ndarray,
    canonical_width: int,
) -> Tuple[np.ndarray, float]:
    h, w = row_bgr.shape[:2]
    if w == canonical_width:
        return row_bgr.copy(), 1.0
    scale = canonical_width / float(w)
    new_h = max(1, int(round(h * scale)))
    norm = cv2.resize(row_bgr, (canonical_width, new_h), interpolation=cv2.INTER_LINEAR)
    return norm, scale


def map_x_to_original(x_can: int, scale: float) -> int:
    return int(round(x_can / scale))


def map_bbox_to_original(
    bbox: Tuple[int, int, int, int],
    scale: float,
) -> Tuple[int, int, int, int]:
    x1, y1, x2, y2 = bbox
    inv = 1.0 / scale
    return (
        int(round(x1 * inv)),
        int(round(y1 * inv)),
        int(round(x2 * inv)),
        int(round(y2 * inv)),
    )
