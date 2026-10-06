"""Deterministic center value trim on normalized row crops (no OCR label detection)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Tuple

import cv2
import numpy as np

_CONFIG_PATH = (
    Path(__file__).resolve().parents[3]
    / "frozen"
    / "ocr_v1_2"
    / "config"
    / "two_field_label_zones.json"
)

_FIELD_KEYS = {
    "license_number": "license_number",
    "expiry_date": "expiry_date",
}


def _load_config() -> dict[str, Any]:
    return json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))


def value_x_bounds(row_width: int, field_name: str) -> Tuple[int, int]:
    cfg = _load_config()
    key = _FIELD_KEYS.get(field_name)
    if not key:
        raise ValueError(f"unsupported field {field_name}")
    field_cfg = cfg[key]
    left_r = float(field_cfg["left_label_width_ratio"])
    right_r = float(field_cfg["right_label_width_ratio"])
    margin = float(field_cfg["safety_margin_ratio"])
    w = float(row_width)
    x1 = int(round((left_r + margin) * w))
    x2 = int(round((1.0 - right_r - margin) * w))
    x1 = max(0, min(x1, row_width - 2))
    x2 = max(x1 + 2, min(x2, row_width))
    return x1, x2


def trim_row_to_value_zone(row_bgr: np.ndarray, field_name: str) -> Tuple[np.ndarray, dict[str, Any]]:
    h, w = row_bgr.shape[:2]
    x1, x2 = value_x_bounds(w, field_name)
    trimmed = row_bgr[:, x1:x2].copy()
    meta = {
        "field_name": field_name,
        "row_width": w,
        "row_height": h,
        "value_x1": x1,
        "value_x2": x2,
        "value_width": x2 - x1,
    }
    return trimmed, meta


def write_trimmed_crop(
    row_path: Path,
    out_path: Path,
    field_name: str,
) -> dict[str, Any]:
    img = cv2.imread(str(row_path))
    if img is None:
        raise ValueError(f"GEOMETRY_REJECTED cannot read row crop {row_path}")
    trimmed, meta = trim_row_to_value_zone(img, field_name)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out_path), trimmed)
    meta["source_row"] = str(row_path)
    meta["output_path"] = str(out_path)
    return meta
