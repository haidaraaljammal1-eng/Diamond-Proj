#!/usr/bin/env python3
"""PP-OCRv5 JSON-lines worker (run under venv_ppocrv5)."""

from __future__ import annotations

import hashlib
import json
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Optional

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.inference.name_output import sanitize_field_ocr_output
from src.scoring.normalize import normalize_for_field
from src.validators.english_fields import validate_field

_V5_REC = PROJECT_ROOT / "vendor" / "ppocrv5_en" / "en_PP-OCRv5_rec_mobile.onnx"
_V5_DICT = PROJECT_ROOT / "vendor" / "ppocrv5_en" / "ppocrv5_en_dict.txt"
_EXPECTED_REC_SHA = "c3461add59bb4323ecba96a492ab75e06dda42467c9e3d0c18db5d1d21924be8"
_REC_WIDTH = 640

_engine: Any = None
_ready = False
_integrity_error: Optional[str] = None


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def verify_integrity() -> Optional[str]:
    if not _V5_REC.is_file() or not _V5_DICT.is_file():
        return "MODEL_INTEGRITY_FAILURE: missing model or dictionary"
    if _sha256(_V5_REC) != _EXPECTED_REC_SHA:
        return "MODEL_INTEGRITY_FAILURE: en_PP-OCRv5_rec_mobile.onnx sha256 mismatch"
    return None


def load_engine() -> None:
    global _engine, _ready, _integrity_error
    err = verify_integrity()
    if err:
        _integrity_error = err
        _ready = False
        return
    from src.engines.rapidocr_ppocrv5_en import RapidOcrPpocrv5EnEngine

    _engine = RapidOcrPpocrv5EnEngine(rec_width=_REC_WIDTH)
    _engine.cold_init()
    _ready = True
    _integrity_error = None


def _validator_status(field_name: str, raw: str) -> str:
    if not raw:
        return "REJECT"
    v = validate_field(field_name, raw)
    if v == "ACCEPT":
        return "ACCEPT"
    if v == "REJECT":
        return "REJECT"
    return "FLAG_UNCERTAIN"


def handle_ping(req_id: str) -> dict[str, Any]:
    if _integrity_error:
        return {
            "request_id": req_id,
            "status": "MODEL_INTEGRITY_FAILURE",
            "error": _integrity_error,
        }
    if not _ready:
        return {"request_id": req_id, "status": "NOT_READY"}
    return {"request_id": req_id, "status": "READY"}


_SUPPORTED_FIELDS = frozenset({"name_en", "license_number"})


def handle_recognize(req_id: str, crop_path: str, field_name: str) -> dict[str, Any]:
    if field_name not in _SUPPORTED_FIELDS:
        return {
            "request_id": req_id,
            "status": "ENGINE_ERROR",
            "error": f"unsupported field_name: {field_name}",
        }
    if _integrity_error:
        return {
            "request_id": req_id,
            "status": "ENGINE_ERROR",
            "error": _integrity_error,
        }
    if not _ready or _engine is None:
        return {"request_id": req_id, "status": "ENGINE_ERROR", "error": "worker not ready"}
    path = Path(crop_path)
    if not path.is_file():
        return {"request_id": req_id, "status": "ENGINE_ERROR", "error": f"missing crop: {crop_path}"}
    t0 = time.perf_counter()
    out = _engine.recognize(str(path))
    runtime_ms = (time.perf_counter() - t0) * 1000.0
    raw = sanitize_field_ocr_output(field_name, out.get("raw_text", ""))
    norm = normalize_for_field(field_name, raw)
    vstat = _validator_status(field_name, raw)
    return {
        "request_id": req_id,
        "status": vstat,
        "raw_text": raw,
        "normalized_text": norm,
        "confidence": out.get("confidence"),
        "runtime_ms": runtime_ms,
        "engine": "PP-OCRv5_EN",
        "model": "en_PP-OCRv5_rec_mobile.onnx",
        "field_name": field_name,
    }


def handle_shutdown(req_id: str) -> dict[str, Any]:
    return {"request_id": req_id, "status": "SHUTDOWN"}


def process_line(line: str) -> Optional[dict[str, Any]]:
    line = line.strip()
    if not line:
        return None
    try:
        msg = json.loads(line)
    except json.JSONDecodeError:
        return {"request_id": "", "status": "ENGINE_ERROR", "error": "invalid json"}
    req_id = msg.get("request_id") or str(uuid.uuid4())
    cmd = msg.get("command")
    if cmd == "ping":
        return handle_ping(req_id)
    if cmd == "shutdown":
        return handle_shutdown(req_id)
    if cmd == "recognize":
        return handle_recognize(req_id, msg.get("crop_path", ""), msg.get("field_name", "name_en"))
    return {"request_id": req_id, "status": "ENGINE_ERROR", "error": f"unknown command: {cmd}"}


def main() -> int:
    load_engine()
    if _integrity_error:
        _log(_integrity_error)
    else:
        _log("PP-OCRv5 worker READY")
    for line in sys.stdin:
        resp = process_line(line)
        if resp is None:
            continue
        sys.stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
        sys.stdout.flush()
        if resp.get("status") == "SHUTDOWN":
            break
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
