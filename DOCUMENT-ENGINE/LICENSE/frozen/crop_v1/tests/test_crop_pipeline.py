from __future__ import annotations

from pathlib import Path

import cv2

from src.run_crop_pipeline import run_pipeline
from tests.conftest import make_synthetic_licence


def test_full_pipeline_synthetic(tmp_path, config):
    input_path = tmp_path / "sample.png"
    out_dir = tmp_path / "out"
    img = make_synthetic_licence(tilt_deg=0.0)
    cv2.imwrite(str(input_path), img)

    report = run_pipeline(input_path, out_dir, config)
    assert report["validation"]["status"] == "INPUT_VALID"
    assert report["recommendation"] in (
        "READY_FOR_VALUE_CROP_CALIBRATION",
        "READY_FOR_MULTI_LICENCE_DYNAMIC_CROP_TEST",
        "NEEDS_DYNAMIC_VALUE_BOUNDARY_FIX",
        "NEEDS_ANOTHER_REAL01_BOUNDARY_FIX",
    )
    assert (out_dir / "05_structural_debug.png").is_file()
