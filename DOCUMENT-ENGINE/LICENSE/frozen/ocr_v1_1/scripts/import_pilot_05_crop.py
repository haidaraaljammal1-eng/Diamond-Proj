#!/usr/bin/env python3
"""Run frozen Crop V1 on pilot_05 only; write crop report (does not touch OCR4/5 artifacts)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

OCR_ROOT = Path(__file__).resolve().parents[1]
PILOT_ROOT = OCR_ROOT / "pilot_subset"
CROP_V1 = Path(r"C:\Users\Rw\UAE_LICENSE_CROP_V2")


def main() -> int:
    sys.path.insert(0, str(CROP_V1))
    from src.run_crop_pipeline import load_config, run_pipeline

    import cv2

    tid = "pilot_05"
    canonical = PILOT_ROOT / "images" / f"{tid}.png"
    out = PILOT_ROOT / "runs" / tid
    # Crop V1 deskew is unstable below ~500px width; stage 2x copy (canonical image unchanged).
    bgr = cv2.imread(str(canonical))
    if bgr is None:
        raise FileNotFoundError(canonical)
    h, w = bgr.shape[:2]
    staged = cv2.resize(bgr, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
    staged_path = out / "_crop_input_staged_2x.png"
    out.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(staged_path), staged)
    config = load_config()
    report = run_pipeline(staged_path, out, config, geometry_only=False)
    summary = {
        "test_id": tid,
        "canonical_source_image": str(canonical),
        "crop_pipeline_input": str(staged_path),
        "crop_input_staging": "2x_upscale_for_deskew_stability",
        "stopped_reason": report.get("stopped_reason"),
        "recommendation": report.get("recommendation"),
        "table_status": report.get("table", {}).get("status"),
        "structure_mode": report.get("table", {}).get("structure_mode"),
        "rows_status": report.get("rows", {}).get("status"),
        "row_count": len(report.get("rows", {}).get("rows", [])),
    }
    fields = report.get("value_crops_phase2", {}).get("value_crop", {}).get("fields", [])
    summary["fields"] = {
        f["semantic"]: {
            "field_status": f.get("field_status"),
            "value_bbox": f.get("value_bbox"),
        }
        for f in fields
    }
    handoff_path = out / "ocr_handoff.json"
    if handoff_path.is_file():
        handoff = json.loads(handoff_path.read_text(encoding="utf-8"))
        summary["ocr_handoff"] = {
            f["field_name"]: {
                "ocr_eligible": f.get("ocr_eligible"),
                "crop_geometry_status": f.get("crop_geometry_status"),
                "content_sanity_status": f.get("content_sanity_status"),
                "crop_path": f.get("crop_path"),
                "width": f.get("width"),
                "height": f.get("height"),
            }
            for f in handoff.get("fields", [])
        }
    out_report = OCR_ROOT / "results" / "OCR6_DYNAMIC_CV" / "pilot_05_crop_report.json"
    out_report.parent.mkdir(parents=True, exist_ok=True)
    out_report.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    # Use Crop V1 venv Python (OpenCV/Hough compatibility): 
    # C:\Users\Rw\UAE_LICENSE_CROP_V2\venv\Scripts\python.exe scripts\import_pilot_05_crop.py
    raise SystemExit(main())
