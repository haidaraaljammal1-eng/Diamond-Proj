"""OCR handoff contract: eligibility gating and content sanity (no OCR)."""

from __future__ import annotations

import json
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from src.value_crop.export import VALUE_CROP_FILES
from src.value_crop.models import FieldStatus


class ContentSanityStatus(str, Enum):
    CONTENT_PRESENT = "CONTENT_PRESENT"
    CONTENT_EMPTY_OR_UNRELIABLE = "CONTENT_EMPTY_OR_UNRELIABLE"
    CONTENT_UNCERTAIN = "CONTENT_UNCERTAIN"


class SourceReadability(str, Enum):
    READABLE = "READABLE"
    PARTIALLY_READABLE = "PARTIALLY_READABLE"
    SOURCE_UNREADABLE = "SOURCE_UNREADABLE"


def is_field_ocr_eligible(field: Dict[str, Any]) -> bool:
    """Consumer contract: never trust PNG without report + sanity gate."""
    geom = field.get("crop_geometry_status") or field.get("field_status")
    if geom != FieldStatus.VALUE_OK.value:
        return False
    sanity = field.get("content_sanity_status")
    if sanity == ContentSanityStatus.CONTENT_EMPTY_OR_UNRELIABLE.value:
        return False
    return bool(field.get("ocr_eligible", False))


def _is_placeholder_crop(img: np.ndarray) -> bool:
    if img is None or img.size == 0:
        return True
    h, w = img.shape[:2]
    if w <= 220 and h <= 50:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
        return float(np.mean(gray)) > 200
    return False


def assess_crop_content_sanity(crop_bgr: np.ndarray) -> Tuple[ContentSanityStatus, Dict[str, float]]:
    """Post-crop gate only; does not alter geometry."""
    metrics: Dict[str, float] = {}
    if crop_bgr is None or crop_bgr.size == 0:
        return ContentSanityStatus.CONTENT_EMPTY_OR_UNRELIABLE, metrics

    if _is_placeholder_crop(crop_bgr):
        metrics["placeholder"] = 1.0
        return ContentSanityStatus.CONTENT_EMPTY_OR_UNRELIABLE, metrics

    gray = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2GRAY) if crop_bgr.ndim == 3 else crop_bgr
    h, w = gray.shape[:2]
    metrics["width"] = float(w)
    metrics["height"] = float(h)

    _, ink = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    ink_px = int(np.count_nonzero(ink))
    metrics["ink_pixels"] = float(ink_px)
    metrics["ink_ratio"] = ink_px / float(max(1, w * h))

    if ink_px < 60:
        return ContentSanityStatus.CONTENT_EMPTY_OR_UNRELIABLE, metrics

    num, _, stats, _ = cv2.connectedComponentsWithStats(ink, connectivity=8)
    glyph_area = 0.0
    small_area = 0.0
    largest = 0
    tall_count = 0
    min_glyph_h = max(5, int(0.22 * h))
    max_glyph_h = max(min_glyph_h + 1, int(0.92 * h))

    for i in range(1, num):
        area = int(stats[i, cv2.CC_STAT_AREA])
        bw = int(stats[i, cv2.CC_STAT_WIDTH])
        bh = int(stats[i, cv2.CC_STAT_HEIGHT])
        largest = max(largest, area)
        if area < 35:
            small_area += area
            continue
        if bh >= min_glyph_h and bh <= max_glyph_h and bw >= 2:
            glyph_area += area
            tall_count += 1

    metrics["glyph_area"] = glyph_area
    metrics["largest_cc"] = float(largest)
    metrics["tall_components"] = float(tall_count)
    metrics["small_area_ratio"] = small_area / float(max(1, ink_px))

    proj = np.sum(ink > 0, axis=0)
    active_cols = int(np.sum(proj > 0))
    metrics["active_col_ratio"] = active_cols / float(max(1, w))

    lap = cv2.Laplacian(gray, cv2.CV_64F)
    metrics["laplacian_var"] = float(lap.var())

    if glyph_area >= 120 or (largest >= 180 and tall_count >= 1):
        return ContentSanityStatus.CONTENT_PRESENT, metrics

    if (
        ink_px >= 60
        and glyph_area < 80
        and metrics["small_area_ratio"] > 0.55
        and metrics["active_col_ratio"] > 0.55
        and tall_count <= 1
    ):
        return ContentSanityStatus.CONTENT_EMPTY_OR_UNRELIABLE, metrics

    if glyph_area >= 70 or largest >= 100:
        return ContentSanityStatus.CONTENT_PRESENT, metrics

    return ContentSanityStatus.CONTENT_UNCERTAIN, metrics


def estimate_source_readability(
    grayscale_stddev: float,
    laplacian_var: float,
) -> SourceReadability:
    if grayscale_stddev < 12 or laplacian_var < 40:
        return SourceReadability.SOURCE_UNREADABLE
    if laplacian_var < 120 or grayscale_stddev < 25:
        return SourceReadability.PARTIALLY_READABLE
    return SourceReadability.READABLE


def build_ocr_handoff(
    output_dir: Path,
    report: Dict[str, Any],
    input_grayscale_stddev: float = 0.0,
) -> Dict[str, Any]:
    vc = report.get("value_crops_phase2", {}).get("value_crop", {})
    fields_in = vc.get("fields", [])
    field_by_sem = {f["semantic"]: f for f in fields_in}
    handoff_fields: List[Dict[str, Any]] = []

    for filename, semantic in VALUE_CROP_FILES:
        crop_path = output_dir / "value_crops" / filename
        fin = field_by_sem.get(semantic, {})
        geom_status = fin.get("field_status", "VALUE_BOUNDARY_UNCERTAIN")
        crop_geometry_status = geom_status

        img = cv2.imread(str(crop_path)) if crop_path.is_file() else None
        sanity, metrics = assess_crop_content_sanity(img)
        lap = metrics.get("laplacian_var", 0.0)
        src_read = estimate_source_readability(input_grayscale_stddev, lap).value

        ocr_eligible = (
            crop_geometry_status == FieldStatus.VALUE_OK.value
            and sanity != ContentSanityStatus.CONTENT_EMPTY_OR_UNRELIABLE
        )

        w = int(metrics.get("width", 0)) if img is not None else 0
        h = int(metrics.get("height", 0)) if img is not None else 0
        if img is not None and w == 0:
            h, w = img.shape[:2]

        handoff_fields.append(
            {
                "field_name": semantic,
                "crop_path": str(crop_path) if crop_path.is_file() else None,
                "crop_geometry_status": crop_geometry_status,
                "content_sanity_status": sanity.value,
                "content_sanity_metrics": metrics,
                "source_readability": src_read,
                "ocr_eligible": ocr_eligible,
                "width": w,
                "height": h,
            }
        )

    meta = report.get("run_metadata", {})
    return {
        "run_id": meta.get("run_id"),
        "input_sha256": meta.get("input_sha256"),
        "pipeline_status": meta.get("pipeline_status"),
        "input_handoff_quality": report.get("validation", {}).get("handoff_quality"),
        "fields": handoff_fields,
    }


def write_ocr_handoff(output_dir: Path, handoff: Dict[str, Any]) -> Path:
    path = output_dir / "ocr_handoff.json"
    path.write_text(json.dumps(handoff, indent=2), encoding="utf-8")
    return path
