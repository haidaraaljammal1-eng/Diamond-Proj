#!/usr/bin/env python3
"""OCR-7: DATE fallback + NAME_EN multi-candidate policy with LOO-CV."""

from __future__ import annotations

import csv
import json
import re
import statistics
import sys
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import re

import cv2
import matplotlib.pyplot as plt
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.dynamic.routing import FIELD_GROUP
from src.engines.rapidocr_english import RapidOcrEnglishEngine
from src.engines.tesseract_english import TesseractEnglishEngine
from src.inference.confidence_calib import calibrate_from_train_samples, CalibratedThresholds
from src.inference.date_fallback import DateCandidate, select_date_output
from src.inference.name_selection import (
    NameCandidate,
    NamePolicyParams,
    select_name_output,
    tune_name_params_on_train,
)
from src.preprocess.english_variants import apply_variant, materialize_variant
from src.scoring.normalize import cer_on_strings, normalize_for_field, normalized_exact_match
from src.validators.date_strict import validate_date_text
from src.validators.name_en_strict import validate_name_en_text

OUT_DIR = PROJECT_ROOT / "results" / "OCR7_DYNAMIC_FALLBACK"
OCR6_DIR = PROJECT_ROOT / "results" / "OCR6_DYNAMIC_CV"
DATASET_PATH = PROJECT_ROOT / "pilot_subset" / "benchmark" / "ocr6_development_dataset.json"
OCR6_CONFIG = OCR6_DIR / "best_dynamic_config.json"
CACHE_DIR = OUT_DIR / "preprocess_cache"
WL_DATE = "0123456789/"
PILOT_IDS = ["pilot_01", "pilot_02", "pilot_03", "pilot_04", "pilot_05"]
STABLE_GROUPS = frozenset({"LICENSE_NUMBER", "NATIONALITY", "PLACE_OF_ISSUE"})
DATE_FIELDS = frozenset({"date_of_birth", "issue_date", "expiry_date"})


class Runner:
    def __init__(self) -> None:
        self.tess = TesseractEnglishEngine()
        self.rapid = RapidOcrEnglishEngine()
        self.tess.cold_init()
        self.rapid.cold_init()
        self._cache: dict[str, dict[str, Any]] = {}

    def ocr(
        self,
        image_path: str,
        engine: str,
        variant: str,
        psm: Optional[int] = None,
        whitelist: Optional[str] = None,
    ) -> dict[str, Any]:
        key = f"{image_path}|{engine}|{variant}|{psm}|{whitelist}"
        if key in self._cache:
            return self._cache[key]
        if engine == "tesseract":
            out = self.tess.recognize_with_config(image_path, psm or 7, whitelist)
        else:
            out = self.rapid.recognize(image_path, "name_en")
        self._cache[key] = out
        return out


def load_rows() -> list[dict[str, Any]]:
    data = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    return [r for r in data["fields"] if r.get("ocr_eligible_scorable")]


def stable_policy(group: str) -> dict[str, Any]:
    cfg = json.loads(OCR6_CONFIG.read_text(encoding="utf-8"))["groups"][group]["policy"]
    return cfg


def run_stable(row: dict[str, Any], runner: Runner) -> dict[str, Any]:
    g = FIELD_GROUP[row["field_name"]]
    pol = stable_policy(g)
    img = materialize_variant(
        Path(row["crop_path"]),
        pol["fixed_variant"],
        CACHE_DIR,
        row["crop_sha256"],
    )
    ocr = runner.ocr(
        str(img),
        pol["engine"],
        pol["fixed_variant"],
        pol.get("psm"),
        pol.get("whitelist"),
    )
    raw = ocr["raw_text"]
    if row["field_name"] == "license_number":
        raw = re.sub(r"[^0-9A-Za-z]", "", raw).upper()
    return {
        **row,
        "field_group": g,
        "final_text": raw,
        "status": "ACCEPTED",
        "decision": "frozen_ocr6_policy",
        "path": "stable",
    }


def name_stability(runner: Runner, row: dict[str, Any], variant: str, reference_text: str) -> float:
    bgr = cv2.imread(row["crop_path"])
    if bgr is None:
        return 0.0
    base_img = materialize_variant(
        Path(row["crop_path"]), variant, CACHE_DIR, row["crop_sha256"]
    )
    base = runner.ocr(str(base_img), "rapidocr_en", variant)
    base_fold = normalize_for_field("name_en", base["raw_text"]).casefold()
    ok = 0
    total = 0
    for fn, delta in (
        ("bright", lambda im: cv2.convertScaleAbs(im, alpha=1.1, beta=0)),
        ("dark", lambda im: cv2.convertScaleAbs(im, alpha=0.9, beta=0)),
        ("blur", lambda im: cv2.GaussianBlur(im, (3, 3), 0.8)),
    ):
        pert = fn
        im = delta(bgr.copy())
        proc = apply_variant(im, variant)
        tmp = CACHE_DIR / f"stab_{row['crop_sha256'][:10]}_{pert}.png"
        cv2.imwrite(str(tmp), proc)
        ocr = runner.ocr(str(tmp), "rapidocr_en", variant)
        total += 1
        if normalize_for_field("name_en", ocr["raw_text"]).casefold() == base_fold:
            ok += 1
    return ok / total if total else 0.0


def build_name_candidates(row: dict[str, Any], runner: Runner) -> list[NameCandidate]:
    specs = [
        ("R1", "rapidocr_en", "P0_RAW", None, None),
        ("R2", "rapidocr_en", "P1_PAD", None, None),
        ("R3", "rapidocr_en", "P3_UP2_GRAY_PAD", None, None),
        ("R4", "rapidocr_en", "P5_CLAHE_UP2_PAD", None, None),
        ("T1", "tesseract", "P0_RAW", 7, None),
        ("T2", "tesseract", "P1_PAD", 13, None),
    ]
    out: list[NameCandidate] = []
    for cid, eng, var, psm, wl in specs:
        img = materialize_variant(Path(row["crop_path"]), var, CACHE_DIR, row["crop_sha256"])
        ocr = runner.ocr(str(img), eng, var, psm, wl)
        stab = name_stability(runner, row, var, ocr["raw_text"]) if eng == "rapidocr_en" else 0.5
        out.append(
            NameCandidate(
                cid, eng, var, ocr["raw_text"], ocr.get("confidence"), stab
            )
        )
    return out


def build_date_primary_and_fallbacks(
    row: dict[str, Any], runner: Runner
) -> tuple[DateCandidate, list[DateCandidate]]:
    img0 = materialize_variant(
        Path(row["crop_path"]), "P0_RAW", CACHE_DIR, row["crop_sha256"]
    )
    p = runner.ocr(str(img0), "rapidocr_en", "P0_RAW")
    primary = DateCandidate("date_primary", "rapidocr_en", "P0_RAW", p["raw_text"], p.get("confidence"), "", "")
    fallbacks = []
    for cid, eng, var, psm, wl in (
        ("date_fb_A", "tesseract", "P0_RAW", 7, WL_DATE),
        ("date_fb_B", "tesseract", "P0_RAW", 13, WL_DATE),
        ("date_fb_C", "rapidocr_en", "P1_PAD", None, None),
        ("date_fb_D", "rapidocr_en", "P3_UP2_GRAY_PAD", None, None),
    ):
        img = materialize_variant(Path(row["crop_path"]), var, CACHE_DIR, row["crop_sha256"])
        ocr = runner.ocr(str(img), eng, var, psm, wl)
        fallbacks.append(
            DateCandidate(cid, eng, var, ocr["raw_text"], ocr.get("confidence"), "", "")
        )
    return primary, fallbacks


def score_row(pred: dict[str, Any]) -> dict[str, Any]:
    ref = pred["reference_value"]
    raw = pred.get("final_text", "")
    accepted = pred.get("status") == "ACCEPTED"
    exact = raw == ref if accepted else False
    norm = (
        normalized_exact_match(pred["field_name"], raw, ref) if accepted else False
    )
    return {
        **pred,
        "exact_match": exact,
        "normalized_exact_match": norm,
        "cer_whitespace_trimmed": cer_on_strings(raw, ref) if accepted else 1.0,
        "accepted": accepted,
    }


def metrics(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {"n": 0}
    n = len(rows)
    accepted = [r for r in rows if r.get("accepted")]
    uncertain = [r for r in rows if r.get("status") == "FLAG_UNCERTAIN"]
    return {
        "n": n,
        "exact_correct": sum(1 for r in rows if r.get("exact_match")),
        "normalized_correct": sum(1 for r in rows if r.get("normalized_exact_match")),
        "exact_accuracy": sum(1 for r in rows if r.get("exact_match")) / n,
        "normalized_accuracy": sum(1 for r in rows if r.get("normalized_exact_match")) / n,
        "mean_cer": statistics.mean(r.get("cer_whitespace_trimmed", 1) for r in rows),
        "coverage": len(accepted) / n,
        "accepted_accuracy": (
            sum(1 for r in accepted if r.get("normalized_exact_match")) / len(accepted)
            if accepted
            else 0.0
        ),
        "false_accepts": sum(
            1
            for r in accepted
            if not r.get("normalized_exact_match")
        ),
        "flag_uncertain_count": len(uncertain),
        "flag_uncertain_correctable": sum(
            1
            for r in uncertain
            if any(
                normalized_exact_match(r["field_name"], c.get("raw_text", ""), r["reference_value"])
                for c in (r.get("name_selection") or {}).get("candidates", [])
            )
            or (
                r["field_name"] in DATE_FIELDS
                and any(
                    validate_date_text(x.get("raw_text", ""))[0] == "ACCEPT"
                    and normalized_exact_match(
                        r["field_name"], x.get("raw_text", ""), r["reference_value"]
                    )
                    for x in [r.get("date_primary", {})] + r.get("date_fallbacks", [])
                )
            )
        ),
    }


def audit_rules() -> dict[str, Any]:
    pat = re.compile(r"pilot_0[1-5]")
    hits = []
    for root in (PROJECT_ROOT / "src" / "inference", PROJECT_ROOT / "src" / "dynamic"):
        for path in root.rglob("*.py"):
            for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                if pat.search(line) and not line.strip().startswith("#"):
                    hits.append({"file": str(path), "line": i, "text": line.strip()})
    return {"DOCUMENT_SPECIFIC_RULES_FOUND": len(hits), "hits": hits}


def render_failures(failures: list[dict], path: Path) -> None:
    if not failures:
        fig, ax = plt.subplots(figsize=(6, 2))
        ax.text(0.5, 0.5, "No failures", ha="center")
        ax.axis("off")
        fig.savefig(path, dpi=120, bbox_inches="tight")
        plt.close(fig)
        return
    n = min(10, len(failures))
    fig, axes = plt.subplots(n, 1, figsize=(10, 2 * n))
    if n == 1:
        axes = [axes]
    for ax, f in zip(axes, failures[:n]):
        ax.imshow(Image.open(f["crop_path"]))
        ax.axis("off")
        ax.set_title(
            f"{f['test_id']}/{f['field_name']} st={f.get('status')} pred={f.get('final_text')} ref={f.get('reference_value')}",
            fontsize=7,
            loc="left",
        )
    fig.tight_layout()
    fig.savefig(path, dpi=120, bbox_inches="tight")
    plt.close(fig)


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows = load_rows()
    runner = Runner()
    all_candidates: list[dict[str, Any]] = []
    fold_out = []
    calib_per_fold = []
    name_analysis = []
    date_analysis = []

    for val_id in PILOT_IDS:
        train_ids = [p for p in PILOT_IDS if p != val_id]
        train_rows = [r for r in rows if r["test_id"] in train_ids]
        val_rows = [r for r in rows if r["test_id"] == val_id]

        calib_samples = []
        train_name_packs = []

        for row in train_rows:
            if row["field_name"] == "name_en":
                cands = build_name_candidates(row, runner)
                for c in cands:
                    calib_samples.append(
                        {
                            "engine": c.engine,
                            "confidence": c.confidence,
                            "train_correct": normalized_exact_match(
                                "name_en", c.raw_text, row["reference_value"]
                            ),
                        }
                    )
                train_name_packs.append(
                    {"reference_value": row["reference_value"], "candidates": cands}
                )
            elif row["field_name"] in DATE_FIELDS:
                prim, fbs = build_date_primary_and_fallbacks(row, runner)
                for c in [prim] + fbs:
                    calib_samples.append(
                        {
                            "engine": c.engine,
                            "confidence": c.confidence,
                            "train_correct": normalized_exact_match(
                                row["field_name"], c.raw_text, row["reference_value"]
                            ),
                        }
                    )

        calib = calibrate_from_train_samples(calib_samples)
        name_params = tune_name_params_on_train(train_name_packs, calib)
        calib_per_fold.append(
            {"validation_document": val_id, "calibration": calib.to_dict(), "name_params": name_params.to_dict()}
        )

        val_preds = []
        for row in val_rows:
            g = FIELD_GROUP[row["field_name"]]
            if g in STABLE_GROUPS:
                pred = run_stable(row, runner)
            elif row["field_name"] in DATE_FIELDS:
                prim, fbs = build_date_primary_and_fallbacks(row, runner)
                sel = select_date_output(prim, fbs, calib)
                pred = {
                    **row,
                    "field_group": "DATES",
                    "final_text": sel["final_text"],
                    "status": sel["status"],
                    "decision": sel["decision"],
                    "path": "date_fallback",
                    "date_primary": asdict(prim),
                    "date_fallbacks": [asdict(x) for x in fbs],
                }
                date_analysis.append({**pred, "validation_document": val_id})
            elif row["field_name"] == "name_en":
                cands = build_name_candidates(row, runner)
                sel = select_name_output(cands, calib, name_params)
                pred = {
                    **row,
                    "field_group": "NAME_EN",
                    "final_text": sel["final_text"],
                    "status": sel["status"],
                    "decision": sel["decision"],
                    "path": "name_multi",
                    "name_selection": sel,
                }
                name_analysis.append({**pred, "validation_document": val_id})
                for c in sel.get("candidates", []):
                    all_candidates.append({**row, **c, "validation_document": val_id})
            else:
                pred = run_stable(row, runner)
            val_preds.append(score_row(pred))

        fold_out.append(
            {
                "validation_document": val_id,
                "train_documents": train_ids,
                "validation_predictions": val_preds,
                "metrics": metrics(val_preds),
            }
        )

    all_val = []
    for f in fold_out:
        all_val.extend(f["validation_predictions"])

    stable_preds = [p for p in all_val if p.get("field_group") in STABLE_GROUPS]
    stable_reg = {
        "n": len(stable_preds),
        "exact_correct": sum(1 for p in stable_preds if p["exact_match"]),
        "regression": sum(1 for p in stable_preds if not p["exact_match"]),
    }

    ocr6 = {}
    ocr6_path = OCR6_DIR / "cross_validation_summary.json"
    if ocr6_path.is_file():
        ocr6 = json.loads(ocr6_path.read_text(encoding="utf-8")).get("cv_overall", {})

    m_all = metrics(all_val)
    m_name = metrics([p for p in all_val if p["field_name"] == "name_en"])
    m_date = metrics([p for p in all_val if p["field_name"] in DATE_FIELDS])

    failures = [p for p in all_val if p.get("accepted") and not p.get("normalized_exact_match")]
    failures += [p for p in all_val if p.get("status") == "FLAG_UNCERTAIN"]

    policy_doc = {
        "phase": "OCR-7",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "stable_policies": "frozen from OCR6 best_dynamic_config.json",
        "date_primary": "rapidocr_en P0_RAW",
        "date_fallback": ["tess_psm7_wl", "tess_psm13_wl", "rapid_P1_PAD", "rapid_P3_UP2"],
        "name_candidates": ["R1", "R2", "R3", "R4", "T1", "T2"],
        "calibration_per_fold": calib_per_fold,
        "median_name_params": name_params.to_dict(),
    }

    (OUT_DIR / "final_dynamic_policy.json").write_text(
        json.dumps(policy_doc, indent=2), encoding="utf-8"
    )
    (OUT_DIR / "loo_fold_results.json").write_text(
        json.dumps(fold_out, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    (OUT_DIR / "loo_summary.json").write_text(
        json.dumps(
            {
                "overall": m_all,
                "name_en": m_name,
                "dates": m_date,
                "stable_regression": stable_reg,
                "ocr6_comparison": {
                    "ocr6_exact_accuracy": ocr6.get("exact_accuracy"),
                    "ocr7_exact_accuracy": m_all.get("exact_accuracy"),
                    "ocr6_normalized_accuracy": ocr6.get("normalized_accuracy"),
                    "ocr7_normalized_accuracy": m_all.get("normalized_accuracy"),
                    "ocr6_mean_cer": ocr6.get("mean_cer"),
                    "ocr7_mean_cer": m_all.get("mean_cer"),
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    (OUT_DIR / "confidence_calibration.json").write_text(
        json.dumps(calib_per_fold, indent=2), encoding="utf-8"
    )
    (OUT_DIR / "name_candidate_analysis.json").write_text(
        json.dumps(name_analysis, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    (OUT_DIR / "date_fallback_analysis.json").write_text(
        json.dumps(date_analysis, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    (OUT_DIR / "coverage_accuracy_summary.json").write_text(
        json.dumps(
            {
                "overall": m_all,
                "name_en": m_name,
                "dates": m_date,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    (OUT_DIR / "all_candidate_results.json").write_text(
        json.dumps(all_candidates, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    if all_candidates:
        with (OUT_DIR / "all_candidate_results.csv").open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(all_candidates[0].keys()))
            w.writeheader()
            w.writerows(all_candidates)

    (OUT_DIR / "remaining_failures.json").write_text(
        json.dumps(failures, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    render_failures(
        [p for p in all_val if not p.get("normalized_exact_match")],
        OUT_DIR / "remaining_failures.png",
    )

    audit = audit_rules()
    improved = m_all.get("exact_accuracy", 0) > (ocr6.get("exact_accuracy") or 0)
    low_false = m_all.get("false_accepts", 99) <= 1
    if improved and low_false and stable_reg["regression"] == 0:
        decision = "OCR7_DYNAMIC_FALLBACK_SUCCESS"
    elif improved or m_all.get("accepted_accuracy", 0) > 0.95:
        decision = "OCR7_IMPROVED_BUT_MORE_WORK_NEEDED"
    else:
        decision = "OCR7_NO_GENERALIZABLE_GAIN"

    print(
        json.dumps(
            {
                "decision": decision,
                "overall": m_all,
                "name_en": m_name,
                "dates": m_date,
                "stable_regression": stable_reg,
                "audit": audit,
                "final_policy": str(OUT_DIR / "final_dynamic_policy.json"),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
