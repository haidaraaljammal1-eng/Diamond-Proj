"""Interactive local ground-truth review (human types values; no OCR, no pre-fill)."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2

from src.ground_truth.constants import DATE_FIELDS, FIELD_NAMES, TRUTH_TERMINAL_STATUSES
from src.ground_truth.normalize import normalize_stored_value, warn_if_date_invalid
from src.ground_truth.workspace import (
    GT_DIR,
    build_missing_list,
    build_summary,
    load_corpus,
    load_ground_truth,
    save_ground_truth,
    document_verification_status,
)

REVIEW_PATH = GT_DIR / "ground_truth_review.json"


def _show_images(paths: List[Optional[str]], title: str) -> None:
    for label, p in paths:
        if not p or not Path(p).is_file():
            continue
        img = cv2.imread(p)
        if img is None:
            continue
        scale = min(1.0, 1200 / max(img.shape[1], 1))
        if scale < 1.0:
            img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        cv2.imshow(f"{title} — {label}", img)
    cv2.waitKey(1)


def _close_windows() -> None:
    cv2.destroyAllWindows()


def _apply_field_update(
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


def review_session(
    test_id: Optional[str],
    reviewer: str,
    field_filter: Optional[str],
) -> None:
    data = load_ground_truth()
    review = json.loads(REVIEW_PATH.read_text(encoding="utf-8"))
    assets_by_id = {d["test_id"]: d for d in review.get("documents", [])}
    docs_by_id = {d["test_id"]: d for d in data.get("documents", [])}

    targets = [test_id] if test_id else sorted(docs_by_id.keys())
    print("Commands: type value | /empty | /unreadable | /uncertain | /skip | /quit")
    print("No suggestions pre-filled. Use value crop → row crop → original.\n")

    for tid in targets:
        doc = docs_by_id.get(tid)
        assets = assets_by_id.get(tid)
        if not doc or not assets:
            continue
        for fname in FIELD_NAMES:
            if field_filter and fname != field_filter:
                continue
            field = doc["fields"][fname]
            if field.get("truth_status") in TRUTH_TERMINAL_STATUSES:
                continue
            fa = assets["fields"][fname]
            print(f"\n=== {tid} / {fname} (ocr_eligible={fa.get('ocr_eligible')}) ===")
            _show_images(
                [
                    ("value_crop", fa.get("value_crop")),
                    ("row_crop", fa.get("row_crop")),
                    ("original", assets.get("original_image")),
                ],
                f"{tid}:{fname}",
            )
            raw = input("Enter verified value (or command): ").strip()
            _close_windows()
            if raw == "/quit":
                _save_all(data)
                return
            if raw == "/skip":
                continue
            if raw == "/empty":
                _apply_field_update(field, None, "EMPTY", fa.get("crop_sha256"), reviewer)
                continue
            if raw == "/unreadable":
                _apply_field_update(field, None, "UNREADABLE", fa.get("crop_sha256"), reviewer)
                continue
            if raw == "/uncertain":
                _apply_field_update(field, None, "UNCERTAIN", fa.get("crop_sha256"), reviewer)
                continue
            value = normalize_stored_value(fname, raw)
            warn = warn_if_date_invalid(fname, value)
            if warn:
                print(f"WARNING: {warn}")
                confirm = input("Save anyway? [y/N]: ").strip().lower()
                if confirm != "y":
                    continue
            _apply_field_update(field, value, "VERIFIED", fa.get("crop_sha256"), reviewer)

        doc["verification_status"] = document_verification_status(doc["fields"])
        if doc["verification_status"] == "FULLY_VERIFIED":
            doc["verified_by"] = doc.get("verified_by") or reviewer
            doc["verified_at"] = doc.get("verified_at") or datetime.now(timezone.utc).isoformat()
            doc["benchmark_split_frozen"] = True

    _save_all(data)


def _save_all(data: Dict[str, Any]) -> None:
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
    print("Saved ground_truth.json, summary, missing.")


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Manual ground-truth review (local only)")
    parser.add_argument("--test-id", default=None, help="Single licence test_id")
    parser.add_argument("--field", default=None, help="Single field name")
    parser.add_argument("--reviewer", default="human_reviewer", help="Initials or id")
    args = parser.parse_args(argv)
    if not REVIEW_PATH.is_file():
        print("Run: python -m scripts.init_ground_truth_workspace first", file=__import__("sys").stderr)
        return 2
    review_session(args.test_id, args.reviewer, args.field)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
