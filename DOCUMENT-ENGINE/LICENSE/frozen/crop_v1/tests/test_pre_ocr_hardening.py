from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import cv2
import numpy as np

from src.image_validation import InputHandoffQuality, InputStatus, validate_image
from src.ocr_handoff import (
    ContentSanityStatus,
    assess_crop_content_sanity,
    is_field_ocr_eligible,
)
from src.output_hygiene import clean_job_output
from src.run_crop_pipeline import load_config, run_pipeline
from src.template_manifest import hash_template_dir
from tests.conftest import make_synthetic_licence


def test_is_field_ocr_eligible_contract():
    assert is_field_ocr_eligible(
        {
            "crop_geometry_status": "VALUE_OK",
            "content_sanity_status": ContentSanityStatus.CONTENT_PRESENT.value,
            "ocr_eligible": True,
        }
    )
    assert not is_field_ocr_eligible(
        {
            "crop_geometry_status": "VALUE_OK",
            "content_sanity_status": ContentSanityStatus.CONTENT_EMPTY_OR_UNRELIABLE.value,
            "ocr_eligible": False,
        }
    )


def test_blank_crop_sanity():
    blank = np.full((40, 200, 3), 245, dtype=np.uint8)
    status, _ = assess_crop_content_sanity(blank)
    assert status == ContentSanityStatus.CONTENT_EMPTY_OR_UNRELIABLE


def test_stale_output_cleared_on_validation_fail(tmp_path, config):
    out = tmp_path / "job"
    out.mkdir()
    stale = out / "value_crops" / "01_license_number.png"
    stale.parent.mkdir(parents=True)
    cv2.imwrite(str(stale), np.zeros((20, 100, 3), dtype=np.uint8))

    tiny = tmp_path / "tiny.png"
    cv2.imwrite(str(tiny), np.zeros((100, 100, 3), dtype=np.uint8))
    report = run_pipeline(tiny, out, config)
    assert report["validation"]["status"] == InputStatus.INPUT_TOO_SMALL.value
    assert not stale.is_file()
    assert (out / "pipeline_report.json").is_file()
    assert (out / "ocr_handoff.json").is_file()


def test_handoff_quality_low_res(config):
    img = make_synthetic_licence(width=420, height=260)
    result = validate_image(img, config)
    assert result.status == InputStatus.INPUT_VALID
    assert result.handoff_quality == InputHandoffQuality.INPUT_OK_FOR_CROP_BUT_LOW_RES_FOR_OCR


def test_template_hashes_immutable_across_two_runs(project_root, config, tmp_path):
    inp = project_root / "input" / "real3.jpg"
    if not inp.is_file():
        inp = project_root / "input" / "real3.png"
    if not inp.is_file():
        return
    before = hash_template_dir(project_root / "label_templates")
    out1 = tmp_path / "run_a"
    out2 = tmp_path / "run_b"
    run_pipeline(inp, out1, config)
    run_pipeline(inp, out2, config)
    after = hash_template_dir(project_root / "label_templates")
    assert before == after
