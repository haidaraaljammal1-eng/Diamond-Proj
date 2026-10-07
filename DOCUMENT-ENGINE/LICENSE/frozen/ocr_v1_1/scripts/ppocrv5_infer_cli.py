#!/usr/bin/env python3
"""Recognition-only PP-OCRv5 NAME_EN CLI (run under venv_ppocrv5)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.engines.rapidocr_ppocrv5_en import RapidOcrPpocrv5EnEngine
from src.inference.name_output import sanitize_name_ocr_output


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: ppocrv5_infer_cli.py <image_path>"}))
        return 2
    image_path = sys.argv[1]
    width = int(sys.argv[2]) if len(sys.argv) > 2 else 640
    engine = RapidOcrPpocrv5EnEngine(rec_width=width)
    engine.cold_init()
    out = engine.recognize(image_path)
    out["raw_text"] = sanitize_name_ocr_output(out["raw_text"])
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
