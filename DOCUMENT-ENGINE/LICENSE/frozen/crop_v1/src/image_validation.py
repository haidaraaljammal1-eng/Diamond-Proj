"""Input image validation for user-pre-cropped licence images."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, Optional, Tuple

import cv2
import numpy as np


class InputStatus(str, Enum):
    INPUT_VALID = "INPUT_VALID"
    INPUT_TOO_SMALL = "INPUT_TOO_SMALL"
    INPUT_INVALID_ASPECT = "INPUT_INVALID_ASPECT"
    INPUT_DECODE_FAILED = "INPUT_DECODE_FAILED"


class InputHandoffQuality(str, Enum):
    """Downstream OCR readiness tier (does not change crop geometry)."""

    INPUT_OK_FOR_CROP_AND_OCR = "INPUT_OK_FOR_CROP_AND_OCR"
    INPUT_OK_FOR_CROP_BUT_LOW_RES_FOR_OCR = "INPUT_OK_FOR_CROP_BUT_LOW_RES_FOR_OCR"
    INPUT_TOO_SMALL = "INPUT_TOO_SMALL"


@dataclass
class ValidationResult:
    status: InputStatus
    width: int = 0
    height: int = 0
    aspect_ratio: float = 0.0
    grayscale_stddev: float = 0.0
    message: str = ""
    handoff_quality: Optional[InputHandoffQuality] = None

    def to_dict(self) -> Dict[str, Any]:
        hq = self.handoff_quality
        if hq is None and self.status == InputStatus.INPUT_TOO_SMALL:
            hq = InputHandoffQuality.INPUT_TOO_SMALL
        return {
            "status": self.status.value,
            "handoff_quality": hq.value if hq else None,
            "width": self.width,
            "height": self.height,
            "aspect_ratio": round(self.aspect_ratio, 4),
            "grayscale_stddev": round(self.grayscale_stddev, 4),
            "message": self.message,
        }


def classify_handoff_quality(
    width: int,
    height: int,
    crop_status: InputStatus,
    config: Dict[str, Any],
) -> InputHandoffQuality:
    vcfg = load_config_thresholds(config)
    ocr_min_w = int(vcfg.get("ocr_min_width_px", 480))
    ocr_min_h = int(vcfg.get("ocr_min_height_px", 300))
    if crop_status == InputStatus.INPUT_TOO_SMALL:
        return InputHandoffQuality.INPUT_TOO_SMALL
    if width < ocr_min_w or height < ocr_min_h:
        return InputHandoffQuality.INPUT_OK_FOR_CROP_BUT_LOW_RES_FOR_OCR
    return InputHandoffQuality.INPUT_OK_FOR_CROP_AND_OCR


def load_config_thresholds(config: Dict[str, Any]) -> Dict[str, Any]:
    return config.get("validation", {})


def validate_image(
    image_bgr: Optional[np.ndarray],
    config: Dict[str, Any],
) -> ValidationResult:
    """Validate decoded BGR image against documented thresholds in config."""
    vcfg = load_config_thresholds(config)

    min_w = int(vcfg.get("min_width_px", 400))
    min_h = int(vcfg.get("min_height_px", 250))
    min_ar = float(vcfg.get("min_aspect_ratio", 1.25))
    max_ar = float(vcfg.get("max_aspect_ratio", 2.1))
    require_landscape = bool(vcfg.get("require_landscape", True))
    blank_std = float(vcfg.get("blank_stddev_threshold", 8.0))

    if image_bgr is None or image_bgr.size == 0:
        return ValidationResult(
            status=InputStatus.INPUT_DECODE_FAILED,
            message="Image could not be decoded or is empty.",
        )

    h, w = image_bgr.shape[:2]
    aspect = w / float(h) if h > 0 else 0.0

    if w < min_w or h < min_h:
        return ValidationResult(
            status=InputStatus.INPUT_TOO_SMALL,
            width=w,
            height=h,
            aspect_ratio=aspect,
            handoff_quality=InputHandoffQuality.INPUT_TOO_SMALL,
            message=f"Dimensions {w}x{h} below minimum {min_w}x{min_h}.",
        )

    if require_landscape and w <= h:
        return ValidationResult(
            status=InputStatus.INPUT_INVALID_ASPECT,
            width=w,
            height=h,
            aspect_ratio=aspect,
            message="Image is not landscape (width must exceed height).",
        )

    if aspect < min_ar or aspect > max_ar:
        return ValidationResult(
            status=InputStatus.INPUT_INVALID_ASPECT,
            width=w,
            height=h,
            aspect_ratio=aspect,
            message=f"Aspect ratio {aspect:.3f} outside [{min_ar}, {max_ar}].",
        )

    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    stddev = float(np.std(gray))
    if stddev < blank_std:
        return ValidationResult(
            status=InputStatus.INPUT_INVALID_ASPECT,
            width=w,
            height=h,
            aspect_ratio=aspect,
            grayscale_stddev=stddev,
            message=f"Image appears blank (grayscale stddev {stddev:.2f} < {blank_std}).",
        )

    return ValidationResult(
        status=InputStatus.INPUT_VALID,
        width=w,
        height=h,
        aspect_ratio=aspect,
        grayscale_stddev=stddev,
        handoff_quality=classify_handoff_quality(w, h, InputStatus.INPUT_VALID, config),
        message="Input passed validation.",
    )


def decode_image(path: str) -> Tuple[Optional[np.ndarray], ValidationResult]:
    """Load image from path; returns (image, validation_result)."""
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        return None, ValidationResult(
            status=InputStatus.INPUT_DECODE_FAILED,
            message=f"cv2.imread failed for path: {path}",
        )
    return img, ValidationResult(status=InputStatus.INPUT_VALID)
