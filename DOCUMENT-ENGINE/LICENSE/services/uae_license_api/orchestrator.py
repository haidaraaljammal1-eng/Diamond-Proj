"""Crop V1 + OCR V1.2 two-field orchestration for one licence job."""

from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Optional

from services.uae_license_api.runtime_paths import CROP_ROOT, JOBS_ROOT, LICENSE_ROOT
from services.uae_license_api.two_field.geometry_gate import validate_crop_geometry
from services.uae_license_api.two_field.row_value_trim import write_trimmed_crop

logger = logging.getLogger("uae_license_api.orchestrator")

OCR_FIELD_NAMES = ("license_number", "expiry_date")

PUBLIC_FIELD_ORDER = (
    "license_number",
    "name_ar",
    "name_en",
    "nationality",
    "date_of_birth",
    "issue_date",
    "expiry_date",
    "place_of_issue",
)


class EngineProcessingError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _crop_python() -> Path:
    win = LICENSE_ROOT / ".venv" / "Scripts" / "python.exe"
    if win.is_file():
        return win
    return Path(sys.executable)


def _run_crop_subprocess(input_path: Path, crop_dir: Path) -> dict[str, Any]:
    py = _crop_python()
    cmd = [
        str(py),
        "-m",
        "src.run_crop_pipeline",
        "--input",
        str(input_path.resolve()),
        "--output",
        str(crop_dir.resolve()),
        "--config",
        str((CROP_ROOT / "config" / "crop_layout.json").resolve()),
    ]
    env = {**os.environ, "PYTHONPATH": str(CROP_ROOT.resolve())}
    proc = subprocess.run(
        cmd,
        cwd=str(CROP_ROOT),
        env=env,
        capture_output=True,
        text=True,
        timeout=180,
    )
    report_path = crop_dir / "pipeline_report.json"
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "")[-500:]
        raise EngineProcessingError("CROP_FAILED", f"Crop subprocess failed: {tail}")
    if not report_path.is_file():
        raise EngineProcessingError("CROP_FAILED", "Missing pipeline_report.json after crop.")
    return json.loads(report_path.read_text(encoding="utf-8"))


def _is_field_ocr_eligible(field: dict[str, Any]) -> bool:
    geom = field.get("crop_geometry_status") or field.get("field_status")
    if geom != "VALUE_OK":
        return False
    if field.get("content_sanity_status") == "CONTENT_EMPTY_OR_UNRELIABLE":
        return False
    return bool(field.get("ocr_eligible", False))


def _handoff_by_name(handoff: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {f["field_name"]: f for f in handoff.get("fields", [])}


def _not_processed_field(field_name: str, handoff_field: Optional[dict[str, Any]]) -> dict[str, Any]:
    return {
        "value": None,
        "status": "NOT_OCR_PROCESSED",
        "crop_status": (handoff_field or {}).get("crop_geometry_status"),
        "ocr_eligible": False,
        "confidence": None,
        "engine": None,
    }


def _map_field_result(
    field_name: str,
    handoff_field: Optional[dict[str, Any]],
    ocr_rec: Optional[dict[str, Any]],
) -> dict[str, Any]:
    if field_name not in OCR_FIELD_NAMES:
        return _not_processed_field(field_name, handoff_field)

    crop_status = (handoff_field or {}).get("crop_geometry_status")
    ocr_eligible = bool(handoff_field and handoff_field.get("ocr_eligible"))

    if not ocr_eligible:
        return {
            "value": None,
            "status": "REJECT",
            "crop_status": crop_status,
            "ocr_eligible": False,
            "confidence": None,
            "engine": None,
        }

    if ocr_rec is None:
        return {
            "value": None,
            "status": "REJECT",
            "crop_status": crop_status,
            "ocr_eligible": True,
            "confidence": None,
            "engine": None,
        }

    status = ocr_rec.get("status", "REJECT")
    value = ocr_rec.get("normalized_text") or ocr_rec.get("raw_text") or None
    if value == "":
        value = None
    if status != "ACCEPT":
        value = None
    return {
        "value": value,
        "status": status,
        "crop_status": crop_status,
        "ocr_eligible": True,
        "confidence": ocr_rec.get("confidence"),
        "engine": ocr_rec.get("engine"),
    }


def _document_status(fields: dict[str, dict[str, Any]]) -> str:
    lic = fields.get("license_number", {})
    exp = fields.get("expiry_date", {})
    if lic.get("status") == "ACCEPT" and exp.get("status") == "ACCEPT":
        return "ACCEPT"
    return "REJECT"


def _prepare_two_field_crops(report: dict[str, Any], crop_dir: Path) -> dict[str, Path]:
    row_crops = report.get("row_crops") or {}
    out_dir = crop_dir / "two_field_v1_2"
    trim_meta: dict[str, Any] = {}
    paths: dict[str, Path] = {}
    mapping = {
        "license_number": ("01_license_number_value.png", "license_number"),
        "expiry_date": ("07_expiry_date_value.png", "expiry_date"),
    }
    for semantic, (out_name, field_key) in mapping.items():
        row_rel = row_crops.get(semantic)
        if not row_rel:
            raise EngineProcessingError("CROP_FAILED", f"Missing row crop for {semantic}")
        row_path = Path(row_rel)
        if not row_path.is_file():
            row_path = crop_dir / "row_crops" / row_path.name
        if not row_path.is_file():
            raise EngineProcessingError("CROP_FAILED", f"Row crop not found: {semantic}")
        out_path = out_dir / out_name
        trim_meta[semantic] = write_trimmed_crop(row_path, out_path, field_key)
        paths[semantic] = out_path
    (out_dir / "trim_metadata.json").write_text(json.dumps(trim_meta, indent=2), encoding="utf-8")
    return paths


def process_driver_license(
    image_path: Path,
    pipeline: Any,
    job_id: Optional[str] = None,
    keep_artifacts: bool = True,
) -> dict[str, Any]:
    job_id = job_id or str(uuid.uuid4())
    job_dir = JOBS_ROOT / job_id
    input_dir = job_dir / "input"
    crop_dir = job_dir / "crop"
    input_dir.mkdir(parents=True, exist_ok=True)
    crop_dir.mkdir(parents=True, exist_ok=True)

    dest_input = input_dir / f"original{image_path.suffix.lower()}"
    if not dest_input.exists():
        dest_input.write_bytes(image_path.read_bytes())

    t0 = time.perf_counter()
    report = _run_crop_subprocess(dest_input.resolve(), crop_dir.resolve())
    crop_ms = int((time.perf_counter() - t0) * 1000)

    stopped = report.get("stopped_reason")
    if stopped:
        code = "TABLE_NOT_FOUND" if "TABLE" in str(stopped) else "CROP_FAILED"
        raise EngineProcessingError(code, f"Crop pipeline stopped: {stopped}")

    try:
        validate_crop_geometry(report)
    except ValueError as exc:
        msg = str(exc)
        code = "GEOMETRY_REJECTED" if msg.startswith("GEOMETRY_REJECTED") else "CROP_FAILED"
        raise EngineProcessingError(code, msg) from None

    handoff_path = crop_dir / "ocr_handoff.json"
    if not handoff_path.is_file():
        raise EngineProcessingError("CROP_FAILED", "Missing ocr_handoff.json after crop.")

    handoff = json.loads(handoff_path.read_text(encoding="utf-8"))
    handoff_map = _handoff_by_name(handoff)

    try:
        trim_paths = _prepare_two_field_crops(report, crop_dir)
    except ValueError as exc:
        raise EngineProcessingError("CROP_FAILED", str(exc)) from None

    ocr_t0 = time.perf_counter()
    ocr_fields_out: dict[str, dict[str, Any]] = {}
    for field_name in OCR_FIELD_NAMES:
        hf = handoff_map.get(field_name)
        if not hf or not _is_field_ocr_eligible(hf):
            continue
        crop_path = trim_paths.get(field_name)
        handoff_crop = hf.get("crop_path")
        if handoff_crop:
            handoff_path = Path(handoff_crop)
            if not handoff_path.is_file():
                handoff_path = crop_dir / "value_crops" / handoff_path.name
        else:
            handoff_path = None
        if not crop_path or not crop_path.is_file():
            continue
        try:
            rec = pipeline.recognize_field(field_name, crop_path)
            if (
                rec.get("status") != "ACCEPT"
                and field_name == "license_number"
                and handoff_path
                and handoff_path.is_file()
            ):
                retry = pipeline.recognize_field(field_name, handoff_path)
                if retry.get("status") == "ACCEPT":
                    rec = retry
            ocr_fields_out[field_name] = rec
        except Exception as exc:
            logger.exception("ocr field failure job_id=%s field=%s", job_id, field_name)
            raise EngineProcessingError("INTERNAL_OCR_ERROR", str(exc)) from exc

    ocr_ms = int((time.perf_counter() - ocr_t0) * 1000)

    public_fields: dict[str, dict[str, Any]] = {}
    for fname in PUBLIC_FIELD_ORDER:
        hf = handoff_map.get(fname)
        ocr_rec = ocr_fields_out.get(fname)
        public_fields[fname] = _map_field_result(fname, hf, ocr_rec)

    doc_status = _document_status(public_fields)
    total_ms = int((time.perf_counter() - t0) * 1000)
    body = {
        "job_id": job_id,
        "document_status": doc_status,
        "engine_release": "OCR_ENGLISH_V1_3_1_TWO_FIELD",
        "fields": public_fields,
        "runtime_ms": {"crop": crop_ms, "ocr": ocr_ms, "total": total_ms},
    }

    if keep_artifacts:
        (job_dir / "result.json").write_text(json.dumps(body, indent=2), encoding="utf-8")
    elif crop_dir.exists():
        import shutil

        shutil.rmtree(crop_dir, ignore_errors=True)

    return body
