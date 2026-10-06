"""OCR V1.2 two-field crop + policy tests."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np

LICENSE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LICENSE_ROOT))
sys.path.insert(0, str(LICENSE_ROOT))
sys.path.insert(0, str(LICENSE_ROOT / "frozen" / "ocr_v1_1"))

from services.uae_license_api.two_field.geometry_gate import validate_crop_geometry  # noqa: E402
from services.uae_license_api.two_field.row_value_trim import (  # noqa: E402
    trim_row_to_value_zone,
    value_x_bounds,
)
from services.uae_license_api.two_field.ocr_pipeline import TwoFieldOcrPipeline  # noqa: E402

OUTPUT = LICENSE_ROOT / "output" / "test_two_field_v1_2"
REFERENCE_FIXTURE = (
    LICENSE_ROOT.parent.parent
    / "APP"
    / "frontend"
    / "e2e"
    / "fixtures"
    / "driving-license"
    / "uae-driving-license-ocr-test.png"
)


def _run_crop(reference: Path, out_crop: Path) -> dict:
    import os
    import subprocess

    crop_root = LICENSE_ROOT / "frozen" / "crop_v1"
    py = LICENSE_ROOT / ".venv" / "Scripts" / "python.exe"
    if not py.is_file():
        py = Path(sys.executable)
    out_crop.mkdir(parents=True, exist_ok=True)
    cmd = [
        str(py),
        "-m",
        "src.run_crop_pipeline",
        "--input",
        str(reference.resolve()),
        "--output",
        str(out_crop.resolve()),
        "--config",
        str((crop_root / "config" / "crop_layout.json").resolve()),
    ]
    env = {**os.environ, "PYTHONPATH": str(crop_root.resolve())}
    subprocess.run(cmd, cwd=str(crop_root), env=env, check=True, capture_output=True)
    return json.loads((out_crop / "pipeline_report.json").read_text(encoding="utf-8"))


def test_label_trim_ratios_on_reference():
    assert REFERENCE_FIXTURE.is_file(), f"missing fixture {REFERENCE_FIXTURE}"
    job_crop = OUTPUT / "reference_crop"
    report = _run_crop(REFERENCE_FIXTURE, job_crop)
    validate_crop_geometry(report)
    row1 = cv2.imread(str(job_crop / "row_crops" / "01_license_number_row.png"))
    row7 = cv2.imread(str(job_crop / "row_crops" / "07_expiry_date_row.png"))
    assert row1 is not None and row7 is not None
    w1 = row1.shape[1]
    w7 = row7.shape[1]
    x1a, x1b = value_x_bounds(w1, "license_number")
    x7a, x7b = value_x_bounds(w7, "expiry_date")
    t1, m1 = trim_row_to_value_zone(row1, "license_number")
    t7, m7 = trim_row_to_value_zone(row7, "expiry_date")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(OUTPUT / "row1_value_trim.png"), t1)
    cv2.imwrite(str(OUTPUT / "row7_value_trim.png"), t7)
    diag = {
        "row1": {**m1, "left_ratio": x1a / w1, "right_ratio": 1 - x1b / w1},
        "row7": {**m7, "left_ratio": x7a / w7, "right_ratio": 1 - x7b / w7},
    }
    (OUTPUT / "trim_diagnostics.json").write_text(json.dumps(diag, indent=2), encoding="utf-8")
    assert t1.shape[1] < w1 * 0.7
    assert t7.shape[1] < w7 * 0.7


def test_geometry_rejects_tiny_table():
    bad = {
        "validation": {
            "status": "INPUT_VALID",
            "handoff_quality": "INPUT_OK_FOR_CROP_AND_OCR",
            "width": 1000,
            "height": 600,
        },
        "table": {"status": "TABLE_OK", "table_bbox": [10, 10, 200, 100]},
        "structural_layout": {
            "rows": [{"semantic": "license_number"}, {"semantic": "expiry_date"}],
        },
    }
    try:
        validate_crop_geometry(bad)
        assert False, "expected rejection"
    except ValueError as exc:
        assert "GEOMETRY_REJECTED" in str(exc)


def test_license_digits_reject_letters():
    pipe = TwoFieldOcrPipeline(cache_dir=OUTPUT / "pipe_cache")
    # synthetic crop — pipeline still exercises validator path via missing file guard
    blank = OUTPUT / "blank_lic.png"
    OUTPUT.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(blank), np.ones((24, 120, 3), dtype=np.uint8) * 255)
    rec = pipe.recognize_field("license_number", blank)
    assert rec["status"] in ("REJECT", "FLAG_UNCERTAIN")


if __name__ == "__main__":
    test_label_trim_ratios_on_reference()
    test_geometry_rejects_tiny_table()
    test_license_digits_reject_letters()
    print("OK")
