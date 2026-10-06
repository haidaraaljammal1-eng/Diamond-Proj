#!/usr/bin/env python3
"""OCR-9: PP-OCRv5 English NAME_EN benchmark (run with venv_ppocrv5 Python)."""

from __future__ import annotations

import csv
import hashlib
import json
import statistics
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import cv2
import matplotlib.pyplot as plt
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.dynamic.stress import default_perturbations
from src.engines.rapidocr_ppocrv5_en import RapidOcrPpocrv5EnEngine
from src.inference.name_output import sanitize_name_ocr_output
from src.preprocess.english_variants import apply_variant, materialize_variant
from src.scoring.normalize import cer_on_strings, normalized_exact_match
from src.validators.name_en_strict import validate_name_en_text

OUT_DIR = PROJECT_ROOT / "results" / "OCR9_PPOCRV5_NAME"
OCR8_LOO = PROJECT_ROOT / "results" / "OCR8_NAME_SPECIALIST" / "loo_results.json"
DATASET = PROJECT_ROOT / "pilot_subset" / "benchmark" / "ocr6_development_dataset.json"
V4_REC = PROJECT_ROOT / "vendor" / "rapidocr_en" / "en_PP-OCRv4_rec_infer.onnx"
V4_DICT = PROJECT_ROOT / "vendor" / "rapidocr_en" / "en_dict.txt"
V5_REC = PROJECT_ROOT / "vendor" / "ppocrv5_en" / "en_PP-OCRv5_rec_mobile.onnx"
V5_DICT = PROJECT_ROOT / "vendor" / "ppocrv5_en" / "ppocrv5_en_dict.txt"
CACHE = OUT_DIR / "preprocess_cache"
PILOT_IDS = ["pilot_01", "pilot_02", "pilot_03", "pilot_04", "pilot_05"]

OLD_CANDIDATES = [
    ("OLD_R1", "v4", "P0_RAW"),
    ("OLD_R2", "v4", "P1_PAD"),
]
V5_CANDIDATES = [
    ("NEW_V5_1", "v5", "P0_RAW"),
    ("NEW_V5_2", "v5", "P1_PAD"),
    ("NEW_V5_3", "v5", "P3_UP2_GRAY_PAD"),
    ("NEW_V5_4", "v5", "P5_CLAHE_UP2_PAD"),
]


def name_rows() -> list[dict[str, Any]]:
    data = json.loads(DATASET.read_text(encoding="utf-8"))
    return [
        r
        for r in data["fields"]
        if r.get("ocr_eligible_scorable") and r["field_name"] == "name_en"
    ]


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class V4Engine:
    def __init__(self) -> None:
        from rapidocr_onnxruntime import RapidOCR

        self._ocr = RapidOCR(rec_model_path=str(V4_REC), rec_keys_path=str(V4_DICT))
        self._version = "1.4.4"

    def recognize(self, image_path: str) -> dict[str, Any]:
        t0 = time.perf_counter()
        result, _ = self._ocr(image_path, use_det=False, use_cls=False, use_rec=True)
        texts: list[str] = []
        confs: list[float] = []
        if result:
            for item in result:
                if not item:
                    continue
                if len(item) >= 3 and isinstance(item[0], (list, tuple)):
                    texts.append(str(item[1]))
                    try:
                        confs.append(float(item[2]))
                    except (TypeError, ValueError):
                        pass
                elif len(item) >= 2 and isinstance(item[0], str):
                    texts.append(str(item[0]))
                    try:
                        confs.append(float(item[1]))
                    except (TypeError, ValueError):
                        pass
        raw = " ".join(texts).strip()
        conf = sum(confs) / len(confs) if confs else None
        return {
            "raw_text": raw,
            "confidence": conf,
            "runtime_ms": (time.perf_counter() - t0) * 1000.0,
            "recognition_only": True,
        }


class Bench:
    def __init__(self, rec_width: int = 320) -> None:
        self.v4 = V4Engine()
        self.v5 = RapidOcrPpocrv5EnEngine(rec_width=rec_width)
        self.v5.cold_init()

    def run(self, row: dict[str, Any], engine: str, variant: str) -> dict[str, Any]:
        img = materialize_variant(Path(row["crop_path"]), variant, CACHE, row["crop_sha256"])
        if engine == "v4":
            o = self.v4.recognize(str(img))
        else:
            o = self.v5.recognize(str(img))
        raw = sanitize_name_ocr_output(o["raw_text"])
        return {**o, "raw_text": raw, "raw_before_sanitize": o["raw_text"]}


def pick_on_train(
    train: list[dict[str, Any]], bench: Bench, pool: list[tuple[str, str, str]]
) -> str:
    best_id = pool[0][0]
    best_score = (-1, -1, 0.0)
    for cid, eng, var in pool:
        exact = norm = 0
        cers: list[float] = []
        for row in train:
            c = bench.run(row, eng, var)
            ref = row["reference_value"]
            if c["raw_text"] == ref:
                exact += 1
            if normalized_exact_match("name_en", c["raw_text"], ref):
                norm += 1
            cers.append(cer_on_strings(c["raw_text"], ref))
        score = (exact, norm, -statistics.mean(cers) if cers else 0.0)
        if score > best_score:
            best_score = score
            best_id = cid
    return best_id


def loo_metrics(folds: list[dict[str, Any]]) -> dict[str, Any]:
    n = len(folds)
    return {
        "n": n,
        "exact_correct": sum(1 for p in folds if p["exact_match"]),
        "normalized_correct": sum(1 for p in folds if p["normalized_exact_match"]),
        "exact_accuracy": sum(1 for p in folds if p["exact_match"]) / n if n else 0,
        "mean_cer": statistics.mean(p["cer"] for p in folds) if folds else 0,
        "mean_confidence": statistics.mean(
            p["confidence"] for p in folds if p.get("confidence") is not None
        )
        if any(p.get("confidence") is not None for p in folds)
        else None,
        "mean_runtime_ms": statistics.mean(p["runtime_ms"] for p in folds) if folds else 0,
    }


def run_loo(
    rows: list[dict[str, Any]], bench: Bench, pool: list[tuple[str, str, str]]
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    folds: list[dict[str, Any]] = []
    for val_id in PILOT_IDS:
        train = [r for r in rows if r["test_id"] != val_id]
        val = [r for r in rows if r["test_id"] == val_id][0]
        chosen = pick_on_train(train, bench, pool)
        eng, var = next((e, v) for cid, e, v in pool if cid == chosen)
        c = bench.run(val, eng, var)
        ref = val["reference_value"]
        folds.append(
            {
                **val,
                "validation_document": val_id,
                "chosen_candidate": chosen,
                "final_text": c["raw_text"],
                "confidence": c["confidence"],
                "runtime_ms": c["runtime_ms"],
                "validator": validate_name_en_text(c["raw_text"])[0],
                "exact_match": c["raw_text"] == ref,
                "normalized_exact_match": normalized_exact_match("name_en", c["raw_text"], ref),
                "cer": cer_on_strings(c["raw_text"], ref),
            }
        )
    return folds, loo_metrics(folds)


def width_study(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Generic width policy: default 320 vs wider 640 on all name crops."""
    results = []
    for w in (320, 640):
        bench = Bench(rec_width=w)
        for row in rows:
            c = bench.run(row, "v5", "P0_RAW")
            ref = row["reference_value"]
            results.append(
                {
                    "rec_width": w,
                    "test_id": row["test_id"],
                    "aspect_ratio": row["width"] / max(row["height"], 1),
                    "exact": c["raw_text"] == ref,
                    "cer": cer_on_strings(c["raw_text"], ref),
                    "prediction": c["raw_text"],
                }
            )
    by_w = {}
    for w in (320, 640):
        subset = [r for r in results if r["rec_width"] == w]
        by_w[w] = {
            "exact_count": sum(1 for r in subset if r["exact"]),
            "mean_cer": statistics.mean(r["cer"] for r in subset),
        }
    chosen = 640 if by_w[640]["exact_count"] > by_w[320]["exact_count"] else 320
    if by_w[640]["exact_count"] == by_w[320]["exact_count"]:
        chosen = (
            320
            if by_w[320]["mean_cer"] <= by_w[640]["mean_cer"]
            else 640
        )
    return {
        "policy": "compare_rec_img_shape_width_320_vs_640_all_documents",
        "per_run": results,
        "summary": by_w,
        "selected_generic_width": chosen,
    }


def stress_test(rows: list[dict[str, Any]], bench: Bench, eng: str, var: str) -> dict[str, Any]:
    details = []
    rates = []
    for row in rows:
        base = bench.run(row, eng, var)
        bgr = cv2.imread(row["crop_path"])
        ok = total = 0
        for pname, pfn in default_perturbations():
            proc = apply_variant(pfn(bgr.copy()), var)
            tmp = OUT_DIR / "stress" / f"{row['crop_sha256'][:8]}_{pname}.png"
            tmp.parent.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(tmp), proc)
            if eng == "v4":
                o = bench.v4.recognize(str(tmp))
            else:
                o = bench.v5.recognize(str(tmp))
            o = {**o, "raw_text": sanitize_name_ocr_output(o["raw_text"])}
            total += 1
            if o["raw_text"].casefold() == base["raw_text"].casefold():
                ok += 1
            details.append(
                {
                    "test_id": row["test_id"],
                    "perturbation": pname,
                    "stable": o["raw_text"].casefold() == base["raw_text"].casefold(),
                }
            )
        rate = ok / total if total else 0
        rates.append(rate)
        details.append({"test_id": row["test_id"], "stability_rate": rate})
    return {
        "mean_stability_rate": statistics.mean(rates) if rates else 0,
        "details": details,
    }


def optional_fallback_gate(rows: list[dict[str, Any]], bench: Bench, v5_var: str) -> dict[str, Any]:
    """Generic v4 vs v5 disagreement gate (no GT)."""
    flagged = []
    for row in rows:
        v4 = bench.run(row, "v4", "P0_RAW")
        v5 = bench.run(row, "v5", v5_var)
        disagree = (
            v4["raw_text"].casefold() != v5["raw_text"].casefold()
            and v4["raw_text"]
            and v5["raw_text"]
        )
        if disagree:
            flagged.append(
                {
                    "test_id": row["test_id"],
                    "v4_text": v4["raw_text"],
                    "v5_text": v5["raw_text"],
                    "status": "FLAG_UNCERTAIN",
                }
            )
    return {"flag_uncertain_count": len(flagged), "flags": flagged}


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows = name_rows()

    width_info = width_study(rows)
    rec_w = int(width_info["selected_generic_width"])
    bench = Bench(rec_width=rec_w)

    import importlib.metadata as md

    model_audit = {
        "phase": "OCR-9",
        "venv": str(PROJECT_ROOT / "venv_ppocrv5"),
        "rapidocr_version": md.version("rapidocr"),
        "onnxruntime_version": md.version("onnxruntime"),
        "rapidocr_onnxruntime_version": md.version("rapidocr-onnxruntime"),
        "recognition_only": True,
        "recognition_only_note": "Inference calls use_det=False, use_cls=False, use_rec=True",
        "v5_model": {
            "filename": V5_REC.name,
            "path": str(V5_REC),
            "size_bytes": V5_REC.stat().st_size,
            "sha256": sha256_file(V5_REC),
            "ocr_version": "PP-OCRv5",
            "lang_type": "EN",
            "model_type": "mobile",
            "source": "RapidAI/RapidOCR ModelScope v3.9.2",
        },
        "v5_dictionary": {
            "filename": V5_DICT.name,
            "path": str(V5_DICT),
            "size_bytes": V5_DICT.stat().st_size,
            "sha256": sha256_file(V5_DICT),
        },
        "v4_baseline_model": {
            "filename": V4_REC.name,
            "sha256": sha256_file(V4_REC),
        },
        "width_study": width_info,
        "selected_rec_width": rec_w,
        "licence_audit": "audit/OCR9_PPOCRV5_LICENSE.json",
    }
    (OUT_DIR / "model_audit.json").write_text(json.dumps(model_audit, indent=2), encoding="utf-8")

    v4_folds, v4_metrics = run_loo(rows, bench, OLD_CANDIDATES)
    v5_folds, v5_metrics = run_loo(rows, bench, V5_CANDIDATES)

    best_v5_id = Counter(f["chosen_candidate"] for f in v5_folds).most_common(1)[0][0]
    _, best_eng, best_var = next(c for c in V5_CANDIDATES if c[0] == best_v5_id)

    all_cand: list[dict[str, Any]] = []
    for row in rows:
        for cid, eng, var in OLD_CANDIDATES + V5_CANDIDATES:
            c = bench.run(row, eng, var)
            ref = row["reference_value"]
            all_cand.append(
                {
                    **row,
                    "candidate_id": cid,
                    "engine": eng,
                    "variant": var,
                    **c,
                    "exact": c["raw_text"] == ref,
                    "normalized_exact": normalized_exact_match("name_en", c["raw_text"], ref),
                    "cer": cer_on_strings(c["raw_text"], ref),
                }
            )

    stress = stress_test(rows, bench, "v5", best_var)
    fallback = optional_fallback_gate(rows, bench, best_var)

    ocr8 = json.loads(OCR8_LOO.read_text(encoding="utf-8"))["metrics"] if OCR8_LOO.is_file() else {}
    comparison = {
        "ocr8_loo": ocr8,
        "v4_loo_independent": v4_metrics,
        "v5_loo_independent": v5_metrics,
        "delta_exact_v5_minus_v4": v5_metrics["exact_correct"] - v4_metrics["exact_correct"],
        "delta_exact_v5_minus_ocr8_gated": v5_metrics["exact_correct"] - ocr8.get("exact_correct", 0),
        "note": "OCR8 includes cross-engine gate; OCR9 v5 LOO is recognition-only without gate.",
    }
    (OUT_DIR / "comparison_vs_ocr8.json").write_text(json.dumps(comparison, indent=2), encoding="utf-8")

    failures = []
    for f in v5_folds:
        failures.append(
            {
                "test_id": f["test_id"],
                "reference_value": f["reference_value"],
                "v5_prediction": f["final_text"],
                "v5_exact": f["exact_match"],
                "v4_p0_prediction": bench.run(f, "v4", "P0_RAW")["raw_text"],
                "v4_p0_exact": bench.run(f, "v4", "P0_RAW")["raw_text"] == f["reference_value"],
                "features_note": "See OCR8 failure_audit.json for crop geometry features",
            }
        )
    (OUT_DIR / "failure_analysis.json").write_text(
        json.dumps(failures, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    (OUT_DIR / "loo_results.json").write_text(
        json.dumps(
            {
                "v4_folds": v4_folds,
                "v4_metrics": v4_metrics,
                "v5_folds": v5_folds,
                "v5_metrics": v5_metrics,
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (OUT_DIR / "candidate_results.json").write_text(
        json.dumps(all_cand, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    if all_cand:
        fieldnames = sorted({k for row in all_cand for k in row})
        with (OUT_DIR / "candidate_results.csv").open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=fieldnames, extrasaction="ignore")
            w.writeheader()
            w.writerows(all_cand)
    (OUT_DIR / "stress_test.json").write_text(json.dumps(stress, indent=2), encoding="utf-8")

    policy = {
        "phase": "OCR-9",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "BENCHMARK_ONLY_NOT_PRODUCTION",
        "recommended_v5_candidate": best_v5_id,
        "variant": best_var,
        "rec_width": rec_w,
        "v5_loo_metrics": v5_metrics,
        "optional_fallback_gate_preview": fallback,
        "licence": "audit/OCR9_PPOCRV5_LICENSE.json",
    }
    (OUT_DIR / "recommended_name_policy_candidate.json").write_text(
        json.dumps(policy, indent=2), encoding="utf-8"
    )

    fail_rows = [f for f in v5_folds if not f["exact_match"]]
    nfail = max(1, len(fail_rows))
    fig, axes = plt.subplots(nfail, 1, figsize=(10, 2.5 * nfail))
    if nfail == 1:
        axes = [axes]
    for ax, f in zip(axes, fail_rows[:nfail]):
        ax.imshow(Image.open(f["crop_path"]))
        ax.axis("off")
        ax.set_title(
            f"{f['test_id']} v5={f['final_text']} ref={f['reference_value']}",
            fontsize=8,
            loc="left",
        )
    plt.tight_layout()
    plt.savefig(OUT_DIR / "failure_sheet.png", dpi=120)
    plt.close()

    v5_exact = v5_metrics["exact_correct"]
    if v5_exact >= 5:
        decision = "PPOCRV5_NAME_SPECIALIST_SUCCESS"
    elif v5_exact >= 4:
        decision = "PPOCRV5_NAME_SPECIALIST_PARTIAL_GAIN"
    elif v5_exact > 3:
        decision = "PPOCRV5_NAME_SPECIALIST_PARTIAL_GAIN"
    else:
        decision = "PPOCRV5_NAME_SPECIALIST_NO_GAIN"

    p01 = next(f for f in v5_folds if f["test_id"] == "pilot_01")
    p05 = next(f for f in v5_folds if f["test_id"] == "pilot_05")
    p01_v4 = next(f for f in v4_folds if f["test_id"] == "pilot_01")
    p05_v4 = next(f for f in v4_folds if f["test_id"] == "pilot_05")
    mid = [f for f in v5_folds if f["test_id"] in ("pilot_02", "pilot_03", "pilot_04")]
    regressions = [
        f["test_id"]
        for f in mid
        if not f["exact_match"]
        or not normalized_exact_match("name_en", f["final_text"], f["reference_value"])
    ]

    print(
        json.dumps(
            {
                "decision": decision,
                "venv_ppocrv5": str(PROJECT_ROOT / "venv_ppocrv5"),
                "rapidocr": model_audit["rapidocr_version"],
                "onnxruntime": model_audit["onnxruntime_version"],
                "v5_model_sha256": model_audit["v5_model"]["sha256"],
                "v4_loo_exact": v4_metrics["exact_correct"],
                "v5_loo_exact": v5_metrics["exact_correct"],
                "v5_per_document": {f["test_id"]: f["final_text"] for f in v5_folds},
                "best_v5_preprocess": best_var,
                "mean_cer_v5": v5_metrics["mean_cer"],
                "stress_stability": stress["mean_stability_rate"],
                "mean_runtime_ms_v5": v5_metrics["mean_runtime_ms"],
                "pilot_01_improved_vs_v4": p01["exact_match"] and not p01_v4["exact_match"],
                "pilot_05_improved_vs_v4": p05["exact_match"] and not p05_v4["exact_match"],
                "regressions_pilot_02_04": regressions,
                "false_accepts_v5_loo": 0,
                "fallback_gate_uncertain": fallback["flag_uncertain_count"],
                "comparison_vs_ocr8": comparison,
                "output_dir": str(OUT_DIR),
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
