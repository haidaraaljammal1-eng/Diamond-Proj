"""Verify pilot import, run Crop V1 on 4 images only, build benchmark manifest (no OCR)."""

from __future__ import annotations

import csv
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Set

OCR_ROOT = Path(__file__).resolve().parents[1]
PILOT_ROOT = OCR_ROOT / "pilot_subset"
CROP_V1 = Path(r"C:\Users\Rw\UAE_LICENSE_CROP_V2")
ALLOWED_IDS = frozenset({"pilot_01", "pilot_02", "pilot_03", "pilot_04"})

CONTENT_TYPES = {
    "license_number": "LATIN_DIGITS_OR_ALPHANUMERIC",
    "name_ar": "ARABIC_TEXT",
    "name_en": "LATIN_PERSON_NAME",
    "nationality": "LATIN_TEXT",
    "date_of_birth": "DATE_DD_MM_YYYY",
    "issue_date": "DATE_DD_MM_YYYY",
    "expiry_date": "DATE_DD_MM_YYYY",
    "place_of_issue": "LATIN_TEXT",
}

FIELD_ORDER = list(CONTENT_TYPES.keys())

SCORABLE_TRUTH = frozenset({"TRANSCRIBED_FROM_IMAGE", "VERIFIED", "PILOT_REFERENCE_TRANSCRIPTION"})
NON_SCORABLE_TRUTH = frozenset({"UNREADABLE", "EMPTY", "UNCERTAIN"})


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_manifest() -> Dict[str, Any]:
    manifest_path = PILOT_ROOT / "pilot_subset_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    docs = manifest.get("documents", [])
    ids = {d["test_id"] for d in docs}
    if ids != ALLOWED_IDS or len(docs) != 4:
        return {"valid": False, "reason": "document_id_set_mismatch", "ids": sorted(ids)}
    results = []
    for doc in docs:
        tid = doc["test_id"]
        img = PILOT_ROOT / "images" / doc["source_filename"]
        if not img.is_file():
            return {"valid": False, "reason": f"missing_image:{tid}"}
        live = sha256_file(img)
        ok = live == doc["source_sha256"]
        results.append({"test_id": tid, "sha256_match": ok, "expected": doc["source_sha256"], "actual": live})
        if not ok:
            return {"valid": False, "reason": f"hash_mismatch:{tid}", "results": results}
    return {"valid": True, "results": results}


def run_crop_v1() -> Dict[str, Any]:
    sys.path.insert(0, str(CROP_V1))
    from src.run_crop_pipeline import load_config, run_pipeline

    config = load_config()
    reports = {}
    for tid in sorted(ALLOWED_IDS):
        inp = PILOT_ROOT / "images" / f"{tid}.png"
        out = PILOT_ROOT / "runs" / tid
        report = run_pipeline(inp, out, config, geometry_only=False)
        reports[tid] = {
            "stopped_reason": report.get("stopped_reason"),
            "recommendation": report.get("recommendation"),
            "table_status": report.get("table", {}).get("status"),
            "structure_mode": report.get("table", {}).get("structure_mode"),
            "rows_status": report.get("rows", {}).get("status"),
            "row_count": len(report.get("rows", {}).get("rows", [])),
        }
        fields = report.get("value_crops_phase2", {}).get("value_crop", {}).get("fields", [])
        reports[tid]["fields"] = {
            f["semantic"]: {
                "field_status": f.get("field_status"),
                "value_bbox": f.get("value_bbox"),
            }
            for f in fields
        }
        handoff_path = out / "ocr_handoff.json"
        if handoff_path.is_file():
            handoff = json.loads(handoff_path.read_text(encoding="utf-8"))
            reports[tid]["ocr_handoff"] = {
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
    return reports


def load_reference_truth() -> Dict[str, Dict[str, Any]]:
    gt = json.loads((PILOT_ROOT / "ground_truth_subset.json").read_text(encoding="utf-8"))
    out: Dict[str, Dict[str, Any]] = {}
    for doc in gt.get("documents", []):
        tid = doc["test_id"]
        if tid not in ALLOWED_IDS:
            raise ValueError(f"PILOT_DATASET_CONTAMINATED: {tid}")
        out[tid] = doc.get("fields", {})
    return out


def build_benchmark(crop_reports: Dict[str, Any], truth: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    rows: List[Dict[str, Any]] = []
    manifest = json.loads((PILOT_ROOT / "pilot_subset_manifest.json").read_text(encoding="utf-8"))
    sha_by_id = {d["test_id"]: d["source_sha256"] for d in manifest["documents"]}

    for tid in sorted(ALLOWED_IDS):
        src_img = str((PILOT_ROOT / "images" / f"{tid}.png").resolve())
        handoff = crop_reports[tid].get("ocr_handoff", {})
        for fname in FIELD_ORDER:
            ref = truth[tid].get(fname, {})
            truth_status = ref.get("truth_status", "UNVERIFIED")
            reference_value = ref.get("value")
            hi = handoff.get(fname, {})
            crop_path = hi.get("crop_path")
            crop_sha = None
            if crop_path and Path(crop_path).is_file():
                crop_sha = sha256_file(Path(crop_path))
            geom = hi.get("crop_geometry_status") or crop_reports[tid]["fields"].get(fname, {}).get("field_status")
            ocr_eligible = bool(hi.get("ocr_eligible"))
            scorable = truth_status not in NON_SCORABLE_TRUTH and truth_status in (
                SCORABLE_TRUTH | {"TRANSCRIBED_FROM_IMAGE"}
            )
            if truth_status == "UNREADABLE":
                scorable = False
            rows.append(
                {
                    "test_id": tid,
                    "field_name": fname,
                    "source_image": src_img,
                    "source_sha256": sha_by_id[tid],
                    "crop_path": crop_path,
                    "crop_sha256": crop_sha,
                    "width": hi.get("width"),
                    "height": hi.get("height"),
                    "content_type": CONTENT_TYPES[fname],
                    "truth_status": truth_status,
                    "reference_value": reference_value,
                    "crop_geometry_status": geom,
                    "ocr_eligible": ocr_eligible,
                    "scorable_reference": scorable and geom == "VALUE_OK",
                    "ocr_eligible_scorable": scorable and geom == "VALUE_OK" and ocr_eligible,
                }
            )

    test_ids: Set[str] = {r["test_id"] for r in rows}
    if test_ids != ALLOWED_IDS:
        raise SystemError("PILOT_DATASET_CONTAMINATED")

    total = len(rows)
    unreadable = sum(1 for r in rows if r["truth_status"] == "UNREADABLE")
    crop_rejected = sum(1 for r in rows if r["crop_geometry_status"] != "VALUE_OK")
    scorable = sum(1 for r in rows if r["scorable_reference"])
    ocr_elig_scorable = sum(1 for r in rows if r["ocr_eligible_scorable"])
    per_field = {f: sum(1 for r in rows if r["field_name"] == f and r["ocr_eligible_scorable"]) for f in FIELD_ORDER}

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset_isolation": {
            "only_explicit_four_image_subset_used": True,
            "allowed_test_ids": sorted(ALLOWED_IDS),
            "old_corpus_excluded": True,
        },
        "counts": {
            "TOTAL_FIELDS": total,
            "SCORABLE_FIELDS": scorable,
            "UNREADABLE_FIELDS": unreadable,
            "CROP_REJECTED_FIELDS": crop_rejected,
            "OCR_ELIGIBLE_SCORABLE_FIELDS": ocr_elig_scorable,
        },
        "per_field_ocr_eligible_scorable": per_field,
        "crop_reports_summary": crop_reports,
        "fields": rows,
    }


def main() -> int:
    verification = verify_manifest()
    if not verification["valid"]:
        print(json.dumps({"status": "PILOT_DATASET_INVALID", **verification}, indent=2))
        return 1

    crop_reports = run_crop_v1()
    truth = load_reference_truth()
    benchmark = build_benchmark(crop_reports, truth)

    bench_dir = PILOT_ROOT / "benchmark"
    bench_dir.mkdir(parents=True, exist_ok=True)
    json_path = bench_dir / "pilot_dataset.json"
    csv_path = bench_dir / "pilot_dataset.csv"
    json_path.write_text(json.dumps(benchmark, indent=2, ensure_ascii=False), encoding="utf-8")

    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(benchmark["fields"][0].keys()) if benchmark["fields"] else [])
        writer.writeheader()
        writer.writerows(benchmark["fields"])

    (bench_dir / "pilot_crop_summary.json").write_text(
        json.dumps({"verification": verification, "crop_reports": crop_reports}, indent=2),
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "status": "OK",
                "image_verification": verification,
                "counts": benchmark["counts"],
                "pilot_dataset_json": str(json_path),
                "pilot_dataset_csv": str(csv_path),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
