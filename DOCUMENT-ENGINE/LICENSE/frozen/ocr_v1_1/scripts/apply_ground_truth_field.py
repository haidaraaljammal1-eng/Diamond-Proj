"""Apply one ground-truth field update (agent/human orchestration; no OCR)."""

from __future__ import annotations

import argparse
import json
import sys
from typing import Optional

from src.ground_truth.constants import DATE_FIELDS, FIELD_NAMES, TRUTH_TERMINAL_STATUSES
from src.ground_truth.development import DEVELOPMENT_SET
from src.ground_truth.normalize import normalize_stored_value, validate_date_shape
from src.ground_truth.review_io import apply_field_update, autosave_ground_truth, update_document_meta
from src.ground_truth.workspace import GT_DIR, load_ground_truth

QUEUE_PATH = GT_DIR / "development_review_queue.json"


def next_pending() -> Optional[dict]:
    data = load_ground_truth()
    docs = {d["test_id"]: d for d in data["documents"]}
    queue = json.loads(QUEUE_PATH.read_text(encoding="utf-8"))["items"]
    order = {tid: i for i, tid in enumerate(DEVELOPMENT_SET)}
    pending = []
    for item in queue:
        if item["test_id"] not in DEVELOPMENT_SET:
            continue
        field = docs[item["test_id"]]["fields"][item["field_name"]]
        if field.get("truth_status") not in TRUTH_TERMINAL_STATUSES:
            pending.append(item)
    pending.sort(key=lambda x: (order.get(x["test_id"], 99), FIELD_NAMES.index(x["field_name"])))
    return pending[0] if pending else None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reviewer", default="KJ")
    parser.add_argument("--test-id")
    parser.add_argument("--field")
    parser.add_argument("--value", default=None, help="Raw text for VERIFIED")
    parser.add_argument("--status", default=None, help="VERIFIED|EMPTY|UNREADABLE|UNCERTAIN|SKIP|BACK")
    parser.add_argument("--next", action="store_true", help="Print next pending field JSON only")
    parser.add_argument("--stats", action="store_true", help="Print development progress stats")
    args = parser.parse_args()

    if args.next:
        n = next_pending()
        print(json.dumps(n or {"done": True}, indent=2))
        return 0

    if args.stats:
        p = GT_DIR / "development_progress.json"
        print(p.read_text(encoding="utf-8") if p.is_file() else "{}")
        return 0

    if not args.test_id or not args.field or not args.status:
        print("Need --test-id --field --status (or --next)", file=sys.stderr)
        return 2

    data = load_ground_truth()
    docs = {d["test_id"]: d for d in data["documents"]}
    doc = docs.get(args.test_id)
    if not doc:
        return 1
    field = doc["fields"].get(args.field)
    if not field:
        return 1

    queue_item = None
    for item in json.loads(QUEUE_PATH.read_text(encoding="utf-8"))["items"]:
        if item["test_id"] == args.test_id and item["field_name"] == args.field:
            queue_item = item
            break
    crop_sha = (queue_item or {}).get("crop_sha256")
    source_sha = (queue_item or {}).get("source_sha256") or doc.get("source_input_sha256")

    status = args.status.upper()
    if status == "SKIP":
        print(json.dumps({"skipped": True}))
        return 0
    if status == "BACK":
        print(json.dumps({"back": True, "note": "use apply on previous field to revert manually"}))
        return 0

    if status == "VERIFIED":
        if not args.value:
            print("VERIFIED requires --value", file=sys.stderr)
            return 2
        value = normalize_stored_value(args.field, args.value)
        if args.field in DATE_FIELDS and not validate_date_shape(value):
            print(json.dumps({"error": "invalid_date_format", "expected": "DD/MM/YYYY"}))
            return 3
        apply_field_update(field, value, "VERIFIED", crop_sha, args.reviewer)
    elif status in ("EMPTY", "UNREADABLE", "UNCERTAIN"):
        apply_field_update(field, None, status, crop_sha, args.reviewer)
    else:
        print(f"Unknown status: {status}", file=sys.stderr)
        return 2

    doc["source_input_sha256"] = source_sha
    update_document_meta(doc, args.reviewer)
    autosave_ground_truth(data)
    print(json.dumps({"saved": True, "test_id": args.test_id, "field": args.field, "status": status}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
