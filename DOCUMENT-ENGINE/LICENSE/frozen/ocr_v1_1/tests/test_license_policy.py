from __future__ import annotations

from pathlib import Path

import pytest

from src.inference.license_policy import (
    consensus_right_aligned,
    extract_license_digits,
    recognize_license,
    score_license_candidate,
)
from src.validators.english_fields import validate_field

PROJECT = Path(__file__).resolve().parents[1]
JOHN_CROP = (
    PROJECT
    / "live_tests"
    / "live_test_john_wick"
    / "crop_output"
    / "01_license_number.png"
)


def test_uae_license_digits_only_accept():
    assert validate_field("license_number", "3869509") == "ACCEPT"
    assert validate_field("license_number", "2SB8G98092S") == "REJECT"


def test_extract_digits_strips_noise():
    assert extract_license_digits(" 3869-509 ") == "3869509"


def test_score_prefers_agreement_over_longer_hallucination():
    peers = ["2898092", "389509", "3869509", "3869509"]
    long_wrong = score_license_candidate("2898092", 0.0, "P0_RAW", peers)
    correct = score_license_candidate("3869509", 0.43, "P7_OTSU_UP2_PAD", peers)
    assert correct > long_wrong


def test_garbage_length_rejected():
    assert (
        score_license_candidate("1145412753809", 0.14, "P5_CLAHE_UP2_PAD", [])
        < 0
    )


@pytest.mark.skipif(not JOHN_CROP.is_file(), reason="john wick live crop missing")
def test_john_wick_license_crop_reads_3869509():
    from src.inference.english_ocr_pipeline import EnglishOcrPipeline
    from src.preprocess.english_variants import materialize_variant

    cache = PROJECT / "output" / "license_policy_test_cache"
    pipe = EnglishOcrPipeline(cache_dir=cache)
    try:

        def prep(cp, variant, key):
            return materialize_variant(cp, variant, cache, key)

        best, _cands, decision = recognize_license(
            JOHN_CROP, "jw_test", prep, pipe._tesseract
        )
        assert best.text == "3869509"
        assert "otsu" in decision or best.preprocessing == "P7_OTSU_UP2_PAD"
    finally:
        pipe.close()
