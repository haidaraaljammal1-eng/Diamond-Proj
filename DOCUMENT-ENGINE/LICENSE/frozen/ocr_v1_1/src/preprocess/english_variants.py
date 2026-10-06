from __future__ import annotations

import hashlib
from pathlib import Path

import cv2
import numpy as np

VARIANTS = (
    "P0_RAW",
    "P1_PAD",
    "P2_GRAY_PAD",
    "P3_UP2_GRAY_PAD",
    "P4_UP3_GRAY_PAD",
    "P5_CLAHE_UP2_PAD",
    "P6_SHARP_UP2_PAD",
    "P7_OTSU_UP2_PAD",
)


def _pad_white(bgr: np.ndarray, pad_px: int) -> np.ndarray:
    return cv2.copyMakeBorder(
        bgr, pad_px, pad_px, pad_px, pad_px, cv2.BORDER_CONSTANT, value=(255, 255, 255)
    )


def _to_bgr_gray(bgr: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)


def _upscale(bgr: np.ndarray, factor: int) -> np.ndarray:
    if factor <= 1:
        return bgr
    h, w = bgr.shape[:2]
    return cv2.resize(bgr, (w * factor, h * factor), interpolation=cv2.INTER_CUBIC)


def apply_variant(bgr: np.ndarray, variant: str) -> np.ndarray:
    if variant == "P0_RAW":
        return bgr.copy()
    h, w = bgr.shape[:2]
    pad_px = max(8, int(min(h, w) * 0.1))
    if variant == "P1_PAD":
        return _pad_white(bgr, pad_px)
    if variant == "P2_GRAY_PAD":
        return _pad_white(_to_bgr_gray(bgr), pad_px)
    if variant == "P3_UP2_GRAY_PAD":
        return _pad_white(_to_bgr_gray(_upscale(bgr, 2)), pad_px)
    if variant == "P4_UP3_GRAY_PAD":
        return _pad_white(_to_bgr_gray(_upscale(bgr, 3)), pad_px)
    if variant == "P5_CLAHE_UP2_PAD":
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        up = _upscale(cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR), 2)
        return _pad_white(up, pad_px)
    if variant == "P6_SHARP_UP2_PAD":
        gray_bgr = _to_bgr_gray(_upscale(bgr, 2))
        kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)
        sharp = cv2.filter2D(gray_bgr, -1, kernel)
        return _pad_white(sharp, pad_px)
    if variant == "P7_OTSU_UP2_PAD":
        gray = cv2.cvtColor(_upscale(bgr, 2), cv2.COLOR_BGR2GRAY)
        _, th = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        bin_bgr = cv2.cvtColor(th, cv2.COLOR_GRAY2BGR)
        return _pad_white(bin_bgr, pad_px)
    raise ValueError(f"Unknown variant: {variant}")


def materialize_variant(
    source_path: Path,
    variant: str,
    cache_dir: Path,
    crop_sha256: str,
) -> Path:
    cache_dir.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256(f"{crop_sha256}:{variant}".encode()).hexdigest()[:16]
    out = cache_dir / f"{key}_{variant}.png"
    if out.is_file():
        return out
    bgr = cv2.imread(str(source_path), cv2.IMREAD_COLOR)
    if bgr is None:
        raise FileNotFoundError(source_path)
    processed = apply_variant(bgr, variant)
    cv2.imwrite(str(out), processed)
    return out
