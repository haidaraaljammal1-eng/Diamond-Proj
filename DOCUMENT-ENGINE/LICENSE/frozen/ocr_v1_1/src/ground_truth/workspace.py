"""Build and merge ground-truth workspace from canonical OCR corpus."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from src.ground_truth.constants import (
    FIELD_NAMES,
    ROW_CROP_BY_FIELD,
    TRUTH_TERMINAL_STATUSES,
    VALUE_CROP_BY_FIELD,
)

OCR_ROOT = Path(__file__).resolve().parents[2]
CROP_V1_ROOT = Path(r"C:\Users\Rw\UAE_LICENSE_CROP_V2")
GT_DIR = OCR_ROOT / "ground_truth"
CORPUS_PATH = OCR_ROOT / "input_manifest" / "ocr_corpus.json"
SPLIT_PATH = OCR_ROOT / "benchmark" / "dataset_split_proposal.json"

FIELD_NAMES_EXPORT = FIELD_NAMES


def _empty_field() -> Dict[str, Any]:
    return {"value": None, "truth_status": "UNVERIFIED", "crop_sha256": None}


def _load_json(path: Path) -> Any:
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _handoff_for_test(test_id: str) -> Optional[Dict[str, Any]]:
    path = (
        CROP_V1_ROOT
        / "output"
        / "PRE_OCR_HARDENING_REGRESSION"
        / test_id
        / "ocr_handoff.json"
    )
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _run_dir_for_test(test_id: str) -> Path:
    return CROP_V1_ROOT / "output" / "PRE_OCR_HARDENING_REGRESSION" / test_id


def _benchmark_split(test_id: str, split: Dict[str, Any]) -> str:
    if test_id == split.get("special_challenge", {}).get("negative_control"):
        return "special_negative"
    if test_id == split.get("special_challenge", {}).get("low_resolution"):
        return "special_low_res"
    if test_id in split.get("holdout_test", []):
        return "holdout"
    if test_id in split.get("development_calibration", []):
        return "development"
    return "unassigned"


def load_corpus() -> Tuple[Dict[str, Any], Dict[str, Dict[str, Dict[str, Any]]]]:
    corpus = _load_json(CORPUS_PATH)
    if not corpus:
        raise FileNotFoundError(f"Missing corpus: {CORPUS_PATH}")
    by_test: Dict[str, Dict[str, Dict[str, Any]]] = {}
    for row in corpus.get("crops", []):
        tid = row["test_id"]
        by_test.setdefault(tid, {})[row["field_name"]] = row
    return corpus, by_test


def load_ground_truth() -> Dict[str, Any]:
    path = GT_DIR / "ground_truth.json"
    data = _load_json(path)
    if not data:
        return {
            "schema_version": "1.0",
            "crop_release": "DYNAMIC_CROP_V1_FROZEN_FOR_OCR",
            "documents": [],
        }
    return data


def save_ground_truth(data: Dict[str, Any]) -> Path:
    GT_DIR.mkdir(parents=True, exist_ok=True)
    path = GT_DIR / "ground_truth.json"
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def _merge_field(
    existing: Optional[Dict[str, Any]],
    crop_row: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    if existing and existing.get("truth_status") in TRUTH_TERMINAL_STATUSES:
        out = dict(existing)
        if crop_row and out.get("truth_status") == "VERIFIED":
            out["crop_sha256"] = crop_row.get("crop_sha256")
        return out
    base = _empty_field()
    if crop_row:
        base["crop_sha256"] = crop_row.get("crop_sha256")
    if existing:
        for k in ("value", "truth_status", "crop_sha256", "verified_by", "verified_at"):
            if existing.get(k) is not None or existing.get("truth_status") in TRUTH_TERMINAL_STATUSES:
                base[k] = existing.get(k)
    return base


def document_verification_status(fields: Dict[str, Dict[str, Any]]) -> str:
    statuses = [fields[f]["truth_status"] for f in FIELD_NAMES]
    if all(s == "UNVERIFIED" for s in statuses):
        return "UNVERIFIED"
    if all(s in TRUTH_TERMINAL_STATUSES for s in statuses):
        return "FULLY_VERIFIED"
    return "PARTIALLY_VERIFIED"


def _merge_document(
    existing: Optional[Dict[str, Any]],
    test_id: str,
    crop_fields: Dict[str, Dict[str, Any]],
    input_sha256: Optional[str],
    split_label: str,
) -> Dict[str, Any]:
    doc = {
        "test_id": test_id,
        "source_input_sha256": input_sha256,
        "verified_by": None,
        "verified_at": None,
        "reviewed_by": None,
        "reviewed_at": None,
        "verification_status": "UNVERIFIED",
        "benchmark_split": split_label,
        "benchmark_split_frozen": False,
        "fields": {},
    }
    if existing:
        for k in (
            "source_input_sha256",
            "verified_by",
            "verified_at",
            "reviewed_by",
            "reviewed_at",
            "benchmark_split_frozen",
        ):
            if existing.get(k) is not None:
                doc[k] = existing.get(k)
        if existing.get("benchmark_split_frozen") and existing.get("benchmark_split"):
            doc["benchmark_split"] = existing["benchmark_split"]

    for fname in FIELD_NAMES:
        doc["fields"][fname] = _merge_field(
            (existing or {}).get("fields", {}).get(fname),
            crop_fields.get(fname),
        )
    doc["verification_status"] = document_verification_status(doc["fields"])
    if doc["verification_status"] == "FULLY_VERIFIED" and doc.get("verified_by"):
        doc["benchmark_split_frozen"] = doc.get("benchmark_split_frozen", True)
    return doc


def build_review_assets(
    test_id: str,
    crop_fields: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    run_dir = _run_dir_for_test(test_id)
    original = run_dir / "01_original.png"
    field_assets: Dict[str, Any] = {}
    for fname in FIELD_NAMES:
        row_name = ROW_CROP_BY_FIELD[fname]
        val_name = VALUE_CROP_BY_FIELD[fname]
        crow = crop_fields.get(fname, {})
        field_assets[fname] = {
            "value_crop": str((run_dir / "value_crops" / val_name).resolve()),
            "row_crop": str((run_dir / "row_crops" / row_name).resolve()),
            "ocr_eligible": bool(crow.get("ocr_eligible")),
            "crop_geometry_status": crow.get("crop_geometry_status"),
            "content_sanity_status": crow.get("content_sanity_status"),
            "crop_sha256": crow.get("crop_sha256"),
        }
    return {
        "test_id": test_id,
        "original_image": str(original.resolve()) if original.is_file() else None,
        "review_order_hint": ["value_crop", "row_crop", "original_image"],
        "fields": field_assets,
    }


def build_missing_list(documents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    missing: List[Dict[str, Any]] = []
    for doc in documents:
        tid = doc["test_id"]
        for fname in FIELD_NAMES:
            f = doc["fields"][fname]
            if f.get("truth_status") == "UNVERIFIED":
                missing.append(
                    {
                        "test_id": tid,
                        "field_name": fname,
                        "reason": "awaiting_manual_verification",
                        "benchmark_split": doc.get("benchmark_split"),
                    }
                )
    return missing


def build_summary(
    documents: List[Dict[str, Any]],
    corpus_by_test: Dict[str, Dict[str, Dict[str, Any]]],
) -> Dict[str, Any]:
    per_field = {f: {"VERIFIED": 0, "EMPTY": 0, "UNREADABLE": 0, "UNCERTAIN": 0, "UNVERIFIED": 0} for f in FIELD_NAMES}
    fully = partially = unverified_docs = 0
    benchmark_ready = 0
    rejection_ready = 0

    for doc in documents:
        vs = doc.get("verification_status", "UNVERIFIED")
        if vs == "FULLY_VERIFIED":
            fully += 1
        elif vs == "PARTIALLY_VERIFIED":
            partially += 1
        else:
            unverified_docs += 1

        tid = doc["test_id"]
        crops = corpus_by_test.get(tid, {})
        for fname in FIELD_NAMES:
            st = doc["fields"][fname].get("truth_status", "UNVERIFIED")
            per_field[fname][st] = per_field[fname].get(st, 0) + 1
            crow = crops.get(fname, {})
            if crow.get("ocr_eligible") and st == "VERIFIED":
                benchmark_ready += 1
            if st == "EMPTY":
                rejection_ready += 1

    totals = {k: sum(per_field[k].values()) for k in FIELD_NAMES}
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "canonical_documents": len(documents),
        "total_field_slots": len(documents) * len(FIELD_NAMES),
        "per_field_status_counts": per_field,
        "aggregate_status_counts": {
            "VERIFIED": sum(per_field[f]["VERIFIED"] for f in FIELD_NAMES),
            "EMPTY": sum(per_field[f]["EMPTY"] for f in FIELD_NAMES),
            "UNREADABLE": sum(per_field[f]["UNREADABLE"] for f in FIELD_NAMES),
            "UNCERTAIN": sum(per_field[f]["UNCERTAIN"] for f in FIELD_NAMES),
            "UNVERIFIED": sum(per_field[f]["UNVERIFIED"] for f in FIELD_NAMES),
        },
        "fully_verified_documents": fully,
        "partially_verified_documents": partially,
        "unverified_documents": unverified_docs,
        "benchmark_ready_fields": benchmark_ready,
        "rejection_benchmark_empty_fields": rejection_ready,
        "benchmark_eligibility_rule": (
            "accuracy: ocr_eligible AND truth_status==VERIFIED; "
            "reject precision: truth_status==EMPTY"
        ),
    }


def init_or_merge_workspace() -> Dict[str, str]:
    GT_DIR.mkdir(parents=True, exist_ok=True)
    corpus, by_test = load_corpus()
    split = _load_json(SPLIT_PATH) or {}
    existing_data = load_ground_truth()
    existing_by_id = {d["test_id"]: d for d in existing_data.get("documents", [])}

    documents: List[Dict[str, Any]] = []
    for test_id in sorted(by_test.keys()):
        handoff = _handoff_for_test(test_id)
        input_sha = handoff.get("input_sha256") if handoff else None
        split_label = _benchmark_split(test_id, split)
        doc = _merge_document(
            existing_by_id.get(test_id),
            test_id,
            by_test[test_id],
            input_sha,
            split_label,
        )
        documents.append(doc)

    out = {
        "schema_version": "1.0",
        "crop_release": corpus.get("crop_release", {}).get("crop_release_status", "DYNAMIC_CROP_V1_FROZEN_FOR_OCR"),
        "corpus_generated_at": corpus.get("generated_at"),
        "documents": documents,
    }
    save_ground_truth(out)

    review = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "documents": [build_review_assets(d["test_id"], by_test[d["test_id"]]) for d in documents],
    }
    (GT_DIR / "ground_truth_review.json").write_text(
        json.dumps(review, indent=2), encoding="utf-8"
    )

    missing = build_missing_list(documents)
    (GT_DIR / "ground_truth_missing.json").write_text(
        json.dumps({"count": len(missing), "items": missing}, indent=2),
        encoding="utf-8",
    )

    summary = build_summary(documents, by_test)
    (GT_DIR / "ground_truth_summary.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )

    return {
        "ground_truth": str(GT_DIR / "ground_truth.json"),
        "summary": str(GT_DIR / "ground_truth_summary.json"),
        "missing": str(GT_DIR / "ground_truth_missing.json"),
        "review": str(GT_DIR / "ground_truth_review.json"),
    }
