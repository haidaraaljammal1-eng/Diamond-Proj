"""Automatic TD3 MRZ region detection (OpenCV, image-agnostic heuristics)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np


@dataclass
class MRZDetectionResult:
    success: bool
    mrz_crop: np.ndarray | None
    bbox: tuple[int, int, int, int] | None  # x, y, w, h in original image coords
    angle_deg: float
    overlay: np.ndarray
    geometry: dict[str, Any]
    message: str = ""


def _order_points(pts: np.ndarray) -> np.ndarray:
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def _four_point_transform(image: np.ndarray, pts: np.ndarray) -> tuple[np.ndarray, float]:
    rect = _order_points(pts)
    (tl, tr, br, bl) = rect
    width_a = np.linalg.norm(br - bl)
    width_b = np.linalg.norm(tr - tl)
    max_w = int(max(width_a, width_b))
    height_a = np.linalg.norm(tr - br)
    height_b = np.linalg.norm(tl - bl)
    max_h = int(max(height_a, height_b))
    max_w = max(max_w, 100)
    max_h = max(max_h, 30)
    dst = np.array(
        [[0, 0], [max_w - 1, 0], [max_w - 1, max_h - 1], [0, max_h - 1]], dtype="float32"
    )
    m = cv2.getPerspectiveTransform(rect, dst)
    warped = cv2.warpPerspective(image, m, (max_w, max_h))
    dx = tr[0] - tl[0]
    dy = tr[1] - tl[1]
    angle = float(np.degrees(np.arctan2(dy, dx)))
    return warped, angle


def _score_mrz_band(gray_band: np.ndarray) -> float:
    """Higher score = more likely MRZ (two dense text rows)."""
    h, w = gray_band.shape[:2]
    if h < 20 or w < 200:
        return 0.0
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    norm = clahe.apply(gray_band)
    _, bw = cv2.threshold(norm, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(w // 30, 15), 3))
    closed = cv2.morphologyEx(bw, cv2.MORPH_CLOSE, kernel, iterations=2)
    proj = closed.sum(axis=1).astype(np.float32)
    if proj.max() <= 0:
        return 0.0
    proj /= proj.max()
    peaks = []
    thresh = 0.35
    in_peak = False
    start = 0
    for i, v in enumerate(proj):
        if v >= thresh and not in_peak:
            in_peak = True
            start = i
        elif v < thresh and in_peak:
            in_peak = False
            peaks.append((start, i))
    if in_peak:
        peaks.append((start, len(proj) - 1))
    if len(peaks) < 2:
        return float(len(peaks)) * 0.2
    peaks = sorted(peaks, key=lambda p: p[1] - p[0], reverse=True)[:2]
    peaks.sort(key=lambda p: p[0])
    gap = peaks[1][0] - peaks[0][1]
    row_heights = [(p[1] - p[0]) for p in peaks]
    width_fill = closed.sum() / (h * w * 255)
    gap_penalty = 1.0 if 0 <= gap <= h * 0.25 else 0.5
    height_score = 1.0 if h < gray_band.shape[0] * 0.35 else 0.8
    return float(width_fill * 10 * gap_penalty * height_score * min(row_heights) / max(h, 1))


def detect_mrz_region(image_bgr: np.ndarray) -> MRZDetectionResult:
    h_img, w_img = image_bgr.shape[:2]
    overlay = image_bgr.copy()
    gray_full = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)

    best_score = 0.0
    best_bbox = None
    best_crop = None
    best_angle = 0.0
    search_log: list[dict[str, Any]] = []

    # Search sliding vertical windows in lower portion (TD3 MRZ is at document bottom).
    band_fracs = [0.12, 0.15, 0.18, 0.22, 0.28]
    y_starts = [int(h_img * f) for f in (0.45, 0.50, 0.55, 0.60, 0.65, 0.70)]

    for y0 in y_starts:
        for frac in band_fracs:
            band_h = int(h_img * frac)
            y1 = min(y0 + band_h, h_img)
            if y1 - y0 < 30:
                continue
            band = gray_full[y0:y1, :]
            score = _score_mrz_band(band)
            search_log.append({"y0": y0, "y1": y1, "band_frac": frac, "score": score})
            if score > best_score:
                best_score = score
                best_bbox = (0, y0, w_img, y1 - y0)
                best_crop = image_bgr[y0:y1, :].copy()
                best_angle = 0.0

    # Refine with contours on best band
    if best_crop is not None and best_bbox is not None:
        g = cv2.cvtColor(best_crop, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        g = clahe.apply(g)
        edges = cv2.Canny(g, 50, 150)
        k = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 5))
        edges = cv2.dilate(edges, k, iterations=2)
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        x, y, bw, bh = best_bbox
        for cnt in sorted(contours, key=cv2.contourArea, reverse=True)[:5]:
            area = cv2.contourArea(cnt)
            if area < w_img * 20:
                continue
            peri = cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
            if len(approx) == 4:
                pts = approx.reshape(4, 2).astype("float32")
                warped, angle = _four_point_transform(best_crop, pts)
                if warped.shape[0] >= 25 and warped.shape[1] >= 200:
                    best_crop = warped
                    best_angle = angle
                    break

    geometry = {
        "image_width": w_img,
        "image_height": h_img,
        "search_windows": search_log,
        "best_score": best_score,
        "bbox_xywh": best_bbox,
        "deskew_angle_deg": best_angle,
    }

    if best_crop is None or best_score < 0.15:
        cv2.putText(
            overlay,
            "MRZ region not found",
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.0,
            (0, 0, 255),
            2,
        )
        return MRZDetectionResult(
            success=False,
            mrz_crop=None,
            bbox=None,
            angle_deg=0.0,
            overlay=overlay,
            geometry=geometry,
            message="low confidence MRZ band score",
        )

    x, y, bw, bh = best_bbox
    cv2.rectangle(overlay, (x, y), (x + bw, y + bh), (0, 255, 0), 3)
    cv2.putText(
        overlay,
        f"MRZ score={best_score:.3f} angle={best_angle:.1f}",
        (x, max(y - 10, 25)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (0, 255, 0),
        2,
    )

    return MRZDetectionResult(
        success=True,
        mrz_crop=best_crop,
        bbox=best_bbox,
        angle_deg=best_angle,
        overlay=overlay,
        geometry=geometry,
    )


def save_detection_artifacts(
    result: MRZDetectionResult,
    out_dir: Path,
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out_dir / "detection_overlay.png"), result.overlay)
    if result.mrz_crop is not None:
        cv2.imwrite(str(out_dir / "mrz_region.png"), result.mrz_crop)
    with open(out_dir / "geometry.json", "w", encoding="utf-8") as f:
        json.dump(result.geometry, f, indent=2)
