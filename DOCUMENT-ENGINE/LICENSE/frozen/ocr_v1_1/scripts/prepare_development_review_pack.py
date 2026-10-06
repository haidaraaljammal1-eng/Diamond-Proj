"""Validate development set and build consolidated review pack (no OCR)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from src.ground_truth.constants import FIELD_NAMES, ROW_CROP_BY_FIELD, VALUE_CROP_BY_FIELD
from src.ground_truth.development import (
    DEVELOPMENT_SET,
    HARD_CASE_SET,
    HOLDOUT_SET,
    NEGATIVE_CONTROL_SET,
)
from src.ground_truth.review_io import build_development_progress
from src.ground_truth.workspace import (
    CROP_V1_ROOT,
    GT_DIR,
    _handoff_for_test,
    _run_dir_for_test,
    load_corpus,
    load_ground_truth,
)

PACK_DIR = GT_DIR / "development_review_pack"
QUEUE_PATH = GT_DIR / "development_review_queue.json"
VALIDATION_PATH = GT_DIR / "development_set_validation.json"

CANVAS_W = 1400
LABEL_H = 48
GAP = 12


def _load_report(test_id: str) -> Optional[Dict[str, Any]]:
    p = _run_dir_for_test(test_id) / "pipeline_report.json"
    if not p.is_file():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def _row_y_bounds(report: Dict[str, Any], semantic: str) -> Optional[Tuple[int, int]]:
    for row in report.get("rows", {}).get("rows", []):
        if row.get("semantic") == semantic:
            return int(row["y1"]), int(row["y2"])
    return None


def _extract_original_strip(test_id: str, field_name: str, out_path: Path) -> Optional[str]:
    run_dir = _run_dir_for_test(test_id)
    orig_path = run_dir / "01_original.png"
    if not orig_path.is_file():
        return None
    report = _load_report(test_id)
    if not report:
        return None
    bounds = _row_y_bounds(report, field_name)
    if not bounds:
        return None
    img = cv2.imread(str(orig_path))
    if img is None:
        return None
    y1, y2 = bounds
    pad = 4
    y1 = max(0, y1 - pad)
    y2 = min(img.shape[0], y2 + pad)
    strip = img[y1:y2, :]
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out_path), strip)
    return str(out_path.resolve())


def validate_development_set() -> Dict[str, Any]:
    _, by_test = load_corpus()
    gt = load_ground_truth()
    gt_ids = {d["test_id"] for d in gt.get("documents", [])}
    results: List[Dict[str, Any]] = []
    all_ok = True

    for test_id in DEVELOPMENT_SET:
        issues: List[str] = []
        if test_id not in gt_ids:
            issues.append("missing_canonical_document_in_ground_truth")
        if test_id not in by_test:
            issues.append("missing_from_ocr_corpus")
        run_dir = _run_dir_for_test(test_id)
        handoff = _handoff_for_test(test_id)
        if not handoff:
            issues.append("missing_ocr_handoff")
        orig = run_dir / "01_original.png"
        if not orig.is_file():
            issues.append("missing_original_image")
        for fname in FIELD_NAMES:
            vc = run_dir / "value_crops" / VALUE_CROP_BY_FIELD[fname]
            rc = run_dir / "row_crops" / ROW_CROP_BY_FIELD[fname]
            if not vc.is_file():
                issues.append(f"missing_value_crop:{fname}")
            if not rc.is_file():
                issues.append(f"missing_row_crop:{fname}")
            crow = by_test.get(test_id, {}).get(fname)
            if not crow or not crow.get("crop_sha256"):
                issues.append(f"missing_crop_sha256:{fname}")
        if handoff and not handoff.get("input_sha256"):
            issues.append("missing_source_input_sha256")
        ok = len(issues) == 0
        if not ok:
            all_ok = False
        results.append({"test_id": test_id, "ok": ok, "issues": issues})

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "all_ok": all_ok,
        "development_set": DEVELOPMENT_SET,
        "excluded": {
            "holdout": HOLDOUT_SET,
            "negative_control": NEGATIVE_CONTROL_SET,
            "hard_case": HARD_CASE_SET,
        },
        "results": results,
    }


def _bar(text: str, width: int = CANVAS_W) -> np.ndarray:
    img = np.full((LABEL_H, width, 3), 245, dtype=np.uint8)
    cv2.putText(
        img,
        text[:120],
        (10, 32),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.75,
        (30, 30, 30),
        2,
        cv2.LINE_AA,
    )
    return img


def _pad_row(img: np.ndarray, width: int = CANVAS_W) -> np.ndarray:
    h, w = img.shape[:2]
    if w >= width:
        return img
    pad = np.full((h, width - w, 3), 255, dtype=np.uint8)
    return np.hstack([img, pad])


def _display_enlarge(img: np.ndarray, min_scale: float = 3.0, max_width: int = CANVAS_W - 40) -> np.ndarray:
    h, w = img.shape[:2]
    scale = max(min_scale, 1.0)
    if w * scale > max_width:
        scale = max_width / float(w)
    if scale <= 1.01:
        return img
    return cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_NEAREST)


def build_licence_sheet(
    test_id: str,
    doc: Dict[str, Any],
    corpus_fields: Dict[str, Any],
    assets_dir: Path,
) -> np.ndarray:
    blocks: List[np.ndarray] = [_bar(f"TEST_ID: {test_id} — DEVELOPMENT REVIEW (no OCR suggestions)")]
    run_dir = _run_dir_for_test(test_id)
    review_assets = json.loads((GT_DIR / "ground_truth_review.json").read_text(encoding="utf-8"))
    asset_doc = next((d for d in review_assets["documents"] if d["test_id"] == test_id), None)

    for fname in FIELD_NAMES:
        field = doc["fields"][fname]
        crow = corpus_fields.get(fname, {})
        fa = (asset_doc or {}).get("fields", {}).get(fname, {})
        status = field.get("truth_status", "UNVERIFIED")
        val_disp = field.get("value") if status == "VERIFIED" else "(not entered)"
        header = (
            f"FIELD: {fname} | truth_status={status} | ocr_eligible={crow.get('ocr_eligible')} "
            f"| current_value={val_disp}"
        )
        blocks.append(_bar(header))
        strip_path = assets_dir / f"{test_id}_{fname}_original_strip.png"
        strip_saved = _extract_original_strip(test_id, fname, strip_path)

        vc_path = fa.get("value_crop") or str(run_dir / "value_crops" / VALUE_CROP_BY_FIELD[fname])
        rc_path = fa.get("row_crop") or str(run_dir / "row_crops" / ROW_CROP_BY_FIELD[fname])
        vc = cv2.imread(vc_path) if Path(vc_path).is_file() else np.zeros((40, 200, 3), np.uint8)
        rc = cv2.imread(rc_path) if Path(rc_path).is_file() else np.zeros((50, 400, 3), np.uint8)
        blocks.append(_bar("1) VALUE CROP (enlarged for reading)"))
        blocks.append(_pad_row(_display_enlarge(vc, 4.0)))
        blocks.append(_bar("2) FULL ROW CROP"))
        blocks.append(_pad_row(_display_enlarge(rc, 2.0)))
        blocks.append(_bar("3) ORIGINAL LICENCE ROW REGION"))
        if strip_saved and Path(strip_saved).is_file():
            ost = cv2.imread(strip_saved)
            blocks.append(_pad_row(_display_enlarge(ost, 1.5)))
        blocks.append(np.full((GAP, CANVAS_W, 3), 255, dtype=np.uint8))

    return np.vstack(blocks)


def build_queue(documents: List[Dict[str, Any]], by_test: Dict[str, Any]) -> List[Dict[str, Any]]:
    queue: List[Dict[str, Any]] = []
    docs = {d["test_id"]: d for d in documents}
    review = json.loads((GT_DIR / "ground_truth_review.json").read_text(encoding="utf-8"))
    assets_by = {d["test_id"]: d for d in review.get("documents", [])}

    for test_id in DEVELOPMENT_SET:
        doc = docs.get(test_id)
        if not doc:
            continue
        assets = assets_by.get(test_id, {})
        for fname in FIELD_NAMES:
            field = doc["fields"][fname]
            fa = assets.get("fields", {}).get(fname, {})
            crow = by_test.get(test_id, {}).get(fname, {})
            queue.append(
                {
                    "test_id": test_id,
                    "field_name": fname,
                    "value_crop_path": fa.get("value_crop"),
                    "row_crop_path": fa.get("row_crop"),
                    "original_path": assets.get("original_image"),
                    "original_row_strip": str(
                        (PACK_DIR / "assets" / f"{test_id}_{fname}_original_strip.png").resolve()
                    ),
                    "ocr_eligible": crow.get("ocr_eligible"),
                    "truth_status": field.get("truth_status"),
                    "current_value": field.get("value"),
                    "source_sha256": doc.get("source_input_sha256"),
                    "crop_sha256": field.get("crop_sha256") or crow.get("crop_sha256"),
                }
            )
    return queue


def _write_contact_sheet_pages(blocks: List[np.ndarray], out_prefix: Path) -> List[str]:
    paths: List[str] = []
    max_h = 28000
    chunk: List[np.ndarray] = []
    h_acc = 0
    page = 1
    for b in blocks:
        if h_acc + b.shape[0] > max_h and chunk:
            out = out_prefix.parent / f"{out_prefix.name}_{page:02d}.png"
            cv2.imwrite(str(out), np.vstack(chunk))
            paths.append(str(out))
            page += 1
            chunk = []
            h_acc = 0
        chunk.append(b)
        h_acc += b.shape[0]
    if chunk:
        out = out_prefix.parent / f"{out_prefix.name}_{page:02d}.png"
        cv2.imwrite(str(out), np.vstack(chunk))
        paths.append(str(out))
    return paths


def main() -> int:
    validation = validate_development_set()
    VALIDATION_PATH.write_text(json.dumps(validation, indent=2), encoding="utf-8")
    if not validation["all_ok"]:
        print(json.dumps({"error": "validation_failed", "path": str(VALIDATION_PATH)}, indent=2))
        return 1

    PACK_DIR.mkdir(parents=True, exist_ok=True)
    assets_dir = PACK_DIR / "assets"
    assets_dir.mkdir(exist_ok=True)

    gt = load_ground_truth()
    _, by_test = load_corpus()
    docs_by = {d["test_id"]: d for d in gt["documents"]}

    per_licence_paths: List[str] = []
    master_blocks: List[np.ndarray] = []

    for test_id in DEVELOPMENT_SET:
        doc = docs_by[test_id]
        sheet = build_licence_sheet(test_id, doc, by_test[test_id], assets_dir)
        out = PACK_DIR / f"{test_id}_review.png"
        cv2.imwrite(str(out), sheet)
        per_licence_paths.append(str(out))
        master_blocks.append(sheet)
        master_blocks.append(np.full((24, CANVAS_W, 3), 200, dtype=np.uint8))

    contact_paths = _write_contact_sheet_pages(
        master_blocks,
        PACK_DIR / "all_development_contact_sheet",
    )

    queue = build_queue(gt["documents"], by_test)
    QUEUE_PATH.write_text(
        json.dumps(
            {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "development_set": DEVELOPMENT_SET,
                "field_count": len(queue),
                "items": queue,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    progress = build_development_progress(gt["documents"], by_test)
    (GT_DIR / "development_progress.json").write_text(
        json.dumps(progress, indent=2), encoding="utf-8"
    )

    manifest = {
        "pack_dir": str(PACK_DIR),
        "per_licence_sheets": per_licence_paths,
        "contact_sheets": contact_paths,
        "queue": str(QUEUE_PATH),
        "validation": str(VALIDATION_PATH),
    }
    (PACK_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
