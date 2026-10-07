"""Walk the full development set in one session (human entry only; autosave per field)."""

from __future__ import annotations

import argparse
import json
from typing import Any, Dict, List, Optional, Tuple

import cv2

from src.ground_truth.constants import DATE_FIELDS, FIELD_NAMES, TRUTH_TERMINAL_STATUSES
from src.ground_truth.development import DEVELOPMENT_SET
from src.ground_truth.normalize import normalize_stored_value, validate_date_shape
from src.ground_truth.review_io import apply_field_update, autosave_ground_truth, update_document_meta
from src.ground_truth.workspace import GT_DIR, load_ground_truth

QUEUE_PATH = GT_DIR / "development_review_queue.json"


def _show_images(paths: List[Tuple[str, Optional[str]]], title: str) -> None:
    for label, p in paths:
        if not p or not __import__("pathlib").Path(p).is_file():
            continue
        img = cv2.imread(p)
        if img is None:
            continue
        scale = min(1.0, 1400 / max(img.shape[1], 1))
        if label == "value_crop":
            scale = min(4.0, max(scale, 2.0))
            if img.shape[1] * scale > 1400:
                scale = 1400 / img.shape[1]
        disp = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_NEAREST)
        cv2.imshow(f"{title} — {label}", disp)
    cv2.waitKey(1)


def _close() -> None:
    cv2.destroyAllWindows()


def _pending_queue(data: Dict[str, Any], queue_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    docs = {d["test_id"]: d for d in data["documents"]}
    pending = []
    for item in queue_items:
        tid, fname = item["test_id"], item["field_name"]
        field = docs[tid]["fields"][fname]
        if field.get("truth_status") not in TRUTH_TERMINAL_STATUSES:
            pending.append(item)
    return pending


def review_development(reviewer: str, show_row: bool, show_original: bool) -> None:
    if not QUEUE_PATH.is_file():
        raise SystemExit("Run: python -m scripts.prepare_development_review_pack first")

    queue_doc = json.loads(QUEUE_PATH.read_text(encoding="utf-8"))
    queue_items = [q for q in queue_doc["items"] if q["test_id"] in DEVELOPMENT_SET]

    data = load_ground_truth()
    docs = {d["test_id"]: d for d in data["documents"]}
    history: List[Tuple[str, str]] = []

    print("Development set review — one command for all licences.")
    print("Commands: /empty /unreadable /uncertain /skip /back /quit")
    print("No OCR suggestions. Value crop shown first.\n")

    pending = _pending_queue(data, queue_items)
    idx = 0
    while idx < len(pending):
        item = pending[idx]
        tid = item["test_id"]
        fname = item["field_name"]
        doc = docs[tid]
        field = doc["fields"][fname]

        print(f"\n[{idx + 1}/{len(pending)}] {tid} / {fname} (ocr_eligible={item.get('ocr_eligible')})")
        paths: List[Tuple[str, Optional[str]]] = [("value_crop", item.get("value_crop_path"))]
        if show_row:
            paths.append(("row_crop", item.get("row_crop_path")))
        if show_original:
            paths.append(("original_row", item.get("original_row_strip")))
            paths.append(("original_full", item.get("original_path")))
        _show_images(paths, f"{tid}:{fname}")

        raw = input("Enter verified value (or command): ").strip()
        _close()

        if raw == "/quit":
            autosave_ground_truth(data)
            print("Saved. Quit.")
            return
        if raw == "/back":
            if history:
                ptid, pfname = history.pop()
                doc["fields"][pfname]["truth_status"] = "UNVERIFIED"
                doc["fields"][pfname]["value"] = None
                doc["fields"][pfname]["verified_by"] = None
                doc["fields"][pfname]["verified_at"] = None
                update_document_meta(doc, reviewer)
                autosave_ground_truth(data)
                pending = _pending_queue(data, queue_items)
                idx = max(0, idx - 1)
            continue
        if raw == "/skip":
            idx += 1
            continue
        if raw == "/empty":
            apply_field_update(field, None, "EMPTY", item.get("crop_sha256"), reviewer)
            history.append((tid, fname))
            update_document_meta(doc, reviewer)
            doc["source_input_sha256"] = item.get("source_sha256") or doc.get("source_input_sha256")
            autosave_ground_truth(data)
            idx += 1
            continue
        if raw == "/unreadable":
            apply_field_update(field, None, "UNREADABLE", item.get("crop_sha256"), reviewer)
            history.append((tid, fname))
            update_document_meta(doc, reviewer)
            autosave_ground_truth(data)
            idx += 1
            continue
        if raw == "/uncertain":
            apply_field_update(field, None, "UNCERTAIN", item.get("crop_sha256"), reviewer)
            history.append((tid, fname))
            update_document_meta(doc, reviewer)
            autosave_ground_truth(data)
            idx += 1
            continue

        value = normalize_stored_value(fname, raw)
        if fname in DATE_FIELDS and not validate_date_shape(value):
            print("Invalid date format. Use DD/MM/YYYY. Re-enter or use a command.")
            continue

        apply_field_update(field, value, "VERIFIED", item.get("crop_sha256"), reviewer)
        history.append((tid, fname))
        doc["source_input_sha256"] = item.get("source_sha256") or doc.get("source_input_sha256")
        update_document_meta(doc, reviewer)
        autosave_ground_truth(data)
        idx += 1

    autosave_ground_truth(data)
    print("Development queue complete. Progress saved.")


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Review entire development ground-truth set")
    parser.add_argument("--reviewer", required=True, help="Reviewer id / initials")
    parser.add_argument("--no-row", action="store_true", help="Hide row crop windows")
    parser.add_argument("--no-original", action="store_true", help="Hide original image windows")
    args = parser.parse_args(argv)
    review_development(args.reviewer, not args.no_row, not args.no_original)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
