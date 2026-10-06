"""Row preprocessing: line suppression and text-band detection."""

from __future__ import annotations

from typing import Tuple

import cv2
import numpy as np


def suppress_table_lines(gray: np.ndarray) -> np.ndarray:
    """Conservative horizontal/vertical line suppression on a processing copy."""
    h, w = gray.shape[:2]
    out = gray.copy()
    horiz_k = cv2.getStructuringElement(cv2.MORPH_RECT, (max(20, w // 6), 1))
    vert_k = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(2, h // 10)))

    _, binary = cv2.threshold(
        cv2.GaussianBlur(gray, (3, 3), 0),
        0,
        255,
        cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU,
    )
    horiz = cv2.morphologyEx(binary, cv2.MORPH_OPEN, horiz_k)
    vert = cv2.morphologyEx(binary, cv2.MORPH_OPEN, vert_k)
    lines = cv2.bitwise_or(horiz, vert)

    mask = lines > 0
    out[mask] = np.clip(out[mask].astype(np.int16) + 35, 0, 255).astype(np.uint8)
    return out


def detect_text_band(ink: np.ndarray) -> Tuple[int, int]:
    """Return vertical text band (y1, y2) from character-like ink components."""
    h, w = ink.shape[:2]
    num, _, stats, _ = cv2.connectedComponentsWithStats(ink, connectivity=8)
    y_top = h
    y_bot = -1
    for i in range(1, num):
        _, by, bw, bh, area = stats[i]
        if bh < 5 or area < 12:
            continue
        if bh > int(0.92 * h) and bw > int(0.35 * w):
            continue
        y_top = min(y_top, int(by))
        y_bot = max(y_bot, int(by + bh - 1))

    if y_bot >= y_top:
        return max(0, y_top - 1), min(h - 1, y_bot + 1)

    row_energy = np.sum(ink > 0, axis=1).astype(np.float32)
    if row_energy.max() < 1:
        return 0, h - 1
    thresh = max(2.0, 0.25 * float(np.max(row_energy)))
    active = np.where(row_energy >= thresh)[0]
    if active.size == 0:
        return int(h * 0.15), int(h * 0.85)
    y1 = max(0, int(active[0]) - 1)
    y2 = min(h - 1, int(active[-1]) + 1)
    return y1, y2


def prepare_ink_mask(gray: np.ndarray) -> np.ndarray:
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    _, ink = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return ink
