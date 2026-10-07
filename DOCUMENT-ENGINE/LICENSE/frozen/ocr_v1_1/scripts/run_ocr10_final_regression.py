#!/usr/bin/env python3
"""OCR-10: integrated English OCR regression + release manifests."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import statistics
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.inference.english_ocr_pipeline import EnglishOcrPipeline
from src.scoring.normalize import normalized_exact_match

DATASET = PROJECT_ROOT / "pilot_subset" / "benchmark" / "ocr6_development_dataset.json"
CONFIG_SRC = PROJECT_ROOT / "config" / "ocr_final_english_v1.json"
RELEASE_DIR = PROJECT_ROOT / "release" / "OCR_ENGLISH_V1"
MAIN_PY = PROJECT_ROOT / "venv" / "Scripts" / "python.exe"
V5_PY = PROJECT_ROOT / "venv_ppocrv5" / "Scripts" / "python.exe"
TESS_CFG = PROJECT_ROOT / "config" / "tesseract.json"

DATE_FIELDS = frozenset({"date_of_birth", "issue_date", "expiry_date"})
STABLE = frozenset({"license_number", "nationality", "place_of_issue"})


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pip_freeze(py: Path) -> dict[str, str]:
    out = subprocess.run(
        [str(py), "-m", "pip", "freeze"],
        capture_output=True,
        text=True,
        check=True,
    )
    versions = {}
    for line in out.stdout.splitlines():
        if "==" in line:
            name, ver = line.split("==", 1)
            versions[name.lower()] = ver
    return versions


def python_version(py: Path) -> str:
    r = subprocess.run([str(py), "--version"], capture_output=True, text=True, check=True)
    return r.stdout.strip()


def audit_pilot_rules() -> dict[str, Any]:
    pat = re.compile(r"pilot_0[1-5]")
    hits = []
    root = PROJECT_ROOT / "src" / "inference" / "english_ocr_pipeline.py"
    for path in (root,):
        for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if pat.search(line) and not line.strip().startswith("#"):
                hits.append({"file": str(path), "line": i, "text": line.strip()})
    return {"DOCUMENT_SPECIFIC_RULES_FOUND": len(hits), "hits": hits}


def build_model_manifest() -> dict[str, Any]:
    tess = json.loads(TESS_CFG.read_text(encoding="utf-8"))
    tess_exe = Path(tess["tesseract_cmd"])
    tessdata = Path(tess["tessdata_dir"]) / "eng.traineddata"
    v4 = PROJECT_ROOT / "vendor" / "rapidocr_en" / "en_PP-OCRv4_rec_infer.onnx"
    v5 = PROJECT_ROOT / "vendor" / "ppocrv5_en" / "en_PP-OCRv5_rec_mobile.onnx"
    v5d = PROJECT_ROOT / "vendor" / "ppocrv5_en" / "ppocrv5_en_dict.txt"
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "immutability": "SHA-256 recorded; binaries not bundled in release",
        "artifacts": {
            "tesseract_executable": {
                "path": str(tess_exe),
                "sha256": sha256_file(tess_exe) if tess_exe.is_file() else None,
            },
            "eng_traineddata": {
                "path": str(tessdata),
                "sha256": sha256_file(tessdata) if tessdata.is_file() else None,
            },
            "rapidocr_en_ppocrv4_rec": {
                "path": str(v4),
                "sha256": sha256_file(v4) if v4.is_file() else None,
                "used_for": ["dates_primary", "place_of_issue"],
            },
            "ppocrv5_en_rec_mobile": {
                "path": str(v5),
                "sha256": sha256_file(v5) if v5.is_file() else None,
                "used_for": ["name_en"],
            },
            "ppocrv5_en_dict": {
                "path": str(v5d),
                "sha256": sha256_file(v5d) if v5d.is_file() else None,
            },
        },
    }


def build_environment_manifest() -> dict[str, Any]:
    main_pkgs = pip_freeze(MAIN_PY)
    v5_pkgs = pip_freeze(V5_PY)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "separation": "main_ocr and name_ppocrv5 remain separate; not merged",
        "main_ocr_venv": {
            "path": str(PROJECT_ROOT / "venv"),
            "python": python_version(MAIN_PY),
            "opencv": main_pkgs.get("opencv-python"),
            "onnxruntime": main_pkgs.get("onnxruntime"),
            "rapidocr_onnxruntime": main_pkgs.get("rapidocr-onnxruntime"),
            "pytesseract": main_pkgs.get("pytesseract"),
        },
        "name_ppocrv5_venv": {
            "path": str(PROJECT_ROOT / "venv_ppocrv5"),
            "python": python_version(V5_PY),
            "rapidocr": v5_pkgs.get("rapidocr"),
            "onnxruntime": v5_pkgs.get("onnxruntime"),
            "opencv_python": v5_pkgs.get("opencv-python"),
            "opencv_python_headless": v5_pkgs.get("opencv-python-headless"),
        },
        "tesseract_version_note": "Run tesseract --version on host; executable path in model_manifest",
    }


def run_regression() -> dict[str, Any]:
    rows = json.loads(DATASET.read_text(encoding="utf-8"))["fields"]
    rows = [r for r in rows if r.get("ocr_eligible_scorable")]
    pipe = EnglishOcrPipeline()
    results = []
    runtimes: dict[str, list[float]] = defaultdict(list)
    doc_times: dict[str, float] = defaultdict(float)

    for row in rows:
        rec = pipe.recognize_field(row["field_name"], row["crop_path"])
        ref = row["reference_value"]
        exact = normalized_exact_match(row["field_name"], rec["raw_text"], ref)
        if rec["status"] != "ACCEPT":
            exact = False
        results.append(
            {
                **row,
                "prediction": rec,
                "exact_match": exact,
            }
        )
        runtimes[row["field_name"]].append(rec["runtime_ms"])
        doc_times[row["test_id"]] += rec["runtime_ms"]

    def group_exact(fields: set[str]) -> tuple[int, int]:
        sub = [r for r in results if r["field_name"] in fields]
        return sum(1 for r in sub if r["exact_match"]), len(sub)

    lic = group_exact({"license_number"})
    dates = group_exact(DATE_FIELDS)
    names = group_exact({"name_en"})
    nat = group_exact({"nationality"})
    place = group_exact({"place_of_issue"})
    stable = group_exact(STABLE)

    n = len(results)
    exact_total = sum(1 for r in results if r["exact_match"])
    uncertain = sum(1 for r in results if r["prediction"]["status"] == "FLAG_UNCERTAIN")
    reject = sum(1 for r in results if r["prediction"]["status"] == "REJECT")

    rt_stats = {}
    for field, vals in runtimes.items():
        rt_stats[field] = {
            "mean_ms": statistics.mean(vals),
            "median_ms": statistics.median(vals),
            "p95_ms": sorted(vals)[int(0.95 * (len(vals) - 1))] if len(vals) > 1 else vals[0],
            "n": len(vals),
        }

    doc_rt = {
        tid: ms for tid, ms in doc_times.items()
    }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sample_count": n,
        "exact_total": exact_total,
        "exact_accuracy": exact_total / n if n else 0,
        "license": {"exact": lic[0], "n": lic[1]},
        "dates": {"exact": dates[0], "n": dates[1]},
        "name_en": {"exact": names[0], "n": names[1]},
        "nationality": {"exact": nat[0], "n": nat[1]},
        "place_of_issue": {"exact": place[0], "n": place[1]},
        "stable_group": {"exact": stable[0], "n": stable[1]},
        "flag_uncertain_count": uncertain,
        "reject_count": reject,
        "runtime_per_field": rt_stats,
        "runtime_per_document_ms": doc_rt,
        "per_row": results,
        "integration_regression": exact_total < 26,
    }


def write_release_docs() -> None:
    RELEASE_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(CONFIG_SRC, RELEASE_DIR / "ocr_final_english_v1.json")
    (RELEASE_DIR / "LICENSING_STATUS.md").write_text(
        """# OCR English V1 — Licensing Status

## Tesseract
- Host-installed Tesseract OCR and `eng.traineddata`.
- Internal pilot use under existing audit: **commercially clear for current deployment model**.

## RapidOCR / Paddle OCR models (PP-OCRv4 EN, PP-OCRv5 EN)
- Benchmarked for internal use.
- **LICENCE_REVIEW_REQUIRED_FOR_REDISTRIBUTION** — do not bundle ONNX weights in external releases until legal review completes.

## EasyOCR / PyTorch
- **Not used** in OCR_ENGLISH_V1.

## Arabic (`name_ar`)
- **NOT_OCR_PROCESSED** — out of scope.
""",
        encoding="utf-8",
    )
    (RELEASE_DIR / "OUTPUT_CONTRACT.md").write_text(
        """# OCR English V1 — Output Contract

## OCR-processed fields
- `license_number`
- `name_en`
- `nationality`
- `date_of_birth`
- `issue_date`
- `expiry_date`
- `place_of_issue`

## Excluded
- `name_ar` → **NOT_OCR_PROCESSED**

## Per-field result shape
```json
{
  "field_name": "...",
  "status": "ACCEPT | FLAG_UNCERTAIN | REJECT",
  "raw_text": "...",
  "normalized_text": "...",
  "confidence": 0.0,
  "validator_status": "ACCEPT | REJECT | FLAG_UNCERTAIN",
  "engine": "...",
  "model": "...",
  "preprocessing": "...",
  "runtime_ms": 0.0
}
```

## API

```python
from src.inference.english_ocr_pipeline import EnglishOcrPipeline

pipe = EnglishOcrPipeline()
pipe.recognize_field(field_name="name_en", crop_path=".../03_name_en.png")
pipe.recognize_license_english(crop_directory=".../value_crops")
```

## Input crops
- Produced by frozen **DYNAMIC_CROP_V1** only; OCR does not re-detect or alter coordinates.
""",
        encoding="utf-8",
    )


def main() -> int:
    write_release_docs()
    model_manifest = build_model_manifest()
    env_manifest = build_environment_manifest()
    (RELEASE_DIR / "model_manifest.json").write_text(
        json.dumps(model_manifest, indent=2), encoding="utf-8"
    )
    (RELEASE_DIR / "environment_manifest.json").write_text(
        json.dumps(env_manifest, indent=2), encoding="utf-8"
    )

    report = run_regression()
    rules = audit_pilot_rules()
    report["document_rules_audit"] = rules
    (RELEASE_DIR / "REGRESSION_REPORT.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    decision = (
        "OCR_ENGLISH_V1_INTEGRATION_REGRESSION"
        if report["integration_regression"]
        else "OCR_ENGLISH_V1_RELEASE_READY"
    )
    print(
        json.dumps(
            {
                "decision": decision,
                "config": str(CONFIG_SRC),
                "router": str(PROJECT_ROOT / "src" / "inference" / "english_ocr_pipeline.py"),
                "release_dir": str(RELEASE_DIR),
                "exact_total": f"{report['exact_total']}/{report['sample_count']}",
                "license": report["license"],
                "dates": report["dates"],
                "name_en": report["name_en"],
                "nationality": report["nationality"],
                "place_of_issue": report["place_of_issue"],
                "flag_uncertain": report["flag_uncertain_count"],
                "reject": report["reject_count"],
                "DOCUMENT_SPECIFIC_RULES_FOUND": rules["DOCUMENT_SPECIFIC_RULES_FOUND"],
            },
            indent=2,
        )
    )
    return 1 if report["integration_regression"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
