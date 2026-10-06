#!/usr/bin/env python3
"""OCR-11B benchmarks + regression gate."""

from __future__ import annotations

import json
import shutil
import statistics
import time
from datetime import datetime, timezone
from pathlib import Path

import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

OUT = PROJECT_ROOT / "results" / "OCR11B_RUNTIME"
RELEASE = PROJECT_ROOT / "release" / "OCR_ENGLISH_V1_1_RUNTIME"
OCR10 = PROJECT_ROOT / "release" / "OCR_ENGLISH_V1" / "REGRESSION_REPORT.json"
DATE_AUDIT = PROJECT_ROOT / "audit" / "OCR11A_RUNTIME" / "date_fallback_profile.json"
DATASET = PROJECT_ROOT / "pilot_subset" / "benchmark" / "ocr6_development_dataset.json"


def ms(t0: float) -> float:
    return (time.perf_counter() - t0) * 1000.0


def memory_snapshot() -> dict:
    try:
        import psutil

        main = psutil.Process().memory_info().rss / (1024 * 1024)
        return {"main_rss_mb": main, "psutil": True}
    except Exception:
        return {"psutil": False}


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    from src.inference.english_ocr_pipeline import EnglishOcrPipeline

    rows = [r for r in json.loads(DATASET.read_text(encoding="utf-8"))["fields"] if r.get("ocr_eligible_scorable")]
    name_crop = next(r["crop_path"] for r in rows if r["field_name"] == "name_en")

    pipe = EnglishOcrPipeline(cache_dir=OUT / "bench_cache")
    client = pipe._v5_client

    t0 = time.perf_counter()
    client.ensure_started()
    cold_start = client._cold_start_ms
    first_name = pipe.recognize_field("name_en", name_crop)
    first_name_ms = first_name["runtime_ms"]

    warm = []
    pids = []
    for i in range(10):
        pids.append(client.worker_pid)
        t1 = time.perf_counter()
        r = pipe.recognize_field("name_en", name_crop)
        warm.append(ms(t1))

    worker_bench = {
        "worker_cold_start_ms": cold_start,
        "first_name_en_ms": first_name_ms,
        "warm_name_en_ms": {
            "mean": statistics.mean(warm),
            "median": statistics.median(warm),
            "p95": sorted(warm)[int(0.95 * (len(warm) - 1))],
            "samples": warm,
        },
        "worker_pids_during_warm": pids,
        "pid_reuse": len(set(pids)) == 1,
    }
    (OUT / "worker_benchmark.json").write_text(json.dumps(worker_bench, indent=2), encoding="utf-8")

    date_rows = [r for r in rows if r["field_name"] in ("date_of_birth", "issue_date", "expiry_date")]
    date_profiles = []
    primary_accept = 0
    fallback_trigger = 0
    for row in date_rows:
        t0 = time.perf_counter()
        out = pipe.recognize_field(row["field_name"], row["crop_path"])
        date_profiles.append(
            {
                "test_id": row["test_id"],
                "field_name": row["field_name"],
                "total_ms": ms(t0),
                "decision": out.get("decision"),
                "fallback_skipped": out.get("fallback_skipped", False),
                "raw_text": out.get("raw_text"),
            }
        )
        if out.get("fallback_skipped"):
            primary_accept += 1
        else:
            fallback_trigger += 1

    before_audit = json.loads(DATE_AUDIT.read_text(encoding="utf-8")) if DATE_AUDIT.is_file() else {}
    saved = before_audit.get("TOTAL_DATE_CALLS", 12) * 4 - sum(
        0 if d.get("fallback_skipped") else 4 for d in date_profiles
    )
    date_prof = {
        "TOTAL_DATE_CALLS": len(date_profiles),
        "PRIMARY_SHORT_CIRCUIT_COUNT": primary_accept,
        "FALLBACK_FULL_CHAIN_COUNT": fallback_trigger,
        "unnecessary_fallback_ocr_calls_removed_estimate": saved,
        "avg_total_ms_after": statistics.mean([d["total_ms"] for d in date_profiles]),
        "avg_total_ms_before_audit": before_audit.get("AVERAGE_TOTAL_FIELD_MS"),
        "records": date_profiles,
    }
    (OUT / "date_short_circuit_profile.json").write_text(json.dumps(date_prof, indent=2), encoding="utf-8")

    dirs = sorted((PROJECT_ROOT / "pilot_subset" / "runs").glob("pilot_*/value_crops"))[:5]
    doc_times = []
    doc_pids = []
    for i, d in enumerate(dirs):
        t0 = time.perf_counter()
        pipe.recognize_license_english(d)
        doc_times.append(ms(t0))
        doc_pids.append(client.worker_pid)
    full_doc = {
        "cold_first_document_ms": doc_times[0],
        "warm_documents_ms": doc_times[1:],
        "mean_all": statistics.mean(doc_times),
        "median_all": statistics.median(doc_times),
        "p95_all": sorted(doc_times)[int(0.95 * (len(doc_times) - 1))] if len(doc_times) > 1 else doc_times[0],
        "worker_pids": doc_pids,
        "pid_reuse_across_documents": len(set(doc_pids)) == 1,
    }
    (OUT / "full_document_benchmark.json").write_text(json.dumps(full_doc, indent=2), encoding="utf-8")

    baseline = {
        (r["test_id"], r["field_name"]): r["prediction"]["raw_text"]
        for r in json.loads(OCR10.read_text(encoding="utf-8"))["per_row"]
    }
    diffs = []
    exact = 0
    groups = {"license_number": [0, 0], "date": [0, 0], "name_en": [0, 0], "nationality": [0, 0], "place": [0, 0]}
    for row in rows:
        out = pipe.recognize_field(row["field_name"], row["crop_path"])
        key = (row["test_id"], row["field_name"])
        ref = row["reference_value"]
        from src.scoring.normalize import normalized_exact_match

        ok = normalized_exact_match(row["field_name"], out["raw_text"], ref) and out["status"] == "ACCEPT"
        if ok:
            exact += 1
        if out["raw_text"] != baseline.get(key):
            diffs.append({"key": key, "before": baseline.get(key), "after": out["raw_text"]})
        fn = row["field_name"]
        if fn == "license_number":
            g = "license_number"
        elif fn in ("date_of_birth", "issue_date", "expiry_date"):
            g = "date"
        elif fn == "place_of_issue":
            g = "place"
        else:
            g = fn
        groups[g][1] += 1
        if ok:
            groups[g][0] += 1

    reg = {
        "exact_total": exact,
        "sample_count": len(rows),
        "OUTPUT_DIFFERENCE_COUNT": len(diffs),
        "differences": diffs,
        "groups": {
            "license": f"{groups['license_number'][0]}/{groups['license_number'][1]}",
            "dates": f"{groups['date'][0]}/{groups['date'][1]}",
            "name_en": f"{groups['name_en'][0]}/{groups['name_en'][1]}",
            "nationality": f"{groups['nationality'][0]}/{groups['nationality'][1]}",
            "place": f"{groups['place'][0]}/{groups['place'][1]}",
        },
    }
    (OUT / "regression_comparison.json").write_text(json.dumps(reg, indent=2), encoding="utf-8")

    pipe2 = EnglishOcrPipeline(cache_dir=OUT / "bench_cache2")
    crop = name_crop
    pipe2._v5_client.ensure_started()
    old_pid = pipe2._v5_client.worker_pid
    if pipe2._v5_client._proc:
        pipe2._v5_client._proc.kill()
        pipe2._v5_client._proc.wait(timeout=5)
        pipe2._v5_client._proc = None
    out = pipe2.recognize_field("name_en", crop)
    new_pid = pipe2._v5_client.worker_pid
    recovery = {
        "killed_pid": old_pid,
        "new_pid_after_retry": new_pid,
        "recognition_status": out.get("status"),
        "restart_success": new_pid is not None and new_pid != old_pid and out.get("raw_text"),
        "max_auto_restarts": 1,
    }
    pipe2.close()
    (OUT / "worker_recovery_test.json").write_text(json.dumps(recovery, indent=2), encoding="utf-8")

    mem = memory_snapshot()
    if client.worker_pid:
        try:
            import psutil

            mem["worker_rss_mb"] = psutil.Process(client.worker_pid).memory_info().rss / (1024 * 1024)
        except Exception:
            pass
    (OUT / "memory_profile.json").write_text(json.dumps(mem, indent=2), encoding="utf-8")

    pipe.close()

    RELEASE.mkdir(parents=True, exist_ok=True)
    shutil.copy2(PROJECT_ROOT / "config" / "ocr_final_english_v1.json", RELEASE / "ocr_final_english_v1.json")
    shutil.copy2(PROJECT_ROOT / "release" / "OCR_ENGLISH_V1" / "model_manifest.json", RELEASE / "model_manifest.json")
    shutil.copy2(PROJECT_ROOT / "release" / "OCR_ENGLISH_V1" / "environment_manifest.json", RELEASE / "environment_manifest.json")
    (RELEASE / "RUNTIME_ARCHITECTURE.md").write_text(
        """# OCR English V1.1 Runtime

- PP-OCRv5: persistent JSON-lines worker (`venv_ppocrv5`)
- Main venv: Tesseract + RapidOCR v4 unchanged
- Date: short-circuit when `validate_date_text(primary)==ACCEPT`
- Rollback: `runtime.ppocrv5_worker.enabled=false` in config (requires legacy CLI path if re-added)
""",
        encoding="utf-8",
    )
    shutil.copytree(OUT, RELEASE / "performance_results", dirs_exist_ok=True)

    decision = "OCR_ENGLISH_V1_1_RUNTIME_READY" if reg["OUTPUT_DIFFERENCE_COUNT"] == 0 and exact == 26 else "RUNTIME_OPTIMIZATION_REGRESSION"
    report = {
        "decision": decision,
        "worker_bench": worker_bench,
        "date_prof": date_prof,
        "full_doc": full_doc,
        "regression": reg,
    }
    (OUT / "OCR11B_RUNTIME_REPORT.md").write_text(
        f"# OCR-11B Report\n\nDecision: **{decision}**\n\nSee JSON artifacts in this folder.\n",
        encoding="utf-8",
    )
    print(json.dumps(report, indent=2))
    return 1 if decision != "OCR_ENGLISH_V1_1_RUNTIME_READY" else 0


if __name__ == "__main__":
    raise SystemExit(main())
