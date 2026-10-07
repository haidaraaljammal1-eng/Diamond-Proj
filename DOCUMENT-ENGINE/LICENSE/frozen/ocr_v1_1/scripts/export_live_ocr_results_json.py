"""Export crop + OCR results for live_tests folders to a single JSON file."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import cv2

_PROJECT = Path(__file__).resolve().parents[1]
_LIVE = _PROJECT / "live_tests"
_EN_FIELDS = [
    "license_number",
    "name_en",
    "nationality",
    "date_of_birth",
    "issue_date",
    "expiry_date",
    "place_of_issue",
]
_CROP_FILES = {
    "license_number": "01_license_number.png",
    "name_en": "03_name_en.png",
    "nationality": "04_nationality.png",
    "date_of_birth": "05_date_of_birth.png",
    "issue_date": "06_issue_date.png",
    "expiry_date": "07_expiry_date.png",
    "place_of_issue": "08_place_of_issue.png",
}


def _load_report(crop_work: Path) -> Dict[str, Any] | None:
    path = crop_work / "pipeline_report.json"
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _field_map(report: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    vc = report.get("value_crops_phase2", {}).get("value_crop", {})
    fields = vc.get("fields", [])
    return {f["semantic"]: f for f in fields}


def main() -> None:
    from src.inference.english_ocr_pipeline import EnglishOcrPipeline

    out_path = _LIVE / "ocr_results_summary.json"
    generated_at = datetime.now(timezone.utc).isoformat()
    tests_out: List[Dict[str, Any]] = []

    pipe = EnglishOcrPipeline()
    try:
        for test_dir in sorted(_LIVE.iterdir()):
            if not test_dir.is_dir() or not test_dir.name.startswith("live_test_"):
                continue
            crop_work = test_dir / "crop_work"
            report = _load_report(crop_work)
            if report is None:
                continue

            meta = report.get("run_metadata", {})
            by_sem = _field_map(report) if report.get("value_crops_phase2") else {}

            fields_result: List[Dict[str, Any]] = []
            for semantic in _EN_FIELDS:
                fin = by_sem.get(semantic, {})
                crop_rel = _CROP_FILES.get(semantic)
                crop_path = crop_work / "value_crops" / crop_rel if crop_rel else None
                ocr_block: Dict[str, Any] = {
                    "field": semantic,
                    "crop_geometry_status": fin.get("field_status"),
                    "value_bbox_canonical": fin.get("value_bbox_canonical"),
                    "crop_message": fin.get("message") or "",
                    "crop_path": str(crop_path) if crop_path and crop_path.is_file() else None,
                }
                if crop_path and crop_path.is_file() and fin.get("field_status") == "VALUE_OK":
                    try:
                        r = pipe.recognize_field(semantic, crop_path)
                        ocr_block["ocr"] = {
                            "status": r.get("status"),
                            "normalized_text": r.get("normalized_text"),
                            "raw_text": r.get("raw_text"),
                            "validator_status": r.get("validator_status"),
                            "confidence": r.get("confidence"),
                            "engine": r.get("engine"),
                            "preprocessing": r.get("preprocessing"),
                        }
                    except Exception as exc:  # noqa: BLE001
                        ocr_block["ocr"] = {"error": str(exc)}
                else:
                    img = cv2.imread(str(crop_path)) if crop_path and crop_path.is_file() else None
                    ocr_block["ocr"] = {
                        "status": "SKIPPED",
                        "reason": "crop_not_value_ok_or_missing",
                        "placeholder_crop": bool(
                            img is not None
                            and img.shape[1] <= 220
                            and float(img.mean()) > 200
                        ),
                    }
                fields_result.append(ocr_block)

            tests_out.append(
                {
                    "test_id": test_dir.name,
                    "input_path": report.get("input_path") or meta.get("input_path"),
                    "input_sha256": meta.get("input_sha256"),
                    "pipeline_status": meta.get("pipeline_status"),
                    "recommendation": report.get("recommendation"),
                    "validation": report.get("validation"),
                    "table_status": (report.get("table") or {}).get("status"),
                    "crop_work_dir": str(crop_work),
                    "fields": fields_result,
                }
            )
    finally:
        pipe.close()

    payload = {
        "generated_at_utc": generated_at,
        "ocr_release": "OCR_ENGLISH_V1",
        "crop_project": "UAE_LICENSE_CROP_V2",
        "tests": tests_out,
    }
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(str(out_path))


if __name__ == "__main__":
    main()
