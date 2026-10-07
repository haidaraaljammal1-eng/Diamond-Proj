from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

import cv2
import numpy as np


@dataclass
class CropFeatures:
    width: int
    height: int
    aspect_ratio: float
    mean_brightness: float
    contrast_std: float
    estimated_text_height: float
    foreground_ratio: float
    edge_ink_left: float
    edge_ink_right: float
    edge_ink_top: float
    edge_ink_bottom: float
    connected_component_count: int
    min_border_clearance: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def extract_features(bgr: np.ndarray) -> CropFeatures:
    h, w = bgr.shape[:2]
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    mean_brightness = float(np.mean(gray))
    contrast_std = float(np.std(gray))

    _, th = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    fg = th > 0
    foreground_ratio = float(np.mean(fg))

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(th, connectivity=8)
    cc_count = max(0, num_labels - 1)
    heights = []
    if cc_count:
        for i in range(1, num_labels):
            heights.append(stats[i, cv2.CC_STAT_HEIGHT])
    estimated_text_height = float(np.median(heights)) if heights else float(h) * 0.4

    def edge_ink(strip: np.ndarray) -> float:
        return float(np.mean(strip < 200))

    margin = max(1, min(3, w // 20, h // 20))
    edge_ink_left = edge_ink(gray[:, :margin])
    edge_ink_right = edge_ink(gray[:, -margin:])
    edge_ink_top = edge_ink(gray[:margin, :])
    edge_ink_bottom = edge_ink(gray[-margin:, :])

    ys, xs = np.where(fg)
    if len(xs) == 0:
        min_border_clearance = float(min(w, h))
    else:
        min_border_clearance = float(
            min(xs.min(), ys.min(), w - 1 - xs.max(), h - 1 - ys.max())
        )

    return CropFeatures(
        width=w,
        height=h,
        aspect_ratio=w / max(h, 1),
        mean_brightness=mean_brightness,
        contrast_std=contrast_std,
        estimated_text_height=estimated_text_height,
        foreground_ratio=foreground_ratio,
        edge_ink_left=edge_ink_left,
        edge_ink_right=edge_ink_right,
        edge_ink_top=edge_ink_top,
        edge_ink_bottom=edge_ink_bottom,
        connected_component_count=cc_count,
        min_border_clearance=min_border_clearance,
    )


def load_features(crop_path: str) -> CropFeatures:
    bgr = cv2.imread(crop_path, cv2.IMREAD_COLOR)
    if bgr is None:
        raise FileNotFoundError(crop_path)
    return extract_features(bgr)
