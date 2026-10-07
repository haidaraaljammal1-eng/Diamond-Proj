#!/usr/bin/env python3
"""26/26 exact regression against frozen OCR_ENGLISH_V1 baseline (vendored paths)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

LICENSE_ROOT = Path(__file__).resolve().parents[1]
OCR_ROOT = LICENSE_ROOT / "frozen" / "ocr_v1_1"
BASELINE = Path(
    r"C:\Users\Rw\UAE_LICENSE_OCR_V1\release\OCR_ENGLISH_V1\REGRESSION_REPORT.json"
)
OLD_PREFIX = r"C:\Users\Rw\UAE_LICENSE_OCR_V1"


def _remap_path(p: str) -> str:
    if p.startswith(OLD_PREFIX):
        return str(OCR_ROOT / Path(p).relative_to(OLD_PREFIX))
    return p


def main() -> int:
    sys.path.insert(0, str(LICENSE_ROOT))
    from services.uae_license_api.runtime_paths import apply_runtime_environment

    apply_runtime_environment()
    from src.inference.english_ocr_pipeline import EnglishOcrPipeline
    from src.scoring.normalize import normalized_exact_match

    if not BASELINE.is_file():
        print("BASELINE_MISSING", BASELINE)
        return 2

    baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
    baseline_rows = {
        (r["test_id"], r["field_name"]): r for r in baseline.get("per_row", [])
    }

    dataset_path = OCR_ROOT / "pilot_subset" / "benchmark" / "ocr6_development_dataset.json"
    rows = json.loads(dataset_path.read_text(encoding="utf-8"))["fields"]
    rows = [r for r in rows if r.get("ocr_eligible_scorable")]

    pipe = EnglishOcrPipeline()
    diffs = []
    try:
        for row in rows:
            crop = _remap_path(row["crop_path"])
            rec = pipe.recognize_field(row["field_name"], crop)
            ref = row["reference_value"]
            exact = normalized_exact_match(row["field_name"], rec["raw_text"], ref)
            if rec["status"] != "ACCEPT":
                exact = False
            key = (row["test_id"], row["field_name"])
            base = baseline_rows.get(key)
            if base is None:
                diffs.append({"key": key, "reason": "missing_baseline"})
                continue
            pred_match = exact == base.get("exact_match")
            text_match = rec.get("raw_text") == base["prediction"].get("raw_text")
            status_match = rec.get("status") == base["prediction"].get("status")
            if not (pred_match and text_match and status_match):
                diffs.append(
                    {
                        "key": key,
                        "expected": {
                            "exact_match": base.get("exact_match"),
                            "raw_text": base["prediction"].get("raw_text"),
                            "status": base["prediction"].get("status"),
                        },
                        "actual": {
                            "exact_match": exact,
                            "raw_text": rec.get("raw_text"),
                            "status": rec.get("status"),
                        },
                    }
                )
    finally:
        pipe.close()

    print(json.dumps({"sample_count": len(rows), "OUTPUT_DIFFERENCE_COUNT": len(diffs)}, indent=2))
    if diffs:
        print(json.dumps(diffs[:5], indent=2))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
