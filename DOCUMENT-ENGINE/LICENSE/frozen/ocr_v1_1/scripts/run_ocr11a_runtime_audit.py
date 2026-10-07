#!/usr/bin/env python3
"""OCR-11A: runtime architecture audit (no production code changes)."""

from __future__ import annotations

import json
import statistics
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

AUDIT_DIR = PROJECT_ROOT / "audit" / "OCR11A_RUNTIME"
DATASET = PROJECT_ROOT / "pilot_subset" / "benchmark" / "ocr6_development_dataset.json"
V5_PY = PROJECT_ROOT / "venv_ppocrv5" / "Scripts" / "python.exe"
V5_CLI = PROJECT_ROOT / "scripts" / "ppocrv5_infer_cli.py"
MAIN_PY = PROJECT_ROOT / "venv" / "Scripts" / "python.exe"
DATE_FIELDS = frozenset({"date_of_birth", "issue_date", "expiry_date"})


def ms(t0: float) -> float:
    return (time.perf_counter() - t0) * 1000.0


def load_date_rows() -> list[dict[str, Any]]:
    data = json.loads(DATASET.read_text(encoding="utf-8"))["fields"]
    return [r for r in data if r.get("ocr_eligible_scorable") and r["field_name"] in DATE_FIELDS]


def sample_crops() -> dict[str, str]:
    rows = json.loads(DATASET.read_text(encoding="utf-8"))["fields"]
    out: dict[str, str] = {}
    for r in rows:
        if r.get("ocr_eligible_scorable"):
            out.setdefault(r["field_name"], r["crop_path"])
    return out


def pip_versions(py: Path) -> dict[str, str]:
    r = subprocess.run([str(py), "-m", "pip", "freeze"], capture_output=True, text=True, check=True)
    d = {}
    for line in r.stdout.splitlines():
        if "==" in line:
            n, v = line.split("==", 1)
            d[n.lower()] = v
    return d


def memory_mb() -> float | None:
    try:
        import psutil

        return psutil.Process().memory_info().rss / (1024 * 1024)
    except Exception:
        return None


def profile_date_fields(pipe) -> dict[str, Any]:
    from src.inference.date_fallback import DateCandidate, select_date_output
    from src.validators.date_strict import validate_date_text

    records = []
    primary_accept = 0
    fallback_would_change = 0
    for row in load_date_rows():
        crop_path = Path(row["crop_path"])
        from src.inference.english_ocr_pipeline import hashlib_hex

        cache_key = hashlib_hex(crop_path)
        steps: list[dict[str, Any]] = []
        t_field = time.perf_counter()

        t0 = time.perf_counter()
        img0 = pipe._preprocess(crop_path, "P0_RAW", cache_key)
        steps.append({"step": "preprocess_primary", "ms": ms(t0), "cache_hit": img0.exists()})

        t0 = time.perf_counter()
        p = pipe._rapid_en(img0)
        steps.append({"step": "ocr_primary_rapid_p0", "ms": ms(t0), "raw": p["raw_text"][:40]})
        pv, _ = validate_date_text(p["raw_text"])
        primary = DateCandidate(
            "date_primary", "rapidocr_en", "P0_RAW", p["raw_text"], p.get("confidence"), pv, ""
        )

        fallbacks = []
        for cid, eng, var, psm, wl in (
            ("date_fb_A", "tesseract", "P0_RAW", 7, "0123456789/"),
            ("date_fb_B", "tesseract", "P0_RAW", 13, "0123456789/"),
            ("date_fb_C", "rapidocr_en", "P1_PAD", None, None),
            ("date_fb_D", "rapidocr_en", "P3_UP2_GRAY_PAD", None, None),
        ):
            t0 = time.perf_counter()
            img = pipe._preprocess(crop_path, var, f"{cache_key}_{var}")
            steps.append({"step": f"preprocess_{cid}", "ms": ms(t0)})
            t0 = time.perf_counter()
            if eng == "tesseract":
                o = pipe._tesseract(img, psm or 7, wl)
            else:
                o = pipe._rapid_en(img)
            steps.append({"step": f"ocr_{cid}", "ms": ms(t0)})
            v, _ = validate_date_text(o["raw_text"])
            fallbacks.append(
                DateCandidate(cid, eng, var, o["raw_text"], o.get("confidence"), v, "")
            )

        t0 = time.perf_counter()
        sel = select_date_output(primary, fallbacks, pipe._date_calib)
        steps.append({"step": "select_date_output", "ms": ms(t0)})

        if pv == "ACCEPT":
            primary_accept += 1
        if sel.get("decision") == "primary_accept":
            fallback_would_change += 0
        else:
            if pv == "ACCEPT":
                fallback_would_change += 1

        records.append(
            {
                "test_id": row["test_id"],
                "field_name": row["field_name"],
                "primary_validator": pv,
                "decision": sel.get("decision"),
                "selected_candidate": sel.get("selected_candidate"),
                "fallback_always_executed": True,
                "total_field_ms": ms(t_field),
                "steps": steps,
            }
        )

    prim_ms = []
    fb_ms = []
    for rec in records:
        for s in rec["steps"]:
            if s["step"] == "ocr_primary_rapid_p0":
                prim_ms.append(s["ms"])
            if s["step"].startswith("ocr_date_fb"):
                fb_ms.append(s["ms"])
    return {
        "TOTAL_DATE_CALLS": len(records),
        "PRIMARY_ACCEPT_COUNT": primary_accept,
        "FALLBACK_TRIGGER_COUNT": sum(
            1 for r in records if r["decision"] != "primary_accept"
        ),
        "FALLBACK_OCR_ALWAYS_RUN": True,
        "note": "Pipeline always runs 4 fallback OCR calls before select_date_output",
        "AVERAGE_PRIMARY_OCR_MS": statistics.mean(prim_ms) if prim_ms else 0,
        "AVERAGE_SINGLE_FALLBACK_OCR_MS": statistics.mean(fb_ms) if fb_ms else 0,
        "AVERAGE_TOTAL_FIELD_MS": statistics.mean([r["total_field_ms"] for r in records]),
        "records": records,
    }


def profile_v5_subprocess(img: Path, n: int = 10) -> dict[str, Any]:
    times = []
    for i in range(n):
        t0 = time.perf_counter()
        subprocess.run(
            [str(V5_PY), str(V5_CLI), str(img), "640"],
            capture_output=True,
            text=True,
            check=True,
            cwd=str(PROJECT_ROOT),
        )
        times.append(ms(t0))
    return {
        "subprocess_full_cli_cold_each_call_ms": {
            "first": times[0],
            "second": times[1] if len(times) > 1 else None,
            "mean_10": statistics.mean(times),
            "median_10": statistics.median(times),
            "min_10": min(times),
            "max_10": max(times),
        },
        "note": "Each call spawns new Python + RapidOCR() cold_init in ppocrv5_infer_cli.py",
    }


def profile_v5_inprocess_breakdown(img: Path) -> dict[str, Any]:
    """Run in v5 venv via subprocess with inline timing script (audit only)."""
    code = r'''
import json, time, sys
from pathlib import Path
ROOT = Path(r"%s")
sys.path.insert(0, str(ROOT))
img = sys.argv[1]
out = {}
t0 = time.perf_counter()
import numpy
out["import_numpy_ms"] = (time.perf_counter()-t0)*1000
t0 = time.perf_counter()
import onnxruntime as ort
out["import_onnxruntime_ms"] = (time.perf_counter()-t0)*1000
out["ort_version"] = ort.__version__
t0 = time.perf_counter()
from rapidocr import RapidOCR
out["import_rapidocr_ms"] = (time.perf_counter()-t0)*1000
t0 = time.perf_counter()
from src.engines.rapidocr_ppocrv5_en import RapidOcrPpocrv5EnEngine
out["import_engine_module_ms"] = (time.perf_counter()-t0)*1000
t0 = time.perf_counter()
eng = RapidOcrPpocrv5EnEngine(rec_width=640)
out["construct_engine_ms"] = (time.perf_counter()-t0)*1000
t0 = time.perf_counter()
init_ms = eng.cold_init()
out["cold_init_ms"] = init_ms
t0 = time.perf_counter()
r1 = eng.recognize(img)
out["recognize_1_ms"] = (time.perf_counter()-t0)*1000
t0 = time.perf_counter()
r2 = eng.recognize(img)
out["recognize_2_warm_ms"] = (time.perf_counter()-t0)*1000
warm = []
for _ in range(8):
    t0 = time.perf_counter()
    eng.recognize(img)
    warm.append((time.perf_counter()-t0)*1000)
out["recognize_warm_mean_ms"] = sum(warm)/len(warm)
print(json.dumps(out))
''' % str(PROJECT_ROOT).replace("\\", "\\\\")
    proc = subprocess.run(
        [str(V5_PY), "-c", code, str(img)],
        capture_output=True,
        text=True,
        check=True,
        cwd=str(PROJECT_ROOT),
    )
    return json.loads(proc.stdout.strip())


def cold_warm_engines(crops: dict[str, str]) -> dict[str, Any]:
    from src.engines.rapidocr_english import RapidOcrEnglishEngine
    from src.engines.tesseract_english import TesseractEnglishEngine

    results: dict[str, Any] = {}

    def bench(name: str, fn, n: int = 10) -> None:
        times = []
        for _ in range(n):
            t0 = time.perf_counter()
            fn()
            times.append(ms(t0))
        results[name] = {
            "cold_first_ms": times[0],
            "warm_second_ms": times[1],
            "warm_mean_ms": statistics.mean(times[1:]),
            "warm_median_ms": statistics.median(times[1:]),
            "n": n,
        }

    tess = TesseractEnglishEngine()
    tess.cold_init()
    lic = crops["license_number"]
    bench(
        "tesseract_license",
        lambda: tess.recognize_with_config(lic, 7, "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
    )
    nat = crops["nationality"]
    bench("tesseract_nationality", lambda: tess.recognize_with_config(nat, 13, None))

    rapid = RapidOcrEnglishEngine()
    rapid.cold_init()
    date_img = crops["date_of_birth"]
    place_img = crops["place_of_issue"]
    bench("rapidocr_v4_date_crop", lambda: rapid.recognize(date_img, "name_en"))
    bench("rapidocr_v4_place_crop", lambda: rapid.recognize(place_img, "name_en"))

    return results


def disk_io_profile(pipe, crop: Path) -> dict[str, Any]:
    from src.inference.english_ocr_pipeline import hashlib_hex
    from src.preprocess.english_variants import materialize_variant

    cache = AUDIT_DIR / "_io_cache"
    cache.mkdir(parents=True, exist_ok=True)
    key = hashlib_hex(crop)
    t0 = time.perf_counter()
    crop.read_bytes()
    read_crop_ms = ms(t0)
    out_path = cache / "test_variant.png"
    if out_path.is_file():
        out_path.unlink()
    t0 = time.perf_counter()
    materialize_variant(crop, "P1_PAD", cache, key)
    preprocess_write_ms = ms(t0)
    t0 = time.perf_counter()
    materialize_variant(crop, "P1_PAD", cache, key)
    cache_hit_ms = ms(t0)
    t0 = time.perf_counter()
    hashlib_hex(crop)
    sha_read_ms = ms(t0)
    return {
        "crop_read_bytes_ms": read_crop_ms,
        "materialize_miss_ms": preprocess_write_ms,
        "materialize_cache_hit_ms": cache_hit_ms,
        "hashlib_sha256_crop_ms": sha_read_ms,
        "note": "recognize_field reads full crop SHA256 every call",
    }


def full_document_runs(n_docs: int = 10) -> dict[str, Any]:
    from src.inference.english_ocr_pipeline import EnglishOcrPipeline

    dirs = sorted(
        (PROJECT_ROOT / "pilot_subset" / "runs").glob("pilot_*/value_crops")
    )[:n_docs]
    pipe = EnglishOcrPipeline(cache_dir=AUDIT_DIR / "_pipe_cache")
    times = []
    per_field_first: dict[str, list[float]] = {}
    for i, d in enumerate(dirs):
        t0 = time.perf_counter()
        res = pipe.recognize_license_english(d)
        times.append(ms(t0))
        if i == 0:
            for fn, rec in res["fields"].items():
                per_field_first.setdefault(fn, []).append(rec.get("runtime_ms", 0))
    return {
        "pipeline_construct_once": True,
        "documents": [str(d) for d in dirs],
        "full_document_ms": {
            "first": times[0],
            "second": times[1] if len(times) > 1 else None,
            "mean": statistics.mean(times),
            "median": statistics.median(times),
            "p95": sorted(times)[int(0.95 * (len(times) - 1))] if len(times) > 1 else times[0],
            "all": times,
        },
        "first_document_field_runtime_ms": {k: v[0] for k, v in per_field_first.items()},
    }


def architecture_comparison() -> dict[str, Any]:
    opts = {}
    for key, desc in [
        ("A", "Current fresh subprocess per NAME_EN"),
        ("B", "Persistent PP-OCRv5 JSON-lines worker"),
        ("C", "Localhost-only PP-OCRv5 service"),
        ("D", "Persistent worker Rapid v4 + v5"),
        ("E", "Reused v4 in main + persistent v5 worker"),
        ("F", "Merge PP-OCRv5 into main venv"),
        ("G", "One subprocess per document all OCR"),
    ]:
        opts[key] = {"label": desc}
    opts["A"].update(
        {
            "expected_name_en_warm_ms": "5500+ (measured subprocess mean)",
            "complexity": "LOW (current)",
            "crash_isolation": "HIGH",
            "output_equivalent": "YES",
        }
    )
    opts["B"].update(
        {
            "expected_name_en_warm_ms": "~100-150 (in-process warm rec + IPC)",
            "complexity": "MEDIUM",
            "crash_isolation": "MEDIUM",
            "output_equivalent": "YES if same code path",
            "windows": "stdin/stdout pipe worker reliable",
        }
    )
    opts["E"].update(
        {
            "expected_full_doc_warm_ms": "~2500-3500 estimated",
            "complexity": "MEDIUM",
            "recommended_candidate": True,
        }
    )
    return opts


def main() -> int:
    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    crops = sample_crops()
    name_img = Path(crops["name_en"])

    from src.inference.english_ocr_pipeline import EnglishOcrPipeline

    pipe = EnglishOcrPipeline(cache_dir=AUDIT_DIR / "_pipe_cache2")
    mem_baseline = memory_mb()

    date_prof = profile_date_fields(pipe)
    (AUDIT_DIR / "date_fallback_profile.json").write_text(
        json.dumps(date_prof, indent=2), encoding="utf-8"
    )

    v5_sub = profile_v5_subprocess(name_img, 10)
    v5_break = profile_v5_inprocess_breakdown(name_img)

    cold_warm = cold_warm_engines(crops)
    disk = disk_io_profile(pipe, Path(crops["license_number"]))
    full_doc = full_document_runs(5)

    mem_after = memory_mb()

    main_v = pip_versions(MAIN_PY)
    v5_v = pip_versions(V5_PY)
    compat = {
        "main_venv": {
            "python": subprocess.check_output([str(MAIN_PY), "--version"], text=True).strip(),
            "opencv": main_v.get("opencv-python"),
            "numpy": main_v.get("numpy"),
            "onnxruntime": main_v.get("onnxruntime"),
            "rapidocr_onnxruntime": main_v.get("rapidocr-onnxruntime"),
        },
        "v5_venv": {
            "python": subprocess.check_output([str(V5_PY), "--version"], text=True).strip(),
            "opencv": v5_v.get("opencv-python"),
            "opencv_headless": v5_v.get("opencv-python-headless"),
            "numpy": v5_v.get("numpy"),
            "onnxruntime": v5_v.get("onnxruntime"),
            "rapidocr": v5_v.get("rapidocr"),
        },
        "merge_classification": "POSSIBLE_BUT_RISKY",
        "merge_rationale": [
            "Both use onnxruntime 1.30.0 and numpy 2.5.x",
            "Main has opencv-python; v5 has both opencv-python and opencv-python-headless",
            "EasyOCR failure showed cv2.pyd replacement risk on main venv",
            "rapidocr 3.x vs rapidocr-onnxruntime 1.4.4 are different packages",
        ],
        "do_not_merge_in_11a": True,
    }
    (AUDIT_DIR / "environment_compatibility.json").write_text(
        json.dumps(compat, indent=2), encoding="utf-8"
    )

    lifecycle = {
        "EnglishOcrPipeline.__init__": {
            "tesseract": "A — once per pipeline instance (cold_init)",
            "rapidocr_v4": "A — once per pipeline instance (cold_init)",
            "ppocrv5": "not loaded in main process",
        },
        "recognize_field per call": {
            "tesseract": "D — uses existing engine object; new tesseract.exe per recognize_with_config",
            "rapidocr_v4": "D — uses existing RapidOCR object per OCR call",
            "ppocrv5": "E — fresh subprocess each name_en; CLI cold_init every subprocess",
        },
        "recognize_license_english": {
            "pipeline_instance": "B — one instance reused if caller keeps it",
            "fields": "fully serial in _NAME_CROP_FILES dict order",
        },
    }
    (AUDIT_DIR / "engine_lifecycle.json").write_text(
        json.dumps(lifecycle, indent=2), encoding="utf-8"
    )

    onnx_cfg = {
        "onnxruntime_version_main": main_v.get("onnxruntime"),
        "default_session_options": {"intra_op_num_threads": 0, "inter_op_num_threads": 0, "note": "0 = ORT default"},
        "rapidocr_v4_provider": "CPUExecutionProvider (rapidocr_onnxruntime default)",
        "rapidocr_v5_provider": "onnxruntime via rapidocr 3.9.2",
        "thread_oversubscription_risk": "YES on 4-logical-core CPUs if ORT defaults to all cores per session",
    }

    runtime_profile = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "ocr10_regression_reference": {
            "name_en_mean_ms": 5595,
            "date_mean_ms": 1000,
            "place_mean_ms": 57,
        },
        "v5_subprocess": v5_sub,
        "v5_inprocess_breakdown_single_subprocess": v5_break,
        "name_en_5p6s_breakdown_estimate": {
            "dominant": "subprocess + ppocrv5_infer_cli cold_init (RapidOCR loads det/cls models despite use_det=False)",
            "warm_recognition_only_ms": v5_break.get("recognize_2_warm_ms"),
            "cold_init_ms": v5_break.get("cold_init_ms"),
            "subprocess_mean_ms": v5_sub["subprocess_full_cli_cold_each_call_ms"]["mean_10"],
        },
        "cold_warm_engine_only": cold_warm,
        "disk_io": disk,
        "full_document": full_doc,
        "onnx_threading": onnx_cfg,
        "memory_mb": {"baseline": mem_baseline, "after_pipeline_and_profiles": mem_after},
    }
    (AUDIT_DIR / "runtime_profile.json").write_text(
        json.dumps(runtime_profile, indent=2), encoding="utf-8"
    )

    arch = architecture_comparison()
    arch["recommended"] = "OPTION_E_PERSISTENT_V5_WORKER_PLUS_REUSED_V4"
    arch["also_required"] = "short-circuit date fallback when primary ACCEPT (behavior change — separate accuracy review)"
    (AUDIT_DIR / "architecture_comparison.json").write_text(
        json.dumps(arch, indent=2), encoding="utf-8"
    )

    (AUDIT_DIR / "memory_profile.json").write_text(
        json.dumps(runtime_profile["memory_mb"], indent=2), encoding="utf-8"
    )

    (AUDIT_DIR / "cold_warm_benchmark.json").write_text(
        json.dumps(cold_warm, indent=2), encoding="utf-8"
    )

    print(json.dumps({"audit_dir": str(AUDIT_DIR), "status": "complete"}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
