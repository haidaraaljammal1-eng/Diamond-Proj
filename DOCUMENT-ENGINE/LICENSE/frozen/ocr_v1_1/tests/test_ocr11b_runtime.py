"""OCR-11B runtime: persistent PP-OCRv5 worker + date short-circuit."""

from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
V5_PY = PROJECT_ROOT / "venv_ppocrv5" / "Scripts" / "python.exe"
DATASET = PROJECT_ROOT / "pilot_subset" / "benchmark" / "ocr6_development_dataset.json"
OCR10_REPORT = PROJECT_ROOT / "release" / "OCR_ENGLISH_V1" / "REGRESSION_REPORT.json"


def _skip_no_v5():
    if not V5_PY.is_file():
        pytest.skip("venv_ppocrv5 not available")


def _name_crop() -> str:
    data = json.loads(DATASET.read_text(encoding="utf-8"))["fields"]
    for r in data:
        if r.get("field_name") == "name_en" and r.get("ocr_eligible_scorable"):
            return r["crop_path"]
    pytest.skip("no name_en crop")


@pytest.fixture
def pipeline():
    _skip_no_v5()
    from src.inference.english_ocr_pipeline import EnglishOcrPipeline

    pipe = EnglishOcrPipeline(cache_dir=PROJECT_ROOT / "output" / "ocr11b_test_cache")
    yield pipe
    pipe.close()


def test_worker_ping(pipeline):
    pipeline._v5_client.ensure_started()
    resp = pipeline._v5_client.ping()
    assert resp.get("status") == "READY"


def test_worker_same_pid_multiple_calls(pipeline):
    pipeline._v5_client.ensure_started()
    pid1 = pipeline._v5_client.worker_pid
    crop = _name_crop()
    pipeline.recognize_field("name_en", crop)
    pid2 = pipeline._v5_client.worker_pid
    pipeline.recognize_field("name_en", crop)
    pid3 = pipeline._v5_client.worker_pid
    assert pid1 == pid2 == pid3
    assert pid1 is not None


def test_warm_name_no_new_process(pipeline):
    crop = _name_crop()
    pipeline.recognize_field("name_en", crop)
    pid = pipeline._v5_client.worker_pid
    for _ in range(3):
        pipeline.recognize_field("name_en", crop)
    assert pipeline._v5_client.worker_pid == pid


def test_clean_shutdown_removes_process(pipeline):
    pipeline._v5_client.ensure_started()
    pid = pipeline._v5_client.worker_pid
    assert pid is not None
    pipeline.close()
    assert pipeline._v5_client.worker_pid is None


def test_date_primary_accept_skips_fallback(pipeline, monkeypatch):
    from src.inference.english_ocr_pipeline import EnglishOcrPipeline

    calls = {"rapid": 0, "tess": 0}

    def rapid_en(self, image_path):
        calls["rapid"] += 1
        return {"raw_text": "01/01/2000", "confidence": 0.9}

    def tess(self, image_path, psm, whitelist=None):
        calls["tess"] += 1
        return {"raw_text": "01/01/2000", "confidence": 0.5}

    monkeypatch.setattr(EnglishOcrPipeline, "_rapid_en", rapid_en)
    monkeypatch.setattr(EnglishOcrPipeline, "_tesseract", tess)
    pipe = EnglishOcrPipeline(cache_dir=PROJECT_ROOT / "output" / "ocr11b_test_cache2")
    try:
        data = json.loads(DATASET.read_text(encoding="utf-8"))["fields"]
        row = next(r for r in data if r["field_name"] == "date_of_birth")
        out = pipe.recognize_field("date_of_birth", row["crop_path"])
        assert out.get("fallback_skipped") is True
        assert calls["rapid"] == 1
        assert calls["tess"] == 0
    finally:
        pipe.close()


def test_date_reject_triggers_fallback(pipeline, monkeypatch):
    from src.inference.english_ocr_pipeline import EnglishOcrPipeline

    calls = {"rapid": 0, "tess": 0}

    def rapid_en(self, image_path):
        calls["rapid"] += 1
        return {"raw_text": "not-a-date", "confidence": 0.1}

    def tess(self, image_path, psm, whitelist=None):
        calls["tess"] += 1
        return {"raw_text": "01/01/2000", "confidence": 0.5}

    monkeypatch.setattr(EnglishOcrPipeline, "_rapid_en", rapid_en)
    monkeypatch.setattr(EnglishOcrPipeline, "_tesseract", tess)
    pipe = EnglishOcrPipeline(cache_dir=PROJECT_ROOT / "output" / "ocr11b_test_cache3")
    try:
        data = json.loads(DATASET.read_text(encoding="utf-8"))["fields"]
        row = next(r for r in data if r["field_name"] == "date_of_birth")
        pipe.recognize_field("date_of_birth", row["crop_path"])
        assert calls["rapid"] >= 2
        assert calls["tess"] >= 1
    finally:
        pipe.close()


def test_regression_outputs_identical_to_ocr10(pipeline):
    _skip_no_v5()
    if not OCR10_REPORT.is_file():
        pytest.skip("OCR10 regression report missing")
    baseline = {
        (r["test_id"], r["field_name"]): r["prediction"]["raw_text"]
        for r in json.loads(OCR10_REPORT.read_text(encoding="utf-8"))["per_row"]
    }
    data = json.loads(DATASET.read_text(encoding="utf-8"))["fields"]
    rows = [r for r in data if r.get("ocr_eligible_scorable")]
    diffs = []
    for row in rows:
        out = pipeline.recognize_field(row["field_name"], row["crop_path"])
        key = (row["test_id"], row["field_name"])
        if out.get("raw_text") != baseline.get(key):
            diffs.append((key, baseline.get(key), out.get("raw_text")))
    assert not diffs, f"output differences: {diffs[:3]}"


def test_model_hash_mismatch_blocks_worker(tmp_path, monkeypatch):
    _skip_no_v5()
    from src.workers import ppocrv5_worker as wmod

    monkeypatch.setattr(wmod, "_EXPECTED_REC_SHA", "0" * 64)
    wmod._engine = None
    wmod._ready = False
    wmod.load_engine()
    assert wmod._integrity_error is not None
    resp = wmod.handle_ping("1")
    assert resp["status"] == "MODEL_INTEGRITY_FAILURE"
