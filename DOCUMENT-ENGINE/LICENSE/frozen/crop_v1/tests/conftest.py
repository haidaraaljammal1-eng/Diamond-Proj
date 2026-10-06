"""Shared test fixtures."""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
import pytest


@pytest.fixture
def project_root() -> Path:
    return Path(__file__).resolve().parents[1]


@pytest.fixture
def config(project_root: Path) -> dict:
    with (project_root / "config" / "crop_layout.json").open("r", encoding="utf-8") as f:
        return json.load(f)


def make_synthetic_licence(
    width: int = 1200,
    height: int = 760,
    tilt_deg: float = 0.0,
) -> np.ndarray:
    """Procedural user-cropped licence with an 8-row data table (for geometry tests)."""
    img = np.full((height, width, 3), 235, dtype=np.uint8)
    cv2.rectangle(img, (10, 10), (width - 11, height - 11), (180, 180, 180), 2)
    cv2.putText(
        img,
        "UAE DRIVING LICENCE",
        (width // 2 - 220, 70),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.1,
        (40, 40, 40),
        2,
        cv2.LINE_AA,
    )

    x1, x2 = int(width * 0.38), int(width * 0.95)
    y1, y2 = int(height * 0.22), int(height * 0.88)
    cv2.rectangle(img, (x1, y1), (x2, y2), (120, 120, 120), 2)

    row_count = 8
    for i in range(row_count + 1):
        y = y1 + int((y2 - y1) * i / row_count)
        cv2.line(img, (x1, y), (x2, y), (60, 60, 60), 2)

    for i in range(1, row_count + 1):
        y_mid = y1 + int((y2 - y1) * (i - 0.5) / row_count)
        cv2.putText(
            img,
            f"field_{i}",
            (x1 + 20, y_mid),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (30, 30, 30),
            1,
            cv2.LINE_AA,
        )

    if abs(tilt_deg) > 1e-3:
        center = (width / 2, height / 2)
        m = cv2.getRotationMatrix2D(center, tilt_deg, 1.0)
        img = cv2.warpAffine(
            img,
            m,
            (width, height),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_REPLICATE,
        )
    return img


@pytest.fixture
def synthetic_licence_bgr() -> np.ndarray:
    return make_synthetic_licence()
