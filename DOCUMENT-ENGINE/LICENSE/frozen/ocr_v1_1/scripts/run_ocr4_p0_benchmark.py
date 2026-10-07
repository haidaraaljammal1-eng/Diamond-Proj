#!/usr/bin/env python3
"""OCR-4: P0_RAW pilot benchmark (Tesseract + RapidOCR)."""

from __future__ import annotations

import csv
import hashlib
import json
import statistics
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.engines.rapidocr_engine import RapidOcrEngine
from src.engines.tesseract_engine import TesseractEngine
from src.scoring.normalize import (
    cer_normalized_field,
    cer_on_strings,
    normalize_for_field,
    normalized_exact_match,
)

DATASET_PATH = PROJECT_ROOT / "pilot_subset" / "benchmark" / "pilot_dataset.json"
OUT_DIR = PROJECT_ROOT / "results" / "OCR4_P0_RAW"
PREPROCESSING = "P0_RAW"

TESSERACT_PRIMARY = frozenset(
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
RAPIDOCR_PRIMARY = frozenset({"name_ar"})
DATE_FIELDS = frozenset({"date_of_birth", "issue_date", "expiry_date"})


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_scorable_rows() -> list[dict[str, Any]]:
    with DATASET_PATH.open(encoding="utf-8") as f:
        data = json.load(f)
    return [r for r in data["fields"] if r.get("ocr_eligible_scorable")]


def primary_engine(field_name: str) -> str:
    if field_name in RAPIDOCR_PRIMARY:
        return "rapidocr"
    if field_name in TESSERACT_PRIMARY:
        return "tesseract"
    return "tesseract"


def cross_check_engine(field_name: str) -> str | None:
    if field_name == "name_ar":
        return "tesseract"
    if field_name in TESSERACT_PRIMARY:
        return "rapidocr"
    return None


def cross_check_language(field_name: str, engine: str) -> str:
    if engine == "tesseract" and field_name == "name_ar":
        return "ara"
    if engine == "rapidocr":
        return "latin"
    return "eng"


def score_row(
    field_name: str, raw_text: str, reference_value: str
) -> dict[str, Any]:
    exact = raw_text == reference_value
    norm_exact = normalized_exact_match(field_name, raw_text, reference_value)
    cer_ws = cer_on_strings(raw_text, reference_value)
    cer_field = cer_normalized_field(field_name, raw_text, reference_value)
    return {
        "exact_match": exact,
        "normalized_exact_match": norm_exact,
        "cer_whitespace_trimmed": cer_ws,
        "cer_field_normalized": cer_field,
        "normalized_prediction": normalize_for_field(field_name, raw_text),
        "cer_primary_metric": "whitespace_trimmed",
    }


def aggregate_metrics(rows: list[dict[str, Any]], engine: str, role: str) -> dict[str, Any]:
    subset = [r for r in rows if r["engine"] == engine and r["role"] == role]
    if not subset:
        return {"sample_count": 0}
    cers = [r["cer_whitespace_trimmed"] for r in subset]
    runtimes = [r["runtime_ms"] for r in subset]
    exact = sum(1 for r in subset if r["exact_match"])
    norm = sum(1 for r in subset if r["normalized_exact_match"])
    n = len(subset)
    out: dict[str, Any] = {
        "sample_count": n,
        "exact_correct": exact,
        "normalized_correct": norm,
        "exact_accuracy": exact / n,
        "normalized_accuracy": norm / n,
        "mean_cer": statistics.mean(cers),
        "median_cer": statistics.median(cers),
        "mean_runtime_ms": statistics.mean(runtimes),
        "median_runtime_ms": statistics.median(runtimes),
    }
    if n >= 5:
        sorted_rt = sorted(runtimes)
        out["p95_runtime_ms"] = sorted_rt[int(0.95 * (n - 1))]
    return out


def per_field_summary(all_results: list[dict[str, Any]]) -> dict[str, Any]:
    by_field: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in all_results:
        if r["role"] != "primary":
            continue
        by_field[r["field_name"]].append(r)
    summary = {}
    for field, items in sorted(by_field.items()):
        cers = [x["cer_whitespace_trimmed"] for x in items]
        summary[field] = {
            "engine": items[0]["engine"],
            "sample_count": len(items),
            "exact_correct": sum(1 for x in items if x["exact_match"]),
            "normalized_correct": sum(1 for x in items if x["normalized_exact_match"]),
            "exact_accuracy": sum(1 for x in items if x["exact_match"]) / len(items),
            "normalized_accuracy": sum(
                1 for x in items if x["normalized_exact_match"]
            )
            / len(items),
            "mean_cer": statistics.mean(cers),
            "median_cer": statistics.median(cers),
        }
    date_items = [
        r
        for r in all_results
        if r["role"] == "primary" and r["field_name"] in DATE_FIELDS
    ]
    if date_items:
        dc = len(date_items)
        summary["DATE_FIELDS"] = {
            "engine": "tesseract",
            "sample_count": dc,
            "exact_correct": sum(1 for x in date_items if x["exact_match"]),
            "normalized_correct": sum(
                1 for x in date_items if x["normalized_exact_match"]
            ),
            "exact_accuracy": sum(1 for x in date_items if x["exact_match"]) / dc,
            "normalized_accuracy": sum(
                1 for x in date_items if x["normalized_exact_match"]
            )
            / dc,
            "mean_cer": statistics.mean(
                x["cer_whitespace_trimmed"] for x in date_items
            ),
            "median_cer": statistics.median(
                x["cer_whitespace_trimmed"] for x in date_items
            ),
        }
    return summary


def document_complete_accuracy(primary: list[dict[str, Any]]) -> dict[str, Any]:
    by_doc: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in primary:
        by_doc[r["test_id"]].append(r)
    complete = 0
    per_doc = {}
    for tid, items in sorted(by_doc.items()):
        ok = all(x["normalized_exact_match"] for x in items)
        per_doc[tid] = {
            "scorable_fields": len(items),
            "all_normalized_correct": ok,
        }
        if ok:
            complete += 1
    n = len(by_doc)
    return {
        "documents": n,
        "document_complete_count": complete,
        "document_complete_accuracy": complete / n if n else 0.0,
        "per_document": per_doc,
    }


def render_failure_sheet(failures: list[dict[str, Any]], out_path: Path) -> None:
    if not failures:
        fig, ax = plt.subplots(figsize=(8, 2))
        ax.text(0.5, 0.5, "No failures (all exact matches)", ha="center", va="center")
        ax.axis("off")
        fig.savefig(out_path, dpi=120, bbox_inches="tight")
        plt.close(fig)
        return

    cols = 1
    rows = len(failures)
    fig_h = max(4, 2.2 * rows)
    fig, axes = plt.subplots(rows, cols, figsize=(10, fig_h))
    if rows == 1:
        axes = [axes]
    for ax, fail in zip(axes, failures):
        img = Image.open(fail["crop_path"])
        ax.imshow(img)
        ax.axis("off")
        conf = fail.get("raw_confidence")
        conf_s = f"{conf:.2f}" if conf is not None else "n/a"
        title = (
            f"{fail['test_id']} / {fail['field_name']} | {fail['engine']} ({fail['role']})\n"
            f"GT: {fail['ground_truth']}\n"
            f"OCR: {fail['raw_prediction']}\n"
            f"CER={fail['cer_whitespace_trimmed']:.3f} conf={conf_s}"
        )
        ax.set_title(title, fontsize=8, loc="left")
    fig.tight_layout()
    fig.savefig(out_path, dpi=120, bbox_inches="tight")
    plt.close(fig)


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for row in rows:
            w.writerow(row)


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    scorable = load_scorable_rows()
    if len(scorable) != 24:
        print(f"Expected 24 scorable rows, got {len(scorable)}", file=sys.stderr)
        return 2

    tess = TesseractEngine()
    rapid = RapidOcrEngine()
    t_cold = tess.cold_init()
    r_cold = rapid.cold_init()

    raw_records: list[dict[str, Any]] = []
    benchmark_rows: list[dict[str, Any]] = []
    integrity_failures: list[str] = []

    for row in scorable:
        crop_path = Path(row["crop_path"])
        expected_hash = row["crop_sha256"]
        actual = sha256_file(crop_path)
        if actual != expected_hash:
            integrity_failures.append(
                f"{row['test_id']}/{row['field_name']}: expected {expected_hash}, got {actual}"
            )
            continue

        field_name = row["field_name"]
        ref = row["reference_value"]
        assignments: list[tuple[str, str, str]] = []
        pe = primary_engine(field_name)
        assignments.append((pe, "primary", "eng" if pe == "tesseract" else "ara"))
        ce = cross_check_engine(field_name)
        if ce:
            assignments.append(
                (ce, "cross_check", cross_check_language(field_name, ce))
            )

        for engine_name, role, lang in assignments:
            engine = tess if engine_name == "tesseract" else rapid
            ocr = engine.recognize(str(crop_path), field_name, lang)
            scores = score_row(field_name, ocr["raw_text"], ref)
            rec = {
                "test_id": row["test_id"],
                "field_name": field_name,
                "crop_sha256": expected_hash,
                "crop_path": str(crop_path),
                "preprocessing": PREPROCESSING,
                "role": role,
                "engine": engine_name,
                "engine_version": ocr["engine_version"],
                "model": ocr["model"],
                "language": ocr["language"],
                "raw_text": ocr["raw_text"],
                "raw_confidence": ocr["confidence"],
                "runtime_ms": ocr["runtime_ms"],
                "reference_value": ref,
                "ground_truth": ref,
                **scores,
            }
            raw_records.append(
                {
                    "test_id": rec["test_id"],
                    "field_name": rec["field_name"],
                    "crop_sha256": rec["crop_sha256"],
                    "engine": rec["engine"],
                    "role": rec["role"],
                    "version": rec["engine_version"],
                    "model": rec["model"],
                    "language": rec["language"],
                    "raw_text": rec["raw_text"],
                    "raw_confidence": rec["raw_confidence"],
                    "runtime_ms": rec["runtime_ms"],
                }
            )
            benchmark_rows.append(rec)

    if integrity_failures:
        err_path = OUT_DIR / "dataset_integrity_failure.json"
        err_path.write_text(
            json.dumps({"failures": integrity_failures}, indent=2), encoding="utf-8"
        )
        print("BENCHMARK_DATASET_INTEGRITY_FAILED", file=sys.stderr)
        return 3

    primary_only = [r for r in benchmark_rows if r["role"] == "primary"]
    failures = [r for r in benchmark_rows if not r["exact_match"]]

    engine_summary = {
        "tesseract_primary": aggregate_metrics(benchmark_rows, "tesseract", "primary"),
        "rapidocr_primary": aggregate_metrics(benchmark_rows, "rapidocr", "primary"),
        "tesseract_cross_check_name_ar": aggregate_metrics(
            benchmark_rows, "tesseract", "cross_check"
        ),
        "rapidocr_cross_check_latin": {
            k: v
            for k, v in aggregate_metrics(
                benchmark_rows, "rapidocr", "cross_check"
            ).items()
            if k != "sample_count" or v != 0
        },
        "name_ar_comparison": {
            "rapidocr_primary": aggregate_metrics(
                [r for r in benchmark_rows if r["field_name"] == "name_ar"],
                "rapidocr",
                "primary",
            ),
            "tesseract_cross_check": aggregate_metrics(
                [r for r in benchmark_rows if r["field_name"] == "name_ar"],
                "tesseract",
                "cross_check",
            ),
        },
    }

    performance = {
        "tesseract_cold_init_ms": t_cold,
        "rapidocr_cold_init_ms": r_cold,
        "tesseract_warm_runtimes_ms": [
            r["runtime_ms"]
            for r in benchmark_rows
            if r["engine"] == "tesseract"
        ],
        "rapidocr_warm_runtimes_ms": [
            r["runtime_ms"]
            for r in benchmark_rows
            if r["engine"] == "rapidocr"
        ],
    }
    for key, engine, role in (
        ("tesseract_primary_runtime", "tesseract", "primary"),
        ("rapidocr_primary_runtime", "rapidocr", "primary"),
    ):
        sub = [r["runtime_ms"] for r in benchmark_rows if r["engine"] == engine and r["role"] == role]
        if sub:
            performance[key] = {
                "mean_ms": statistics.mean(sub),
                "median_ms": statistics.median(sub),
                "p95_ms": sorted(sub)[int(0.95 * (len(sub) - 1))] if len(sub) >= 5 else None,
            }

    summary = {
        "phase": "OCR-4",
        "preprocessing": PREPROCESSING,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scorable_sample_count": len(scorable),
        "decision": "P0_RAW_BASELINE_COMPLETE_READY_FOR_OCR5_OPTIMIZATION",
        "licensing": {
            "tesseract": "APPROVED_FOR_PILOT",
            "rapidocr": "APPROVED_FOR_INTERNAL_BENCHMARK; LICENCE_REVIEW_REQUIRED_FOR_REDISTRIBUTION",
        },
        "cer_metric": "whitespace_trimmed",
        "document_complete": document_complete_accuracy(primary_only),
        "engine_summary": engine_summary,
    }

    per_field = per_field_summary(benchmark_rows)

    (OUT_DIR / "raw_results.json").write_text(
        json.dumps(raw_records, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    write_csv(
        OUT_DIR / "raw_results.csv",
        raw_records,
        list(raw_records[0].keys()) if raw_records else [],
    )
    (OUT_DIR / "benchmark_results.json").write_text(
        json.dumps(benchmark_rows, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    write_csv(
        OUT_DIR / "benchmark_results.csv",
        benchmark_rows,
        list(benchmark_rows[0].keys()) if benchmark_rows else [],
    )
    (OUT_DIR / "per_field_summary.json").write_text(
        json.dumps(per_field, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    (OUT_DIR / "engine_summary.json").write_text(
        json.dumps(engine_summary, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    (OUT_DIR / "performance_summary.json").write_text(
        json.dumps(performance, indent=2), encoding="utf-8"
    )

    failure_export = [
        {
            "test_id": f["test_id"],
            "field_name": f["field_name"],
            "engine": f["engine"],
            "role": f["role"],
            "ground_truth": f["ground_truth"],
            "raw_prediction": f["raw_text"],
            "normalized_prediction": f["normalized_prediction"],
            "cer": f["cer_whitespace_trimmed"],
            "cer_whitespace_trimmed": f["cer_whitespace_trimmed"],
            "confidence": f["raw_confidence"],
            "crop_path": f["crop_path"],
        }
        for f in failures
    ]
    (OUT_DIR / "failure_cases.json").write_text(
        json.dumps(failure_export, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    render_failure_sheet(failure_export, OUT_DIR / "failure_cases.png")

    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
