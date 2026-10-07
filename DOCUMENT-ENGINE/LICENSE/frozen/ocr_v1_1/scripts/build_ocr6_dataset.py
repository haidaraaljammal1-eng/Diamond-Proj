#!/usr/bin/env python3
"""Build OCR-6 development dataset (5 pilots, English scorable rows)."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

OCR_ROOT = Path(__file__).resolve().parents[1]
PILOT = OCR_ROOT / "pilot_subset"
ENGLISH_FIELDS = frozenset(
    {
        "license_number",
        "name_en",
        "nationality",
        "date_of_birth",
        "issue_date",
        "expiry_date",
        "place_of_issue",
    }
)
PILOT_IDS = ("pilot_01", "pilot_02", "pilot_03", "pilot_04", "pilot_05")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def pilot_05_rows() -> list[dict]:
    gt = json.loads((PILOT / "ground_truth_subset.json").read_text(encoding="utf-8"))
    doc = next(d for d in gt["documents"] if d["test_id"] == "pilot_05")
    handoff = json.loads(
        (PILOT / "runs" / "pilot_05" / "ocr_handoff.json").read_text(encoding="utf-8")
    )
    manifest = json.loads((PILOT / "pilot_subset_manifest.json").read_text(encoding="utf-8"))
    sha = next(d["source_sha256"] for d in manifest["documents"] if d["test_id"] == "pilot_05")
    src = str((PILOT / "images" / "pilot_05.png").resolve())
    rows = []
    for f in handoff["fields"]:
        fname = f["field_name"]
        if fname not in ENGLISH_FIELDS:
            continue
        ref = doc["fields"][fname]
        truth_status = ref.get("truth_status")
        scorable = truth_status not in ("UNREADABLE", "UNCERTAIN", "EMPTY")
        geom = f.get("crop_geometry_status")
        crop_path = f.get("crop_path")
        crop_sha = sha256_file(Path(crop_path)) if crop_path and Path(crop_path).is_file() else None
        rows.append(
            {
                "test_id": "pilot_05",
                "field_name": fname,
                "source_image": src,
                "source_sha256": sha,
                "crop_path": crop_path,
                "crop_sha256": crop_sha,
                "width": f.get("width"),
                "height": f.get("height"),
                "truth_status": truth_status,
                "reference_value": ref.get("value"),
                "crop_geometry_status": geom,
                "ocr_eligible": bool(f.get("ocr_eligible")),
                "ocr_eligible_scorable": scorable
                and geom == "VALUE_OK"
                and bool(f.get("ocr_eligible")),
            }
        )
    return rows


def main() -> int:
    legacy = json.loads((PILOT / "benchmark" / "pilot_dataset.json").read_text(encoding="utf-8"))
    rows = [
        r
        for r in legacy["fields"]
        if r["field_name"] in ENGLISH_FIELDS
    ]
    rows.extend(pilot_05_rows())
    scorable = [r for r in rows if r.get("ocr_eligible_scorable")]
    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "phase": "OCR-6",
        "allowed_test_ids": list(PILOT_IDS),
        "english_field_count": len(rows),
        "english_scorable_count": len(scorable),
        "fields": rows,
    }
    path = PILOT / "benchmark" / "ocr6_development_dataset.json"
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"path": str(path), "english_scorable_count": len(scorable)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
