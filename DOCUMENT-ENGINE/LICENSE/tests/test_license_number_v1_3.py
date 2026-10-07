"""V1.3 licence number recognizer and sanitizer tests."""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

LICENSE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LICENSE_ROOT))
sys.path.insert(0, str(LICENSE_ROOT / "frozen" / "ocr_v1_1"))

from src.inference.name_output import (  # noqa: E402
    sanitize_license_ocr_output,
    sanitize_name_ocr_output,
)
from services.uae_license_api.two_field.license_number_recognizer import (  # noqa: E402
    LicenseNumberRecognizer,
    PpVariantRead,
    independent_veto,
    resolve_pp_stability,
    select_stable_pp_digits,
)


def test_name_sanitizer_unchanged():
    assert sanitize_name_ocr_output("  123 JOHN DOE  ") == "JOHN DOE"
    assert sanitize_name_ocr_output("O'BRIEN") == "O'BRIEN"


def test_license_digit_sanitizer_keeps_digits():
    assert sanitize_license_ocr_output("  2608 080 ") == "2608080"
    assert sanitize_license_ocr_output("2608080") == "2608080"


def test_license_sanitizer_does_not_convert_letters():
    assert "O" in sanitize_license_ocr_output("26O8080")


def test_pp_stable_agreement():
    assert select_stable_pp_digits(["2608080", "2608080", "2608080"]) == "2608080"
    assert select_stable_pp_digits(["123456", "123456", "123450"]) == "123456"


def test_pp_unstable_reject():
    assert select_stable_pp_digits(["123456", "123450", "999999"]) is None
    stable, reason = resolve_pp_stability(
        [
            PpVariantRead("a", "raw", "", "123456", 0.9, 1.0, "/x"),
            PpVariantRead("b", "clahe", "", "123450", 0.9, 1.0, "/y"),
            PpVariantRead("c", "otsu", "", "999999", 0.9, 1.0, "/z"),
        ]
    )
    assert stable is None
    assert reason == "LICENSE_NUMBER_PP_UNSTABLE"


def test_independent_veto_rejects():
    assert independent_veto("2608080", "808090", "808090") == "LICENSE_NUMBER_INDEPENDENT_VETO"


def test_independent_veto_no_veto_when_disagree():
    assert independent_veto("2608080", "808090", "200") is None


def test_letters_final_reject_via_recognizer_mock(tmp_path: Path):
    crop = tmp_path / "c.png"
    crop.write_bytes(b"")  # unreadable -> reject path
    pp = MagicMock()
    rec = LicenseNumberRecognizer(pp, MagicMock(), MagicMock(), tmp_path / "cache")
    out = rec.recognize(crop, "k")
    assert out.status == "REJECT"


def test_veto_integration_mock(tmp_path: Path, monkeypatch):
    import cv2
    import numpy as np

    crop = tmp_path / "lic.png"
    cv2.imwrite(str(crop), np.ones((24, 120, 3), dtype=np.uint8) * 255)
    pp = MagicMock()

    def pp_read(_path, field_name="license_number"):
        return {
            "status": "ACCEPT",
            "raw_text": "2608080",
            "confidence": 0.9,
            "runtime_ms": 10.0,
        }

    pp.recognize.side_effect = pp_read

    def tess(_path, _psm, _wl):
        return {"raw_text": "808090", "confidence": 0.0}

    def rapid(_path):
        return {"raw_text": "808090", "confidence": 0.5}

    rec = LicenseNumberRecognizer(pp, tess, rapid, tmp_path / "cache")
    out = rec.recognize(crop, "veto_test")
    assert out.status == "REJECT"
    assert out.reject_reason == "LICENSE_NUMBER_INDEPENDENT_VETO"


V5_PY = LICENSE_ROOT / ".venv_ppocrv5" / "Scripts" / "python.exe"
MOHAMED = LICENSE_ROOT / "output" / "a5_mohamed_sample" / "input.png"
MARLON = LICENSE_ROOT / "output" / "v1_2h_local_fixture" / "marlon_reference.png"


def _skip_integration():
    if not V5_PY.is_file():
        pytest.skip("venv_ppocrv5 not available")
    if not MOHAMED.is_file() or not MARLON.is_file():
        pytest.skip("local labelled fixtures missing")


@pytest.fixture
def v13_pipeline():
    _skip_integration()
    from services.uae_license_api.orchestrator import _prepare_two_field_crops, _run_crop_subprocess
    from services.uae_license_api.two_field.ocr_pipeline import TwoFieldOcrPipeline

    pipe = TwoFieldOcrPipeline(cache_dir=LICENSE_ROOT / "output" / "test_v13_cache")
    pipe.ppocrv5_client.ensure_started()
    yield pipe, _run_crop_subprocess, _prepare_two_field_crops
    pipe.close()


def _license_digits_for_image(pipe, run_crop, prepare, image: Path) -> str:
    out_dir = LICENSE_ROOT / "output" / f"test_v13_{image.stem}"
    out_dir.mkdir(parents=True, exist_ok=True)
    report = run_crop(image, out_dir / "crop")
    trims = prepare(report, out_dir / "crop")
    rec = pipe.recognize_field("license_number", trims["license_number"])
    return rec.get("normalized_text") or rec.get("raw_text") or ""


def test_mohamed_integration(v13_pipeline):
    pipe, run_crop, prepare = v13_pipeline
    digits = _license_digits_for_image(pipe, run_crop, prepare, MOHAMED)
    assert digits == "2608080"
    assert digits != "808090"


def test_marlon_integration(v13_pipeline):
    pipe, run_crop, prepare = v13_pipeline
    digits = _license_digits_for_image(pipe, run_crop, prepare, MARLON)
    assert digits == "1893918"


def test_expiry_unchanged_mohamed(v13_pipeline):
    pipe, run_crop, prepare = v13_pipeline
    out_dir = LICENSE_ROOT / "output" / "test_v13_expiry_mohamed"
    report = run_crop(MOHAMED, out_dir / "crop")
    trims = prepare(report, out_dir / "crop")
    exp = pipe.recognize_field("expiry_date", trims["expiry_date"])
    assert exp["status"] == "ACCEPT"
    assert "2020" in (exp.get("normalized_text") or "")


def test_expiry_unchanged_marlon(v13_pipeline):
    pipe, run_crop, prepare = v13_pipeline
    out_dir = LICENSE_ROOT / "output" / "test_v13_expiry_marlon"
    report = run_crop(MARLON, out_dir / "crop")
    trims = prepare(report, out_dir / "crop")
    exp = pipe.recognize_field("expiry_date", trims["expiry_date"])
    assert exp["status"] == "ACCEPT"
    assert "2023" in (exp.get("normalized_text") or "")
