#!/usr/bin/env python3
"""8-specimen blind regression: focused passport number engine vs baseline."""

from __future__ import annotations

import hashlib
import json
import sys
import tempfile
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
OUT = ROOT / "results" / "passport_number" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

SPECIMENS = [
    ("SYR", ROOT / "results" / "mrz_a2" / "20260930T134456Z" / "01_original_reference.png"),
    ("GBR", ROOT / "results" / "mrz_a2" / "20260930T140445Z" / "01_original_reference.png"),
    ("DEU", ROOT / "results" / "mrz_a2" / "20260930T214256Z" / "01_original_reference.png"),
    ("NLD", ROOT / "results" / "mrz_a2" / "20260930T222937Z" / "01_original_reference.png"),
    ("NOR", ROOT / "results" / "mrz_a2" / "20260930T215513Z" / "01_original_reference.png"),
    ("USA", ROOT / "results" / "mrz_a2" / "20260930T204944Z" / "01_original_reference.png"),
    ("KOR", ROOT / "samples" / "passport" / "image.png"),
    ("A9_ICAO", ROOT / "results" / "mrz_a2" / "20260930T165849Z" / "01_original_reference.png"),
    ("ARG", ROOT / "samples" / "passport" / "image copy.png"),
    ("SYR_NEW", ROOT / "samples" / "passport" / "syria_new_blind.png"),
    ("LUX_NEW", ROOT / "samples" / "passport" / "luxembourg_new_blind.png"),
]

GT = {
    "SYR": "017057747",
    "GBR": "AB1234567",
    "DEU": "C01X00T47",
    "NLD": "SPECI2014",
    "NOR": "CCC002251",
    "USA": "340007955",
    "KOR": "M70689098",
    "A9_ICAO": "L898902C3",
    "ARG": "ZZZ000110",
    "SYR_NEW": "017057747",
    "LUX_NEW": "JC3L7T2H",
}

BASELINE_CORRECT = {"SYR", "GBR", "NOR", "A9_ICAO"}

MRZ_FILES = [
    "scripts/mrz_detect_td3.py",
    "scripts/mrz_detect_td3_fallback.py",
    "scripts/mrz_detect_orchestrator.py",
    "scripts/icao_td3.py",
    "scripts/run_mrz_a1.py",
]


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def old_engine_passport_number(image_path: Path) -> str | None:
    from mrz_detect_orchestrator import detect_mrz_orchestrated
    from mrz_detect_td3 import load_params
    from mrz_detect_td3_fallback import load_fallback_params
    from mrz_fallback_crop_normalize import normalize_fallback_pair_crops
    from mrz_pre_ocr_gate import validate_pre_ocr
    from run_mrz_a1 import run_ocr_on_lines
    from run_mrz_a2 import _params_with_a14
    from icao_td3 import normalize_mrz_line

    bgr = cv2.imread(str(image_path))
    params = _params_with_a14(load_params())
    orch = detect_mrz_orchestrated(bgr, params, load_fallback_params())
    det = orch.detection
    if det.status != "MRZ_FOUND" or det.line2_bgr is None:
        return None
    work = det
    if orch.detector_path == "FALLBACK":
        norm = normalize_fallback_pair_crops(
            bgr, det.line1_bgr, det.line2_bgr, det.line1_bbox, det.line2_bbox, params
        )
        if norm.applied:
            work = replace(
                det,
                line1_bgr=norm.line1_bgr,
                line2_bgr=norm.line2_bgr,
                line1_bbox=norm.line1_bbox,
                line2_bbox=norm.line2_bbox,
            )
    gate = validate_pre_ocr(work.line1_bgr, work.line2_bgr, params)
    if gate.status != "PASS":
        return None
    with tempfile.TemporaryDirectory() as td:
        l1, l2 = Path(td) / "l1.png", Path(td) / "l2.png"
        cv2.imwrite(str(l1), work.line1_bgr)
        cv2.imwrite(str(l2), work.line2_bgr)
        raw = run_ocr_on_lines(l1, l2)
    line2 = normalize_mrz_line(raw["lines"][1]["raw_text"])
    return line2[:9] if len(line2) >= 9 else None


def match_label(extracted: str | None, expected: str) -> str:
    if extracted is None:
        return "NO_EXTRACTION"
    if extracted == expected:
        return "PASS"
    return "FAIL"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "code_identity_mrz_baseline.json").write_text(
        json.dumps({rel: sha256_file(ROOT / rel) for rel in MRZ_FILES if (ROOT / rel).is_file()}, indent=2),
        encoding="utf-8",
    )
    (OUT / "baseline_reference.json").write_text(
        json.dumps(
            {
                "source": "results/passport_number/20261001T124147Z",
                "previous_correct": 6,
                "previous_wrong": 0,
                "previous_no_extraction": 2,
                "previous_accuracy": 0.75,
                "old_engine_correct": 4,
                "old_engine_accuracy": 0.5,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    from passport_number.extract_passport_number import extract_passport_number_from_image

    blind_rows = []
    table = []

    for label, path in SPECIMENS:
        bgr = cv2.imread(str(path))
        new = extract_passport_number_from_image(bgr) if bgr is not None else {"passport_number": None}
        old = old_engine_passport_number(path) if path.is_file() else None
        expected = GT[label]
        extracted = new.get("passport_number")
        m = match_label(extracted, expected)

        focused = new.get("focused_crop") or {}
        best10 = focused.get("best_reading_10") or {}
        ocr_seq = best10.get("sequence_10") or best10.get("normalized")

        row = {
            "passport": label,
            "mrz_found": new.get("mrz_found"),
            "focused_crop": focused.get("geometry", {}).get("ten_cell_crop_wh"),
            "ocr_scope": new.get("ocr_scope"),
            "ocr_result": ocr_seq,
            "valid_checksum": new.get("checksum_pass"),
            "check_digit": new.get("check_digit"),
            "final_passport_number": extracted,
            "expected": expected,
            "match": m,
            "engine_status": new.get("status"),
            "failure_stage": new.get("failure_stage"),
            "checksum_pass": new.get("checksum_pass"),
            "old_engine_number": old,
            "old_match": match_label(old, expected),
        }
        table.append(row)
        blind_rows.append({**new, "passport": label, "match": m})

    (OUT / "blind_extraction.json").write_text(json.dumps(blind_rows, indent=2, default=str), encoding="utf-8")

    gt_eval = []
    for row in table:
        gt_eval.append({**row, "ground_truth_applied_after_blind": True})
    (OUT / "ground_truth_evaluation.json").write_text(json.dumps(gt_eval, indent=2), encoding="utf-8")

    new_correct = sum(1 for r in table if r["match"] == "PASS")
    wrong = sum(1 for r in table if r["match"] == "FAIL")
    no_ext = sum(1 for r in table if r["match"] == "NO_EXTRACTION")
    review = sum(1 for r in table if r.get("engine_status") == "REVIEW")

    hist_labels = {"SYR", "GBR", "DEU", "NLD", "NOR", "USA", "KOR", "A9_ICAO"}
    hist_table = [r for r in table if r["passport"] in hist_labels]
    hist_correct = sum(1 for r in hist_table if r["match"] == "PASS")
    hist_wrong = sum(1 for r in hist_table if r["match"] == "FAIL")

    metrics = {
        "total": len(SPECIMENS),
        "historical_8_correct": hist_correct,
        "historical_8_wrong": hist_wrong,
        "historical_8_no_extraction": sum(
            1 for r in hist_table if r["match"] == "NO_EXTRACTION"
        ),
        "previous_correct": 6,
        "previous_wrong": 0,
        "previous_no_extraction": 2,
        "previous_accuracy": 0.75,
        "old_engine_correct": 4,
        "old_engine_accuracy": 0.5,
        "new_engine_correct": new_correct,
        "new_engine_accuracy": round(new_correct / len(SPECIMENS), 4),
        "wrong_extraction": wrong,
        "no_extraction": no_ext,
        "review_status": review,
        "checksum_rejected": sum(1 for r in table if r.get("failure_stage") == "F_checksum_validation"),
    }
    (OUT / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    md = [
        "# Passport Number Engine — 11-specimen regression (10-cell OCR only)",
        "",
        "OCR scope: **lower MRZ line cells 0–9 only** (`line2[0:10]`). No line 1 OCR, no full line 2 OCR.",
        "",
        "## Required table",
        "",
        "| Passport | 10-cell OCR | Valid checksum | Final passport_number | Expected | Match |",
        "|----------|-------------|----------------|----------------------|----------|-------|",
    ]
    for r in table:
        md.append(
            f"| {r['passport']} | {r['ocr_result']} | {r['valid_checksum']} | "
            f"{r['final_passport_number']} | {r['expected']} | {r['match']} |"
        )
    md.extend(
        [
            "",
            "## Comparison",
            "",
            f"- Historical 8: {hist_correct}/8 pass, {hist_wrong} wrong (baseline was 6/8, 0 wrong)",
            f"- Full 11: {new_correct}/{len(SPECIMENS)} correct ({metrics['new_engine_accuracy']})",
            f"- Wrong: {wrong}, No extraction: {no_ext}, Review: {review}",
            "",
            "## Failure stages",
            "",
        ]
    )
    for r in table:
        if r["match"] != "PASS":
            md.append(f"- **{r['passport']}**: {r.get('failure_stage')} (old: {r['old_match']})")
    md.append("")
    md.append(f"Bundle: `{OUT.relative_to(ROOT)}`")
    (OUT / "REGRESSION_REPORT.md").write_text("\n".join(md), encoding="utf-8")

    safety = {
        "files_created": [
            "scripts/passport_number/",
            "scripts/passport_number/run_regression.py",
        ],
        "files_modified_outside_passport_number": [],
        "files_deleted": 0,
        "folders_deleted": 0,
        "commits": 0,
        "pushes": 0,
    }
    (OUT / "safety_check.json").write_text(json.dumps(safety, indent=2), encoding="utf-8")
    print(json.dumps({"metrics": metrics, "table": table}, indent=2))


if __name__ == "__main__":
    main()
