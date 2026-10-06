"""V1.3.1 Rapid fallback on LICENSE_NUMBER_PP_NO_DIGITS."""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock

import cv2
import numpy as np
import pytest

LICENSE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LICENSE_ROOT))
sys.path.insert(0, str(LICENSE_ROOT / "frozen" / "ocr_v1_1"))

from services.uae_license_api.two_field.license_number_recognizer import (  # noqa: E402
    LicenseNumberRecognizer,
    PpVariantRead,
    native_digits_only,
    select_stable_pp_digits,
    should_activate_rapid_fallback,
)


def _write_crop(tmp_path: Path) -> Path:
    crop = tmp_path / "lic.png"
    cv2.imwrite(str(crop), np.ones((24, 120, 3), dtype=np.uint8) * 255)
    return crop


def _pp_no_digits():
    pp = MagicMock()
    pp.recognize.return_value = {
        "status": "ACCEPT",
        "raw_text": "",
        "confidence": None,
        "runtime_ms": 1.0,
    }
    return pp


def _rapid_sequence(values: list[str]):
    calls = {"i": 0}

    def rapid(_path):
        i = calls["i"]
        calls["i"] = min(i + 1, len(values) - 1)
        v = values[i] if i < len(values) else ""
        return {"raw_text": v, "confidence": 0.9}

    return rapid


def test_native_digits_rejects_letters():
    assert native_digits_only("249O527") == ""
    assert native_digits_only("2490527") == "2490527"


def test_rapid_stable_quorum_two_of_three():
    assert select_stable_pp_digits(["123456", "123456", "123450"]) == "123456"


def test_rapid_fallback_accept_tess_empty(tmp_path: Path):
    crop = _write_crop(tmp_path)
    pp = _pp_no_digits()
    rapid = _rapid_sequence(["2490527", "2490527", ""])
    tess = lambda _p, _psm, _wl: {"raw_text": ""}
    rec = LicenseNumberRecognizer(pp, tess, rapid, tmp_path / "cache")
    out = rec.recognize(crop, "a8")
    assert out.status == "ACCEPT"
    assert out.digits == "2490527"
    assert out.reject_reason == "LICENSE_NUMBER_RAPID_FALLBACK_ACCEPT"


def test_rapid_fallback_accept_tess_agrees(tmp_path: Path):
    crop = _write_crop(tmp_path)
    pp = _pp_no_digits()
    rapid = _rapid_sequence(["2490527", "2490527", "2490527"])
    tess = lambda _p, _psm, _wl: {"raw_text": "2490527"}
    rec = LicenseNumberRecognizer(pp, tess, rapid, tmp_path / "cache")
    out = rec.recognize(crop, "tess_agree")
    assert out.status == "ACCEPT"
    assert out.digits == "2490527"


def test_rapid_unstable_reject(tmp_path: Path):
    crop = _write_crop(tmp_path)
    pp = _pp_no_digits()
    rapid = _rapid_sequence(["123456", "123450", "123400"])
    rec = LicenseNumberRecognizer(pp, MagicMock(), rapid, tmp_path / "cache")
    out = rec.recognize(crop, "unstable")
    assert out.status == "REJECT"
    assert out.reject_reason == "LICENSE_NUMBER_RAPID_UNSTABLE"


def test_a8_style_pp_raw_rapid_raw_corroboration(tmp_path: Path):
    crop = _write_crop(tmp_path)
    pp = MagicMock()
    pp.recognize.side_effect = [
        {"status": "ACCEPT", "raw_text": "2490527", "confidence": 0.98, "runtime_ms": 1.0},
        {"status": "ACCEPT", "raw_text": "62490527", "confidence": 0.9, "runtime_ms": 1.0},
        {"status": "ACCEPT", "raw_text": "9", "confidence": 0.4, "runtime_ms": 1.0},
    ]
    rapid = _rapid_sequence(["2490527", "24905279", "42"])
    tess = lambda _p, _psm, _wl: {"raw_text": ""}
    rec = LicenseNumberRecognizer(pp, tess, rapid, tmp_path / "cache")
    out = rec.recognize(crop, "a8_corroborate")
    assert out.status == "ACCEPT"
    assert out.digits == "2490527"
    assert out.metadata.get("accept_path") == "rapid_pp_raw_corroboration"


def test_rapid_tess_conflict_reject(tmp_path: Path):
    crop = _write_crop(tmp_path)
    pp = _pp_no_digits()
    rapid = _rapid_sequence(["2490527", "2490527", ""])
    tess = lambda _p, _psm, _wl: {"raw_text": "2490521"}
    rec = LicenseNumberRecognizer(pp, tess, rapid, tmp_path / "cache")
    out = rec.recognize(crop, "conflict")
    assert out.status == "REJECT"
    assert out.reject_reason == "LICENSE_NUMBER_RAPID_TESS_CONFLICT"


def test_single_pp_spurious_digit_activates_fallback():
    reads = [
        PpVariantRead("a", "raw", "", "90527", 0.9, 1.0, "/x"),
        PpVariantRead("b", "clahe", "", "", None, 1.0, "/y"),
        PpVariantRead("c", "otsu", "", "", None, 1.0, "/z"),
    ]
    assert should_activate_rapid_fallback("LICENSE_NUMBER_PP_UNSTABLE", reads)


def test_pp_unstable_three_way_no_fallback():
    reads = [
        PpVariantRead("a", "raw", "", "123456", 0.9, 1.0, "/x"),
        PpVariantRead("b", "clahe", "", "123450", 0.9, 1.0, "/y"),
        PpVariantRead("c", "otsu", "", "999999", 0.9, 1.0, "/z"),
    ]
    assert not should_activate_rapid_fallback("LICENSE_NUMBER_PP_UNSTABLE", reads)


def test_pp_unstable_suffix_skew_activates_fallback():
    reads = [
        PpVariantRead("a", "raw", "", "2490527", 0.9, 1.0, "/x"),
        PpVariantRead("b", "clahe", "", "62490527", 0.9, 1.0, "/y"),
        PpVariantRead("c", "otsu", "", "9", 0.4, 1.0, "/z"),
    ]
    assert should_activate_rapid_fallback("LICENSE_NUMBER_PP_UNSTABLE", reads)


def test_pp_unstable_true_substantial_conflict_no_fallback():
    reads = [
        PpVariantRead("a", "raw", "", "2490527", 0.9, 1.0, "/x"),
        PpVariantRead("b", "clahe", "", "2490521", 0.9, 1.0, "/y"),
        PpVariantRead("c", "otsu", "", "9", 0.4, 1.0, "/z"),
    ]
    assert not should_activate_rapid_fallback("LICENSE_NUMBER_PP_UNSTABLE", reads)


def test_pp_unstable_no_rapid_fallback(tmp_path: Path):
    crop = _write_crop(tmp_path)
    pp = MagicMock()
    seq = iter(
        [
            {"status": "ACCEPT", "raw_text": "123456", "confidence": 0.9, "runtime_ms": 1.0},
            {"status": "ACCEPT", "raw_text": "123450", "confidence": 0.9, "runtime_ms": 1.0},
            {"status": "ACCEPT", "raw_text": "999999", "confidence": 0.9, "runtime_ms": 1.0},
        ]
    )
    pp.recognize.side_effect = lambda *_a, **_k: next(seq)

    rapid = MagicMock()
    rapid.side_effect = AssertionError("Rapid fallback must not run on PP_UNSTABLE")
    rec = LicenseNumberRecognizer(pp, MagicMock(), rapid, tmp_path / "cache")
    out = rec.recognize(crop, "pp_unstable")
    assert out.status == "REJECT"
    assert out.reject_reason == "LICENSE_NUMBER_PP_UNSTABLE"


def test_pp_stable_path_unchanged_veto(tmp_path: Path):
    crop = _write_crop(tmp_path)
    pp = MagicMock()
    pp.recognize.return_value = {
        "status": "ACCEPT",
        "raw_text": "2608080",
        "confidence": 0.9,
        "runtime_ms": 1.0,
    }
    tess = lambda _p, _psm, _wl: {"raw_text": "808090"}
    rapid = lambda _p: {"raw_text": "808090"}
    rec = LicenseNumberRecognizer(pp, tess, rapid, tmp_path / "cache")
    out = rec.recognize(crop, "mohamed_veto")
    assert out.status == "REJECT"
    assert out.reject_reason == "LICENSE_NUMBER_INDEPENDENT_VETO"


RISHAD = LICENSE_ROOT / "output" / "a8_rishad_sample" / "input.png"
KHADER = LICENSE_ROOT / "output" / "a7_khader_sample" / "input.jpg"
MOHAMED = LICENSE_ROOT / "output" / "a5_mohamed_sample" / "input.png"
MARLON = LICENSE_ROOT / "output" / "v1_2h_local_fixture" / "marlon_reference.png"


def _skip_integration():
    if not (LICENSE_ROOT / ".venv_ppocrv5" / "Scripts" / "python.exe").is_file():
        pytest.skip("venv_ppocrv5 not available")


@pytest.fixture
def v131_pipeline():
    _skip_integration()
    from services.uae_license_api.orchestrator import _prepare_two_field_crops, _run_crop_subprocess
    from services.uae_license_api.two_field.ocr_pipeline import TwoFieldOcrPipeline

    pipe = TwoFieldOcrPipeline(cache_dir=LICENSE_ROOT / "output" / "test_v131_cache")
    pipe.ppocrv5_client.ensure_started()
    yield pipe, _run_crop_subprocess, _prepare_two_field_crops
    pipe.close()


def _license_digits(pipe, run_crop, prepare, image: Path) -> str:
    out_dir = LICENSE_ROOT / "output" / f"test_v131_{image.stem}"
    report = run_crop(image, out_dir / "crop")
    trims = prepare(report, out_dir / "crop")
    rec = pipe.recognize_field("license_number", trims["license_number"])
    if rec.get("status") != "ACCEPT":
        pytest.fail(
            f"license_number {rec.get('status')}: {rec.get('reject_reason')} "
            f"rapid={rec.get('rapid_variants')}"
        )
    return rec.get("normalized_text") or rec.get("raw_text") or ""


def test_a8_rishad_integration(v131_pipeline):
    if not RISHAD.is_file():
        pytest.skip("local A8 fixture missing")
    pipe, run_crop, prepare = v131_pipeline
    # Production A8: all PP variants empty; force same path when worker returns spurious PP noise.
    pipe._license_recognizer._pp.recognize = lambda *_a, **_k: {
        "status": "ACCEPT",
        "raw_text": "",
        "confidence": None,
        "runtime_ms": 1.0,
    }
    assert _license_digits(pipe, run_crop, prepare, RISHAD) == "2490527"


def test_mohamed_regression(v131_pipeline):
    if not MOHAMED.is_file():
        pytest.skip("mohamed fixture missing")
    pipe, run_crop, prepare = v131_pipeline
    assert _license_digits(pipe, run_crop, prepare, MOHAMED) == "2608080"


def test_marlon_regression(v131_pipeline):
    if not MARLON.is_file():
        pytest.skip("marlon fixture missing")
    pipe, run_crop, prepare = v131_pipeline
    assert _license_digits(pipe, run_crop, prepare, MARLON) == "1893918"


def test_khader_regression(v131_pipeline):
    if not KHADER.is_file():
        pytest.skip("khader fixture missing")
    pipe, run_crop, prepare = v131_pipeline
    assert _license_digits(pipe, run_crop, prepare, KHADER) == "5128524"
