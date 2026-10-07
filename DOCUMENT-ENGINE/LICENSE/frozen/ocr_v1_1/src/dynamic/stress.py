from __future__ import annotations

from typing import Callable, List

import cv2
import numpy as np

PerturbFn = Callable[[np.ndarray], np.ndarray]


def _brightness(delta_pct: float) -> PerturbFn:
    def fn(bgr: np.ndarray) -> np.ndarray:
        factor = 1.0 + delta_pct / 100.0
        out = np.clip(bgr.astype(np.float32) * factor, 0, 255).astype(np.uint8)
        return out

    return fn


def _contrast(delta_pct: float) -> PerturbFn:
    def fn(bgr: np.ndarray) -> np.ndarray:
        factor = 1.0 + delta_pct / 100.0
        mean = np.mean(bgr)
        out = np.clip((bgr.astype(np.float32) - mean) * factor + mean, 0, 255).astype(
            np.uint8
        )
        return out

    return fn


def _scale(factor: float) -> PerturbFn:
    def fn(bgr: np.ndarray) -> np.ndarray:
        h, w = bgr.shape[:2]
        return cv2.resize(
            bgr,
            (max(1, int(w * factor)), max(1, int(h * factor))),
            interpolation=cv2.INTER_LINEAR,
        )

    return fn


def _blur(sigma: float) -> PerturbFn:
    def fn(bgr: np.ndarray) -> np.ndarray:
        k = max(3, int(sigma * 4) | 1)
        return cv2.GaussianBlur(bgr, (k, k), sigma)

    return fn


def _jpeg() -> PerturbFn:
    def fn(bgr: np.ndarray) -> np.ndarray:
        ok, enc = cv2.imencode(".jpg", bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 65])
        if not ok:
            return bgr
        return cv2.imdecode(enc, cv2.IMREAD_COLOR)

    return fn


def _rotate(deg: float) -> PerturbFn:
    def fn(bgr: np.ndarray) -> np.ndarray:
        h, w = bgr.shape[:2]
        m = cv2.getRotationMatrix2D((w / 2, h / 2), deg, 1.0)
        return cv2.warpAffine(
            bgr,
            m,
            (w, h),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=(255, 255, 255),
        )

    return fn


def _pad_variation() -> PerturbFn:
    def fn(bgr: np.ndarray) -> np.ndarray:
        pad = max(4, min(bgr.shape[0], bgr.shape[1]) // 12)
        return cv2.copyMakeBorder(
            bgr, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=(255, 255, 255)
        )

    return fn


def default_perturbations() -> List[tuple[str, PerturbFn]]:
    return [
        ("brightness_m10", _brightness(-10)),
        ("brightness_p10", _brightness(10)),
        ("contrast_m10", _contrast(-10)),
        ("contrast_p10", _contrast(10)),
        ("scale_0_85", _scale(0.85)),
        ("scale_1_15", _scale(1.15)),
        ("blur_sigma_0_8", _blur(0.8)),
        ("jpeg_q65", _jpeg()),
        ("rotate_m1", _rotate(-1.0)),
        ("rotate_p1", _rotate(1.0)),
        ("pad_variation", _pad_variation()),
    ]
