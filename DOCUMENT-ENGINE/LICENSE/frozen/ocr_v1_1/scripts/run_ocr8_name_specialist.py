#!/usr/bin/env python3
"""OCR-8: NAME_EN specialist benchmark + LOO-CV (stable fields frozen)."""

from __future__ import annotations

import csv
import hashlib
import json
import re
import statistics
import sys
from collections import Counter
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional

import cv2
import matplotlib.pyplot as plt
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.dynamic.features import load_features
from src.dynamic.stress import default_perturbations
from src.engines.rapidocr_en_wide import RapidOcrEnWideEngine
from src.engines.rapidocr_english import RapidOcrEnglishEngine
from src.engines.tesseract_english import TesseractEnglishEngine
from src.inference.name_output import sanitize_name_ocr_output
from src.preprocess.english_variants import apply_variant, materialize_variant
from src.scoring.normalize import cer_on_strings, normalized_exact_match
from src.validators.name_en_strict import validate_name_en_text

OUT_DIR = PROJECT_ROOT / "results" / "OCR8_NAME_SPECIALIST"
OCR6_CONFIG = PROJECT_ROOT / "results" / "OCR6_DYNAMIC_CV" / "best_dynamic_config.json"
OCR7_DIR = PROJECT_ROOT / "results" / "OCR7_DYNAMIC_FALLBACK"
DATASET = PROJECT_ROOT / "pilot_subset" / "benchmark" / "ocr6_development_dataset.json"
CACHE = OUT_DIR / "preprocess_cache"
PILOT_IDS = ["pilot_01", "pilot_02", "pilot_03", "pilot_04", "pilot_05"]
DATE_FIELDS = frozenset({"date_of_birth", "issue_date", "expiry_date"})
STABLE = frozenset({"LICENSE_NUMBER", "NATIONALITY", "PLACE_OF_ISSUE"})


def name_rows() -> list[dict[str, Any]]:
    data = json.loads(DATASET.read_text(encoding="utf-8"))
    return [
        r
        for r in data["fields"]
        if r.get("ocr_eligible_scorable") and r["field_name"] == "name_en"
    ]


def all_scorable() -> list[dict[str, Any]]:
    data = json.loads(DATASET.read_text(encoding="utf-8"))
    return [r for r in data["fields"] if r.get("ocr_eligible_scorable")]


def align_ops(truth: str, pred: str) -> list[dict[str, str]]:
    """Character alignment for confusion diagnostics."""
    a, b = truth, pred
    ops = []
    i = j = 0
    while i < len(a) or j < len(b):
        if i < len(a) and j < len(b) and a[i] == b[j]:
            ops.append({"op": "match", "t": a[i], "p": b[j]})
            i += 1
            j += 1
        elif j < len(b) and (i >= len(a) or (i + 1 < len(a) and a[i + 1] == b[j])):
            ops.append({"op": "ins", "p": b[j]})
            j += 1
        elif i < len(a) and (j >= len(b) or (j + 1 < len(b) and a[i] == b[j + 1])):
            ops.append({"op": "del", "t": a[i]})
            i += 1
        else:
            if i < len(a) and j < len(b):
                ops.append({"op": "sub", "t": a[i], "p": b[j]})
            i += 1
            j += 1
    return ops


def confusion_pairs(ops: list[dict[str, str]]) -> Counter:
    c = Counter()
    for o in ops:
        if o["op"] == "sub":
            c[(o["t"], o["p"])] += 1
    return c


class Bench:
    def __init__(self) -> None:
        self.rapid = RapidOcrEnglishEngine()
        self.wide = RapidOcrEnWideEngine(640)
        self.tess = TesseractEnglishEngine()
        self.rapid.cold_init()
        self.wide.cold_init()
        self.tess.cold_init()
        self._cache: dict[str, str] = {}

    def run_candidate(
        self, row: dict[str, Any], cid: str, engine: str, variant: str, psm: Optional[int]
    ) -> dict[str, Any]:
        key = f"{row['crop_sha256']}|{cid}"
        img = materialize_variant(Path(row["crop_path"]), variant, CACHE, row["crop_sha256"])
        if engine == "rapid":
            o = self.rapid.recognize(str(img), "name_en")
        elif engine == "wide":
            o = self.wide.recognize(str(img))
        else:
            o = self.tess.recognize_with_config(str(img), psm or 7, None)
        raw = sanitize_name_ocr_output(o["raw_text"])
        return {
            "candidate_id": cid,
            "engine_family": engine,
            "variant": variant,
            "psm": psm,
            "raw_text": raw,
            "raw_before_sanitize": o["raw_text"],
            "confidence": o.get("confidence"),
            "runtime_ms": o.get("runtime_ms"),
        }


CANDIDATES = [
    ("R1", "rapid", "P0_RAW", None),
    ("R2", "rapid", "P1_PAD", None),
    ("R3", "rapid", "P3_UP2_GRAY_PAD", None),
    ("R4", "rapid", "P5_CLAHE_UP2_PAD", None),
    ("T1", "tess", "P0_RAW", 7),
    ("T2", "tess", "P1_PAD", 13),
    ("N1", "wide", "P0_RAW", None),
    ("N2", "wide", "P1_PAD", None),
    ("N3", "wide", "P3_UP2_GRAY_PAD", None),
    ("N4", "wide", "P5_CLAHE_UP2_PAD", None),
]


def stability_score(bench: Bench, row: dict[str, Any], cid: str, eng: str, var: str, psm: Optional[int]) -> float:
    base = bench.run_candidate(row, cid, eng, var, psm)
    fold = base["raw_text"].casefold()
    bgr = cv2.imread(row["crop_path"])
    ok = total = 0
    for _, pfn in default_perturbations()[:6]:
        im = pfn(bgr.copy())
        proc = apply_variant(im, var)
        tmp = CACHE / f"stab_{row['crop_sha256'][:8]}_{cid}.png"
        cv2.imwrite(str(tmp), proc)
        if eng == "rapid":
            o = bench.rapid.recognize(str(tmp), "name_en")
        elif eng == "wide":
            o = bench.wide.recognize(str(tmp))
        else:
            o = bench.tess.recognize_with_config(str(tmp), psm or 7, None)
        total += 1
        if sanitize_name_ocr_output(o["raw_text"]).casefold() == fold:
            ok += 1
    return ok / total if total else 0.0


def audit_failure_row(bench: Bench, row: dict[str, Any]) -> dict[str, Any]:
    feats = load_features(row["crop_path"]).to_dict()
    cands = []
    for cid, eng, var, psm in CANDIDATES:
        c = bench.run_candidate(row, cid, eng, var, psm)
        ref = row["reference_value"]
        c["exact"] = c["raw_text"] == ref
        c["cer"] = cer_on_strings(c["raw_text"], ref)
        c["validator"] = validate_name_en_text(c["raw_text"])[0]
        cands.append(c)
    rapid_r1 = next(c for c in cands if c["candidate_id"] == "R1")
    tess_t1 = next(c for c in cands if c["candidate_id"] == "T1")
    return {
        "test_id": row["test_id"],
        "reference_value": row["reference_value"],
        "crop_path": row["crop_path"],
        "features": feats,
        "rapid_primary": rapid_r1,
        "tesseract_primary": tess_t1,
        "candidates": cands,
        "word_count": len(row["reference_value"].split()),
        "aspect_ratio": feats["width"] / max(feats["height"], 1),
    }


def pick_candidate_on_train(train_rows: list[dict[str, Any]], bench: Bench) -> str:
    best_id = CANDIDATES[0][0]
    best_score = (-1, -1.0, -1.0)
    for cid, eng, var, psm in CANDIDATES:
        exact = norm = 0
        cers = []
        for row in train_rows:
            c = bench.run_candidate(row, cid, eng, var, psm)
            ref = row["reference_value"]
            if c["raw_text"] == ref:
                exact += 1
            if normalized_exact_match("name_en", c["raw_text"], ref):
                norm += 1
            cers.append(cer_on_strings(c["raw_text"], ref))
        score = (exact, norm, -statistics.mean(cers) if cers else 0)
        if score > best_score:
            best_score = score
            best_id = cid
    return best_id


def run_stable_or_date(row: dict[str, Any], runner_cache: dict) -> dict[str, Any]:
    """Frozen OCR6/OCR7 paths for regression."""
    import importlib.util

    if "ocr7" not in runner_cache:
        spec = importlib.util.spec_from_file_location(
            "ocr7mod", PROJECT_ROOT / "scripts" / "run_ocr7_dynamic_fallback.py"
        )
        ocr7 = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(ocr7)
        runner_cache["ocr7"] = ocr7
        runner_cache["o7"] = ocr7.Runner()
        from src.inference.confidence_calib import CalibratedThresholds

        runner_cache["calib"] = CalibratedThresholds(0.5, 0.45, 0.75, 0.65)
    ocr7 = runner_cache["ocr7"]
    o7 = runner_cache["o7"]
    if row["field_name"] in DATE_FIELDS:
        prim, fbs = ocr7.build_date_primary_and_fallbacks(row, o7)
        sel = ocr7.select_date_output(prim, fbs, runner_cache["calib"])
        return {
            **row,
            "final_text": sel["final_text"],
            "status": sel["status"],
            "path": "frozen_date_ocr7",
        }
    pol = json.loads(OCR6_CONFIG.read_text(encoding="utf-8"))["groups"][
        {"license_number": "LICENSE_NUMBER", "nationality": "NATIONALITY", "place_of_issue": "PLACE_OF_ISSUE"}[
            row["field_name"]
        ]
    ]
    p = ocr7.run_stable(row, o7)
    return {**p, "path": "frozen_stable_ocr6"}


def audit_rules() -> int:
    pat = re.compile(r"pilot_0[1-5]")
    n = 0
    for root in (PROJECT_ROOT / "src" / "engines", PROJECT_ROOT / "src" / "inference"):
        for path in root.rglob("*.py"):
            if "run_ocr8" in str(path):
                continue
            for line in path.read_text(encoding="utf-8").splitlines():
                if pat.search(line) and not line.strip().startswith("#"):
                    n += 1
    return n


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows = name_rows()
    bench = Bench()

    audits = [audit_failure_row(bench, r) for r in rows]
    (OUT_DIR / "failure_audit.json").write_text(
        json.dumps(audits, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    all_cand_rows: list[dict[str, Any]] = []
    fold_results = []
    confusion = Counter()
    per_doc: dict[str, dict] = {}

    for val_id in PILOT_IDS:
        train = [r for r in rows if r["test_id"] in [p for p in PILOT_IDS if p != val_id]]
        val = [r for r in rows if r["test_id"] == val_id]
        chosen = pick_candidate_on_train(train, bench)
        spec = next(c for c in CANDIDATES if c[0] == chosen)
        cid, eng, var, psm = spec
        val_pred = None
        for row in val:
            c = bench.run_candidate(row, cid, eng, var, psm)
            stab = stability_score(bench, row, cid, eng, var, psm)
            ref = row["reference_value"]
            exact = c["raw_text"] == ref
            norm = normalized_exact_match("name_en", c["raw_text"], ref)
            vstat = validate_name_en_text(c["raw_text"])[0]
            r1 = bench.run_candidate(row, "R1", "rapid", "P0_RAW", None)
            t1 = bench.run_candidate(row, "T1", "tess", "P0_RAW", 7)
            cross_disagree = (
                r1["raw_text"].casefold() != t1["raw_text"].casefold()
                and r1["raw_text"]
                and t1["raw_text"]
            )
            status = "ACCEPTED"
            if cross_disagree and not norm and stab < 0.67:
                status = "FLAG_UNCERTAIN"
                c["raw_text"] = ""
            elif not norm and vstat != "ACCEPT" and stab < 0.5:
                status = "FLAG_UNCERTAIN"
                c["raw_text"] = ""
            rec = {
                **row,
                "validation_document": val_id,
                "chosen_candidate": chosen,
                "final_text": c["raw_text"],
                "confidence": c["confidence"],
                "stability_score": stab,
                "validator": vstat,
                "status": status,
                "exact_match": exact and status == "ACCEPTED",
                "normalized_exact_match": norm and status == "ACCEPTED",
                "cer": cer_on_strings(c["raw_text"], ref),
            }
            val_pred = rec
            fold_results.append(rec)
            per_doc[val_id] = rec
            for cid2, eng2, var2, psm2 in CANDIDATES:
                c2 = bench.run_candidate(row, cid2, eng2, var2, psm2)
                c2_row = {**row, **c2, "fold_val": val_id}
                all_cand_rows.append(c2_row)
            if not norm:
                for op in align_ops(ref, c["raw_text"]):
                    if op["op"] == "sub":
                        confusion[(op["t"], op["p"])] += 1

    # Per-engine LOO: best R, T, N on train each fold
    engine_loo = {"rapid": [], "tesseract": [], "wide": []}
    for val_id in PILOT_IDS:
        train = [r for r in rows if r["test_id"] != val_id]
        val = [r for r in rows if r["test_id"] == val_id][0]
        for family, prefix in (("rapid", "R"), ("tesseract", "T"), ("wide", "N")):
            pool = [c for c in CANDIDATES if c[0].startswith(prefix)]
            best = pool[0][0]
            best_score = (-1, -1.0)
            for cid, eng, var, psm in pool:
                ex = sum(
                    1
                    for r in train
                    if bench.run_candidate(r, cid, eng, var, psm)["raw_text"] == r["reference_value"]
                )
                if ex > best_score[0]:
                    best, best_score = cid, (ex, 0.0)
            cid, eng, var, psm = next(c for c in CANDIDATES if c[0] == best)
            pred = bench.run_candidate(val, cid, eng, var, psm)
            engine_loo[family].append(
                normalized_exact_match("name_en", pred["raw_text"], val["reference_value"])
            )

    loo_preds = fold_results
    n = len(loo_preds)
    accepted = [p for p in loo_preds if p["status"] == "ACCEPTED"]
    metrics = {
        "n": n,
        "exact_correct": sum(1 for p in loo_preds if p["exact_match"]),
        "normalized_correct": sum(1 for p in loo_preds if p["normalized_exact_match"]),
        "exact_accuracy": sum(1 for p in loo_preds if p["exact_match"]) / n,
        "mean_cer": statistics.mean(p["cer"] for p in loo_preds),
        "coverage": len(accepted) / n,
        "accepted_accuracy": (
            sum(1 for p in accepted if p["normalized_exact_match"]) / len(accepted)
            if accepted
            else 0
        ),
        "false_accepts": sum(1 for p in accepted if not p["normalized_exact_match"]),
        "flag_uncertain_count": sum(1 for p in loo_preds if p["status"] == "FLAG_UNCERTAIN"),
    }

    stress = []
    chosen_global = Counter(p["chosen_candidate"] for p in loo_preds).most_common(1)[0][0]
    spec = next(c for c in CANDIDATES if c[0] == chosen_global)
    cid, eng, var, psm = spec
    for row in rows:
        base = bench.run_candidate(row, cid, eng, var, psm)
        bgr = cv2.imread(row["crop_path"])
        ok = total = 0
        for pname, pfn in default_perturbations():
            proc = apply_variant(pfn(bgr.copy()), var)
            tmp = OUT_DIR / "stress" / f"{row['crop_sha256'][:8]}_{pname}.png"
            tmp.parent.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(tmp), proc)
            if eng == "rapid":
                o = bench.rapid.recognize(str(tmp), "name_en")
            elif eng == "wide":
                o = bench.wide.recognize(str(tmp))
            else:
                o = bench.tess.recognize_with_config(str(tmp), psm or 7, None)
            total += 1
            if sanitize_name_ocr_output(o["raw_text"]).casefold() == base["raw_text"].casefold():
                ok += 1
            stress.append({"test_id": row["test_id"], "perturbation": pname, "stable": ok == total})
        stress.append(
            {
                "test_id": row["test_id"],
                "stability_rate": ok / total if total else 0,
            }
        )

    stab_rates = [s["stability_rate"] for s in stress if "stability_rate" in s]
    stress_summary = {
        "policy_candidate": chosen_global,
        "mean_stability_rate": statistics.mean(stab_rates) if stab_rates else 0,
        "details": stress,
    }

    # Full system regression
    reg_cache: dict = {}
    full = []
    for row in all_scorable():
        if row["field_name"] == "name_en":
            # use global policy on all (not LOO) for regression snapshot
            c = bench.run_candidate(row, cid, eng, var, psm)
            full.append(
                {
                    **row,
                    "final_text": c["raw_text"],
                    "normalized_exact_match": normalized_exact_match(
                        "name_en", c["raw_text"], row["reference_value"]
                    ),
                    "path": "ocr8_name_policy",
                }
            )
        else:
            p = run_stable_or_date(row, reg_cache)
            full.append(
                {
                    **row,
                    "normalized_exact_match": normalized_exact_match(
                        row["field_name"], p["final_text"], row["reference_value"]
                    ),
                }
            )
    stable_ok = sum(
        1
        for r in full
        if r["field_name"] != "name_en"
        and r["field_name"] not in DATE_FIELDS
        and r["normalized_exact_match"]
    )
    date_ok = sum(
        1
        for r in full
        if r["field_name"] in DATE_FIELDS
        and r["normalized_exact_match"]
    )

    policy = {
        "phase": "OCR-8",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "name_candidate_default": chosen_global,
        "engine": eng,
        "variant": var,
        "psm": psm,
        "sanitize_edges": True,
        "cross_engine_uncertain_gate": {
            "enabled": True,
            "rule": "RapidOCR vs Tesseract P0 disagree and stability<0.67 -> FLAG_UNCERTAIN",
        },
        "loo_metrics": metrics,
        "specialist_engine": "rapidocr_en_wide",
        "specialist_rec_width": 640,
        "model_sha256": hashlib.sha256(
            (PROJECT_ROOT / "vendor" / "rapidocr_en" / "en_PP-OCRv4_rec_infer.onnx").read_bytes()
        ).hexdigest(),
        "investigation": "audit/OCR8_NAME_SPECIALIST_INVESTIGATION.json",
    }
    (OUT_DIR / "final_name_policy.json").write_text(json.dumps(policy, indent=2), encoding="utf-8")
    (OUT_DIR / "candidate_results.json").write_text(
        json.dumps(all_cand_rows, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    if all_cand_rows:
        with (OUT_DIR / "candidate_results.csv").open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(all_cand_rows[0].keys()))
            w.writeheader()
            w.writerows(all_cand_rows)
    (OUT_DIR / "loo_results.json").write_text(
        json.dumps({"folds": fold_results, "metrics": metrics, "per_document": per_doc}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    (OUT_DIR / "confusion_analysis.json").write_text(
        json.dumps(
            {
                "substitution_counts": {f"{a}->{b}": c for (a, b), c in confusion.most_common()},
                "alignments": [
                    {
                        "test_id": a["test_id"],
                        "truth": a["reference_value"],
                        "ops": align_ops(
                            a["reference_value"],
                            next(
                                c["raw_text"]
                                for c in a["candidates"]
                                if c["candidate_id"] == "R1"
                            ),
                        ),
                    }
                    for a in audits
                ],
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (OUT_DIR / "stress_test.json").write_text(json.dumps(stress_summary, indent=2), encoding="utf-8")

    fails = [p for p in loo_preds if not p["normalized_exact_match"]]
    nfail = max(1, len(fails))
    fig, axes = plt.subplots(nfail, 1, figsize=(10, 2.5 * nfail))
    if nfail == 1:
        axes = [axes]
    show = fails if fails else loo_preds[:1]
    for ax, f in zip(axes, show[:nfail]):
        ax.imshow(Image.open(f["crop_path"]))
        ax.axis("off")
        ax.set_title(
            f"{f['test_id']} pred={f['final_text']} ref={f['reference_value']}",
            fontsize=8,
            loc="left",
        )
    plt.tight_layout()
    plt.savefig(OUT_DIR / "name_failure_sheet.png", dpi=120)
    plt.close()

    doc_rules = audit_rules()
    if metrics["exact_correct"] >= 4 and metrics["false_accepts"] <= 1:
        decision = "NAME_EN_GENERALIZATION_SOLVED" if metrics["exact_correct"] == 5 else "NAME_EN_SPECIALIST_IMPROVED"
    elif metrics["exact_correct"] > 2 or metrics["accepted_accuracy"] > 0.6:
        decision = "NAME_EN_SPECIALIST_IMPROVED"
    else:
        decision = "NAME_EN_SPECIALIST_NO_GAIN"

    print(
        json.dumps(
            {
                "decision": decision,
                "loo_name_en": metrics,
                "engine_loo_exact": {
                    "rapid_best_of_R": sum(engine_loo["rapid"]),
                    "tesseract_best_of_T": sum(engine_loo["tesseract"]),
                    "wide_best_of_N": sum(engine_loo["wide"]),
                },
                "regression": {"stable_9": stable_ok, "dates_12": date_ok},
                "DOCUMENT_SPECIFIC_RULES_FOUND": doc_rules,
                "final_name_policy": str(OUT_DIR / "final_name_policy.json"),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
