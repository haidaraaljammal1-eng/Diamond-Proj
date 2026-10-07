"""Passport Paddle model load smoke (synthetic blank image). See DOCUMENT-ENGINE/INSTALLATION.md."""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

PASSPORT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PASSPORT_ROOT))
sys.path.insert(0, str(PASSPORT_ROOT / "scripts"))

from services.passport_number_api.runtime_paths import apply_passport_runtime_environment

apply_passport_runtime_environment()

MODEL_NAME = "en_PP-OCRv4_mobile_rec"


def _model_dir() -> Path:
    home = Path(os.environ.get("PASSPORT_PADDLE_HOME", PASSPORT_ROOT / ".paddle-home"))
    return home / ".paddlex" / "official_models" / MODEL_NAME


def main() -> int:
    before = _model_dir()
    had_model = before.is_dir() and any(before.iterdir()) if before.exists() else False

    from paddleocr import TextRecognition

    blank = np.zeros((48, 320, 3), dtype=np.uint8)
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "blank.png"
        cv2.imwrite(str(p), blank)
        rec = TextRecognition(model_name=MODEL_NAME)
        out = list(rec.predict(input=str(p), batch_size=1))

    after = _model_dir()
    files = []
    if after.is_dir():
        files = [str(f.relative_to(after)) for f in after.rglob("*") if f.is_file()]

    payload = {
        "paddle_home": os.environ.get("PASSPORT_PADDLE_HOME"),
        "model_dir": str(after),
        "had_model_before": had_model,
        "model_files_count": len(files),
        "model_files_sample": files[:12],
        "predict_ran": len(out) >= 0,
        "model_name": MODEL_NAME,
    }
    print(json.dumps(payload, indent=2))
    if not after.is_dir() or not files:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
