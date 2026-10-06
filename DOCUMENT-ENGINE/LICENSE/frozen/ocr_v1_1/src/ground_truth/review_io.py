"""Shared save/load for ground-truth review sessions."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from src.ground_truth.development import DEVELOPMENT_SET
from src.ground_truth.workspace import (
    GT_DIR,
    build_missing_list,
    build_summary,
    load_corpus,
    load_ground_truth,
    save_ground_truth,
    document_verification_status,
)

PROGRESS_PATH = GT_DIR / "development_progress.json"


def apply_field_update(
    field: Dict[str, Any],
    value: Optional[str],
    status: str,
    crop_sha256: Optional[str],
    reviewer: str,
) -> None:
    field["truth_status"] = status
    field["value"] = value
    field["crop_sha256"] = crop_sha256
    field["verified_by"] = reviewer
    field["verified_at"] = datetime.now(timezone.utc).isoformat()


def update_document_meta(doc: Dict[str, Any], reviewer: str) -> None:
    doc["verification_status"] = document_verification_status(doc["fields"])
    if doc["verification_status"] == "FULLY_VERIFIED":
        doc["verified_by"] = doc.get("verified_by") or reviewer
        doc["verified_at"] = doc.get("verified_at") or datetime.now(timezone.utc).isoformat()
        doc["benchmark_split_frozen"] = True


def build_development_progress(
    documents: list,
    corpus_by_test: Dict[str, Any],
) -> Dict[str, Any]:
    dev_docs = [d for d in documents if d["test_id"] in DEVELOPMENT_SET]
    counts = {"VERIFIED": 0, "EMPTY": 0, "UNREADABLE": 0, "UNCERTAIN": 0, "UNVERIFIED": 0}
    verified_ocr_eligible = 0
    verified_ocr_eligible_by_field: Dict[str, int] = {}

    for doc in dev_docs:
        tid = doc["test_id"]
        crops = corpus_by_test.get(tid, {})
        for fname, f in doc["fields"].items():
            st = f.get("truth_status", "UNVERIFIED")
            counts[st] = counts.get(st, 0) + 1
            if st == "VERIFIED" and crops.get(fname, {}).get("ocr_eligible"):
                verified_ocr_eligible += 1
                verified_ocr_eligible_by_field[fname] = (
                    verified_ocr_eligible_by_field.get(fname, 0) + 1
                )

    total_slots = len(dev_docs) * 8
    remaining = counts.get("UNVERIFIED", 0)
    fully = sum(1 for d in dev_docs if d.get("verification_status") == "FULLY_VERIFIED")

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "development_documents": [d["test_id"] for d in dev_docs],
        "development_document_count": len(dev_docs),
        "total_field_slots": total_slots,
        "status_counts": counts,
        "remaining_unverified": remaining,
        "fully_verified_documents": fully,
        "verified_ocr_eligible_crops": verified_ocr_eligible,
        "verified_ocr_eligible_by_field": verified_ocr_eligible_by_field,
        "benchmark_minimum_verified_ocr_eligible": 60,
        "benchmark_development_ready": verified_ocr_eligible >= 60,
    }


def autosave_ground_truth(data: Dict[str, Any]) -> None:
    save_ground_truth(data)
    _, by_test = load_corpus()
    summary = build_summary(data["documents"], by_test)
    (GT_DIR / "ground_truth_summary.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )
    missing = build_missing_list(data["documents"])
    (GT_DIR / "ground_truth_missing.json").write_text(
        json.dumps({"count": len(missing), "items": missing}, indent=2),
        encoding="utf-8",
    )
    progress = build_development_progress(data["documents"], by_test)
    PROGRESS_PATH.write_text(json.dumps(progress, indent=2), encoding="utf-8")
