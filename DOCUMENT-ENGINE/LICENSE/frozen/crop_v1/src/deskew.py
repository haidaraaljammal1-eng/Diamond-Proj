"""Small residual rotation correction using horizontal structure (no OCR)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import cv2
import numpy as np


@dataclass
class DeskewResult:
    applied: bool
    original_angle_deg: float
    applied_rotation_deg: float
    final_angle_deg: float
    normalized_bgr: np.ndarray
    debug_bgr: Optional[np.ndarray] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "applied": self.applied,
            "original_angle_deg": round(self.original_angle_deg, 4),
            "applied_rotation_deg": round(self.applied_rotation_deg, 4),
            "final_angle_deg": round(self.final_angle_deg, 4),
        }


def _estimate_horizontal_median_angle_deg(gray: np.ndarray, cfg: Dict[str, Any]) -> float:
    h, w = gray.shape[:2]
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 50, 150, apertureSize=3)

    min_len = max(30, int(w * float(cfg.get("hough_min_line_length_frac", 0.15))))
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180,
        threshold=int(cfg.get("hough_threshold", 80)),
        minLineLength=min_len,
        maxLineGap=int(cfg.get("hough_max_line_gap_px", 20)),
    )
    if lines is None:
        return 0.0

    angles: List[float] = []
    for line in lines[:, 0]:
        x1, y1, x2, y2 = line
        dx = x2 - x1
        dy = y2 - y1
        if abs(dx) < 10:
            continue
        angle = np.degrees(np.arctan2(dy, dx))
        if abs(angle) > 45:
            continue
        angles.append(angle)

    if not angles:
        return 0.0

    bin_size = float(cfg.get("angle_cluster_bin_deg", 1.0))
    rounded = [round(a / bin_size) * bin_size for a in angles]
    values, counts = np.unique(rounded, return_counts=True)
    median_bin = values[int(np.argmax(counts))]
    cluster = [a for a in angles if abs(a - median_bin) <= bin_size * 1.5]
    return float(np.median(cluster)) if cluster else float(median_bin)


def _horizontal_alignment_score(gray: np.ndarray) -> float:
    """Higher score when strong horizontal structures align with image rows."""
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    row_strength = np.sum(np.abs(gy), axis=1)
    return float(np.var(row_strength))


def _refine_rotation_deg(
    gray: np.ndarray,
    center_angle_deg: float,
    window_deg: float = 1.5,
    step_deg: float = 0.05,
) -> float:
    h, w = gray.shape[:2]
    center = (w / 2.0, h / 2.0)
    best_angle = center_angle_deg
    best_score = -1.0
    start = center_angle_deg - window_deg
    end = center_angle_deg + window_deg
    angle = start
    while angle <= end + 1e-9:
        m = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(
            gray,
            m,
            (w, h),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_REPLICATE,
        )
        score = _horizontal_alignment_score(rotated)
        if score > best_score:
            best_score = score
            best_angle = angle
        angle += step_deg
    return float(best_angle)


def _rotate_image(bgr: np.ndarray, angle_deg: float) -> np.ndarray:
    h, w = bgr.shape[:2]
    center = (w / 2.0, h / 2.0)
    m = cv2.getRotationMatrix2D(center, angle_deg, 1.0)
    cos = abs(m[0, 0])
    sin = abs(m[0, 1])
    new_w = int(h * sin + w * cos)
    new_h = int(h * cos + w * sin)
    m[0, 2] += (new_w / 2) - center[0]
    m[1, 2] += (new_h / 2) - center[1]
    return cv2.warpAffine(
        bgr,
        m,
        (new_w, new_h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,
    )


def deskew_if_needed(
    image_bgr: np.ndarray,
    config: Dict[str, Any],
) -> DeskewResult:
    cfg = config.get("deskew", {})
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)

    original_angle = _estimate_horizontal_median_angle_deg(gray, cfg)
    apply_min = float(cfg.get("apply_angle_deg_min", 0.35))
    apply_max = float(cfg.get("apply_angle_deg_max", 8.0))

    if abs(original_angle) < apply_min or abs(original_angle) > apply_max:
        return DeskewResult(
            applied=False,
            original_angle_deg=original_angle,
            applied_rotation_deg=0.0,
            final_angle_deg=original_angle,
            normalized_bgr=image_bgr.copy(),
            debug_bgr=None,
        )

    # Refine correction around the opposite of measured tilt.
    correction = _refine_rotation_deg(gray, center_angle_deg=-original_angle)
    if abs(correction) < apply_min:
        return DeskewResult(
            applied=False,
            original_angle_deg=original_angle,
            applied_rotation_deg=0.0,
            final_angle_deg=original_angle,
            normalized_bgr=image_bgr.copy(),
            debug_bgr=None,
        )

    rotated = _rotate_image(image_bgr, correction)
    gray_rot = cv2.cvtColor(rotated, cv2.COLOR_BGR2GRAY)
    final_angle = _estimate_horizontal_median_angle_deg(gray_rot, cfg)

    if abs(final_angle) > abs(original_angle) - 0.15:
        return DeskewResult(
            applied=False,
            original_angle_deg=original_angle,
            applied_rotation_deg=0.0,
            final_angle_deg=original_angle,
            normalized_bgr=image_bgr.copy(),
            debug_bgr=None,
        )

    debug = rotated.copy()
    h, w = debug.shape[:2]
    cv2.line(debug, (0, h // 2), (w - 1, h // 2), (0, 0, 255), 2)
    cv2.putText(
        debug,
        f"deskew: {correction:.2f} deg",
        (20, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.0,
        (0, 128, 255),
        2,
        cv2.LINE_AA,
    )

    return DeskewResult(
        applied=True,
        original_angle_deg=original_angle,
        applied_rotation_deg=correction,
        final_angle_deg=final_angle,
        normalized_bgr=rotated,
        debug_bgr=debug,
    )
