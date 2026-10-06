#!/usr/bin/env python3
"""OCR-6: Leave-one-document-out CV + dynamic English OCR routing."""

from __future__ import annotations

import csv
import hashlib
import json
import re
import statistics
import subprocess
import sys
from collections import Counter, defaultdict
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import cv2
import matplotlib.pyplot as plt
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.dynamic.features import CropFeatures, load_features
from src.dynamic.routing import (
    FIELD_GROUP,
    DynamicThresholds,
    EngineRoute,
    Policy,
    candidate_policies,
    choose_variant,
)
from src.preprocess.english_variants import apply_variant
from src.dynamic.stress import default_perturbations
from src.engines.rapidocr_english import RapidOcrEnglishEngine
from src.engines.tesseract_english import TesseractEnglishEngine
from src.preprocess.english_variants import materialize_variant
from src.scoring.normalize import (
    cer_on_strings,
    normalize_for_field,
    normalized_exact_match,
)
from src.validators.english_fields import validate_field

OUT_DIR = PROJECT_ROOT / "results" / "OCR6_DYNAMIC_CV"
DATASET_PATH = PROJECT_ROOT / "pilot_subset" / "benchmark" / "ocr6_development_dataset.json"
OCR5_CONFIG = PROJECT_ROOT / "config" / "ocr5_english_best.json"
OCR5_RESULTS = PROJECT_ROOT / "results" / "OCR5_ENGLISH_ONLY" / "per_engine_summary.json"
CACHE_DIR = OUT_DIR / "preprocess_cache"
PILOT_IDS = ["pilot_01", "pilot_02", "pilot_03", "pilot_04", "pilot_05"]
GROUPS = ("LICENSE_NUMBER", "DATES", "NAME_EN", "NATIONALITY", "PLACE_OF_ISSUE")


def ensure_dataset() -> dict[str, Any]:
    if not DATASET_PATH.is_file():
        subprocess.check_call(
            [sys.executable, str(PROJECT_ROOT / "scripts" / "build_ocr6_dataset.py")]
        )
    return json.loads(DATASET_PATH.read_text(encoding="utf-8"))


def scorable_rows(data: dict[str, Any]) -> list[dict[str, Any]]:
    return [r for r in data["fields"] if r.get("ocr_eligible_scorable")]


class OcrRunner:
    def __init__(self) -> None:
        self.tess = TesseractEnglishEngine()
        self.rapid = RapidOcrEnglishEngine()
        self.tess.cold_init()
        self.rapid.cold_init()
        self._cache: dict[str, dict[str, Any]] = {}

    def recognize(
        self,
        image_path: str,
        policy: Policy,
        variant: str,
    ) -> dict[str, Any]:
        key = f"{image_path}|{variant}|{policy.engine.engine}|{policy.engine.psm}|{policy.engine.whitelist}"
        if key in self._cache:
            return self._cache[key]
        if policy.engine.engine == "tesseract":
            ocr = self.tess.recognize_with_config(
                image_path,
                policy.engine.psm or 7,
                policy.engine.whitelist,
            )
        else:
            ocr = self.rapid.recognize(image_path, "field")
        self._cache[key] = ocr
        return ocr


def predict_row(
    row: dict[str, Any],
    policy: Policy,
    thresholds,
    runner: OcrRunner,
    features_by_path: dict[str, CropFeatures],
) -> dict[str, Any]:
    crop_path = Path(row["crop_path"])
    feats = features_by_path[str(crop_path)]
    group = FIELD_GROUP[row["field_name"]]
    variant = choose_variant(
        group,
        feats,
        policy.preprocess_mode,
        policy.fixed_variant,
        thresholds,
    )
    img = materialize_variant(crop_path, variant, CACHE_DIR, row["crop_sha256"])
    ocr = runner.recognize(str(img), policy, variant)
    ref = row["reference_value"]
    raw = ocr["raw_text"]
    return {
        **row,
        "field_group": group,
        "variant": variant,
        "policy_id": policy.policy_id,
        "raw_text": raw,
        "raw_confidence": ocr.get("confidence"),
        "runtime_ms": ocr["runtime_ms"],
        "validator": validate_field(row["field_name"], raw),
        "exact_match": raw == ref,
        "normalized_exact_match": normalized_exact_match(row["field_name"], raw, ref),
        "cer_whitespace_trimmed": cer_on_strings(raw, ref),
        "normalized_prediction": normalize_for_field(row["field_name"], raw),
    }


def score_predictions(preds: list[dict[str, Any]]) -> dict[str, Any]:
    if not preds:
        return {"n": 0}
    n = len(preds)
    return {
        "n": n,
        "exact_correct": sum(1 for p in preds if p["exact_match"]),
        "normalized_correct": sum(1 for p in preds if p["normalized_exact_match"]),
        "exact_accuracy": sum(1 for p in preds if p["exact_match"]) / n,
        "normalized_accuracy": sum(
            1 for p in preds if p["normalized_exact_match"]
        )
        / n,
        "mean_cer": statistics.mean(p["cer_whitespace_trimmed"] for p in preds),
    }


def audit_no_test_id_rules() -> dict[str, Any]:
    """OCR routing/preprocess code only (CV fold splits live in the runner script)."""
    hits = []
    pat = re.compile(r"pilot_0[1-5]")
    for path in (PROJECT_ROOT / "src" / "dynamic").rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        for i, line in enumerate(text.splitlines(), 1):
            if pat.search(line) and not line.strip().startswith("#"):
                hits.append({"file": str(path), "line": i, "text": line.strip()})
    return {
        "DOCUMENT_SPECIFIC_RULES_FOUND": len(hits),
        "hits": hits,
        "scope": "src/dynamic/*.py",
    }


def render_failures(failures: list[dict[str, Any]], path: Path) -> None:
    if not failures:
        fig, ax = plt.subplots(figsize=(6, 2))
        ax.text(0.5, 0.5, "No CV failures", ha="center")
        ax.axis("off")
        fig.savefig(path, dpi=120, bbox_inches="tight")
        plt.close(fig)
        return
    fig, axes = plt.subplots(min(len(failures), 10), 1, figsize=(10, 2.2 * min(len(failures), 10)))
    if min(len(failures), 10) == 1:
        axes = [axes]
    for ax, f in zip(axes, failures[:10]):
        ax.imshow(Image.open(f["crop_path"]))
        ax.axis("off")
        ax.set_title(
            f"{f['test_id']}/{f['field_name']} GT={f['reference_value']} OCR={f['raw_text']}",
            fontsize=7,
            loc="left",
        )
    fig.tight_layout()
    fig.savefig(path, dpi=120, bbox_inches="tight")
    plt.close(fig)


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    data = ensure_dataset()
    rows = scorable_rows(data)
    print(f"English-only scorable samples: {len(rows)}")

    features_by_path: dict[str, CropFeatures] = {}
    feature_dump = {}
    for r in rows:
        feats = load_features(r["crop_path"])
        features_by_path[r["crop_path"]] = feats
        feature_dump[r["crop_path"]] = feats.to_dict()

    (OUT_DIR / "dynamic_feature_analysis.json").write_text(
        json.dumps(feature_dump, indent=2), encoding="utf-8"
    )

    runner = OcrRunner()
    fold_results = []
    winners_by_group: dict[str, list[tuple[Policy, Any]]] = defaultdict(list)

    for val_id in PILOT_IDS:
        train_ids = [p for p in PILOT_IDS if p != val_id]
        fold = {"validation_document": val_id, "train_documents": train_ids, "groups": {}}
        for group in GROUPS:
            train_group = [
                r
                for r in rows
                if r["test_id"] in train_ids and FIELD_GROUP[r["field_name"]] == group
            ]
            val_group = [
                r
                for r in rows
                if r["test_id"] == val_id and FIELD_GROUP[r["field_name"]] == group
            ]
            best_score = (-1, 999.0)
            best_pair = None
            best_train_preds = []
            for policy, th in candidate_policies(group):
                preds = [
                    predict_row(r, policy, th, runner, features_by_path)
                    for r in train_group
                ]
                metrics = score_predictions(preds)
                score = (
                    metrics.get("normalized_correct", 0),
                    -metrics.get("mean_cer", 9),
                )
                if score > best_score:
                    best_score = score
                    best_pair = (policy, th)
                    best_train_preds = preds
            assert best_pair is not None
            policy, th = best_pair
            val_preds = [
                predict_row(r, policy, th, runner, features_by_path) for r in val_group
            ]
            winners_by_group[group].append((policy, th))
            fold["groups"][group] = {
                "selected_policy": policy.to_dict(),
                "thresholds": asdict(th),
                "train_metrics": score_predictions(best_train_preds),
                "validation_metrics": score_predictions(val_preds),
                "validation_predictions": val_preds,
            }
        fold_results.append(fold)

    all_val_preds: list[dict[str, Any]] = []
    for fold in fold_results:
        for group in GROUPS:
            all_val_preds.extend(fold["groups"][group]["validation_predictions"])

    cv_summary = score_predictions(all_val_preds)
    per_field: dict[str, Any] = {}
    for fname in sorted({r["field_name"] for r in all_val_preds}):
        sub = [p for p in all_val_preds if p["field_name"] == fname]
        per_field[fname] = score_predictions(sub)
    per_group = {g: score_predictions([p for p in all_val_preds if p["field_group"] == g]) for g in GROUPS}

    # Global dynamic config (majority policy + median thresholds per group)
    best_dynamic: dict[str, Any] = {}
    for group in GROUPS:
        policies = winners_by_group[group]
        pid = Counter(p[0].policy_id for p in policies).most_common(1)[0][0]
        pol = next(p[0] for p in policies if p[0].policy_id == pid)
        ths = [asdict(p[1]) for p in policies if p[0].policy_id == pid]
        med = {
            k: statistics.median(d[k] for d in ths)
            for k in ths[0]
            if isinstance(ths[0][k], (int, float))
        }
        best_dynamic[group] = {
            "policy": pol.to_dict(),
            "median_thresholds": med,
            "fold_wins": pid,
        }

    (OUT_DIR / "best_dynamic_config.json").write_text(
        json.dumps(
            {
                "phase": "OCR-6",
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "groups": best_dynamic,
                "ocr5_baseline_preserved_as_candidate": True,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    # OCR5 frozen on pilot_05
    ocr5_p05 = []
    ocr5 = json.loads(OCR5_CONFIG.read_text(encoding="utf-8"))["field_groups"]
    for r in rows:
        if r["test_id"] != "pilot_05":
            continue
        g = FIELD_GROUP[r["field_name"]]
        gkey = {
            "LICENSE_NUMBER": "LICENSE",
            "DATES": "DATES",
            "NAME_EN": "NAME_EN",
            "NATIONALITY": "NATIONALITY",
            "PLACE_OF_ISSUE": "PLACE_OF_ISSUE",
        }[g]
        cfg = ocr5[gkey]["config"]
        pol = Policy(
            "ocr5_frozen",
            g,
            EngineRoute(
                cfg["engine"],
                cfg.get("psm"),
                cfg.get("whitelist"),
                cfg.get("whitelist_label", "none"),
            ),
            "fixed",
            cfg.get("preprocessing", "P0_RAW"),
        )
        pred = predict_row(r, pol, DynamicThresholds(), runner, features_by_path)
        ocr5_p05.append(pred)

    # Stress test on CV-selected global config
    stress_rows = []
    perturbations = default_perturbations()
    for group in GROUPS:
        pol_dict = best_dynamic[group]["policy"]
        pol = Policy(
            pol_dict["policy_id"],
            group,
            EngineRoute(
                pol_dict["engine"],
                pol_dict.get("psm"),
                None,
                pol_dict.get("whitelist_label", "none"),
            ),
            pol_dict["preprocess_mode"],
            pol_dict.get("fixed_variant", "P0_RAW"),
        )
        th = DynamicThresholds(**{k: float(v) for k, v in best_dynamic[group]["median_thresholds"].items()})
        group_rows = [r for r in rows if FIELD_GROUP[r["field_name"]] == group]
        stable = 0
        total = 0
        for r in group_rows:
            base = predict_row(r, pol, th, runner, features_by_path)
            variant = base["variant"]
            bgr = cv2.imread(r["crop_path"])
            for pname, pfn in perturbations:
                pert = pfn(bgr.copy())
                processed = apply_variant(pert, variant)
                tmp = OUT_DIR / "stress_cache" / f"{r['crop_sha256'][:12]}_{pname}.png"
                tmp.parent.mkdir(parents=True, exist_ok=True)
                cv2.imwrite(str(tmp), processed)
                ocr = runner.recognize(str(tmp), pol, variant)
                ok = normalized_exact_match(r["field_name"], ocr["raw_text"], r["reference_value"])
                total += 1
                if ok:
                    stable += 1
                stress_rows.append(
                    {
                        "test_id": r["test_id"],
                        "field_name": r["field_name"],
                        "perturbation": pname,
                        "stable": ok,
                        "base_normalized_match": base["normalized_exact_match"],
                    }
                )
        best_dynamic[group]["robustness_stability_rate"] = stable / total if total else 0

    stress_summary = {
        "overall_stability_rate": (
            sum(1 for s in stress_rows if s["stable"]) / len(stress_rows) if stress_rows else 0
        ),
        "per_group": {g: best_dynamic[g].get("robustness_stability_rate") for g in GROUPS},
        "details": stress_rows,
    }

    # OCR5 regression on original 20-sample subset
    ocr5_prior_norm = None
    if OCR5_RESULTS.is_file():
        ocr5_prior_norm = json.loads(OCR5_RESULTS.read_text(encoding="utf-8"))["per_engine"].get(
            "ocr5_english_normalized_accuracy"
        )

    failures = [p for p in all_val_preds if not p["normalized_exact_match"]]
    audit = audit_no_test_id_rules()

    (OUT_DIR / "fold_results.json").write_text(
        json.dumps(fold_results, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    flat = []
    for fold in fold_results:
        for g in GROUPS:
            for p in fold["groups"][g]["validation_predictions"]:
                flat.append({**p, "validation_document": fold["validation_document"]})
    with (OUT_DIR / "fold_results.csv").open("w", newline="", encoding="utf-8") as f:
        if flat:
            w = csv.DictWriter(f, fieldnames=list(flat[0].keys()))
            w.writeheader()
            w.writerows(flat)

    (OUT_DIR / "cross_validation_summary.json").write_text(
        json.dumps(
            {
                "english_scorable_count": len(rows),
                "cv_overall": cv_summary,
                "per_field": per_field,
                "per_group": per_group,
                "ocr5_frozen_on_pilot_05": score_predictions(ocr5_p05),
                "ocr5_pilot_05_predictions": ocr5_p05,
                "ocr5_prior_normalized_accuracy": ocr5_prior_norm,
                "regression_vs_ocr5_on_4doc_baseline": "see per_engine_summary ocr4_vs_ocr5",
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (OUT_DIR / "stress_test_results.json").write_text(
        json.dumps(stress_summary, indent=2), encoding="utf-8"
    )
    (OUT_DIR / "remaining_failures.json").write_text(
        json.dumps(failures, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    render_failures(failures, OUT_DIR / "remaining_failures.png")

    targets_ok = (
        cv_summary.get("normalized_accuracy", 0) >= 0.95
        and per_group.get("DATES", {}).get("exact_accuracy", 0) >= 0.89
    )
    if targets_ok and audit["DOCUMENT_SPECIFIC_RULES_FOUND"] == 0:
        decision = "DYNAMIC_ENGLISH_OCR_GENERALIZATION_SUCCESS"
    elif cv_summary.get("normalized_accuracy", 0) >= ocr5_prior_norm or 0.9:
        decision = "DYNAMIC_ENGLISH_OCR_IMPROVED_BUT_MORE_WORK_NEEDED"
    else:
        decision = "OCR_ARCHITECTURE_RECONSIDERATION_REQUIRED"

    report = {
        "decision": decision,
        "english_scorable_count": len(rows),
        "cv_normalized_accuracy": cv_summary.get("normalized_accuracy"),
        "cv_exact_accuracy": cv_summary.get("exact_accuracy"),
        "cv_mean_cer": cv_summary.get("mean_cer"),
        "stress_stability": stress_summary["overall_stability_rate"],
        "DOCUMENT_SPECIFIC_RULES_FOUND": audit["DOCUMENT_SPECIFIC_RULES_FOUND"],
        "best_dynamic_config": str(OUT_DIR / "best_dynamic_config.json"),
        "remaining_failures": len(failures),
    }
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
