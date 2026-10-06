#!/usr/bin/env python3
"""OCR-5: English/Latin field optimization (no Arabic)."""

from __future__ import annotations

import csv
import hashlib
import json
import statistics
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import matplotlib.pyplot as plt
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.engines.rapidocr_english import RapidOcrEnglishEngine
from src.engines.tesseract_english import TesseractEnglishEngine
from src.preprocess.english_variants import VARIANTS, materialize_variant
from src.scoring.normalize import (
    cer_on_strings,
    normalize_for_field,
    normalized_exact_match,
)
from src.validators.english_fields import validate_field

DATASET = PROJECT_ROOT / "pilot_subset" / "benchmark" / "pilot_dataset.json"
OCR4_RESULTS = PROJECT_ROOT / "results" / "OCR4_P0_RAW" / "benchmark_results.json"
OUT_DIR = PROJECT_ROOT / "results" / "OCR5_ENGLISH_ONLY"
BEST_CONFIG_PATH = PROJECT_ROOT / "config" / "ocr5_english_best.json"
CACHE_DIR = OUT_DIR / "preprocess_cache"

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
FIELD_GROUP = {
    "license_number": "LICENSE",
    "name_en": "NAME_EN",
    "nationality": "NATIONALITY",
    "date_of_birth": "DATES",
    "issue_date": "DATES",
    "expiry_date": "DATES",
    "place_of_issue": "PLACE_OF_ISSUE",
}
DATE_FIELDS = frozenset({"date_of_birth", "issue_date", "expiry_date"})
RAPID_VARIANTS = ("P0_RAW", "P1_PAD", "P3_UP2_GRAY_PAD", "P5_CLAHE_UP2_PAD")
WL_DATE = "0123456789/"
WL_LICENSE_ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
WL_LICENSE_DIGITS = "0123456789"


@dataclass(frozen=True)
class TrialKey:
    engine: str
    variant: str
    psm: Optional[int]
    whitelist_label: str

    def as_id(self) -> str:
        if self.engine == "rapidocr_en":
            return f"rapidocr_en|{self.variant}"
        psm = self.psm if self.psm is not None else "-"
        return f"{self.engine}|{self.variant}|psm{psm}|wl_{self.whitelist_label}"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_english_rows() -> list[dict[str, Any]]:
    data = json.loads(DATASET.read_text(encoding="utf-8"))
    rows = [
        r
        for r in data["fields"]
        if r.get("ocr_eligible_scorable")
        and r["field_name"] in ENGLISH_FIELDS
    ]
    return rows


def load_ocr4_primary() -> dict[tuple[str, str], dict[str, Any]]:
    if not OCR4_RESULTS.is_file():
        return {}
    rows = json.loads(OCR4_RESULTS.read_text(encoding="utf-8"))
    out = {}
    for r in rows:
        if r.get("role") != "primary" or r["field_name"] not in ENGLISH_FIELDS:
            continue
        out[(r["test_id"], r["field_name"])] = r
    return out


def tess_trials_for_group(group: str) -> list[TrialKey]:
    keys: list[TrialKey] = []
    if group == "LICENSE":
        wls = [("none", None), ("alnum", WL_LICENSE_ALNUM), ("digits", WL_LICENSE_DIGITS)]
    elif group == "DATES":
        wls = [("none", None), ("date", WL_DATE)]
    else:
        wls = [("none", None)]
    for variant in VARIANTS:
        for psm in (7, 13):
            for wl_label, _ in wls:
                keys.append(
                    TrialKey("tesseract", variant, psm, wl_label)
                )
    return keys


def whitelist_for_trial(group: str, wl_label: str) -> Optional[str]:
    if wl_label == "none":
        return None
    if wl_label == "date":
        return WL_DATE
    if wl_label == "alnum":
        return WL_LICENSE_ALNUM
    if wl_label == "digits":
        return WL_LICENSE_DIGITS
    return None


def score_prediction(field_name: str, raw_text: str, reference: str) -> dict[str, Any]:
    return {
        "exact_match": raw_text == reference,
        "normalized_exact_match": normalized_exact_match(
            field_name, raw_text, reference
        ),
        "cer_whitespace_trimmed": cer_on_strings(raw_text, reference),
        "normalized_prediction": normalize_for_field(field_name, raw_text),
    }


def aggregate_trial(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {"n": 0}
    n = len(rows)
    return {
        "n": n,
        "exact_correct": sum(1 for r in rows if r["exact_match"]),
        "normalized_correct": sum(1 for r in rows if r["normalized_exact_match"]),
        "exact_accuracy": sum(1 for r in rows if r["exact_match"]) / n,
        "normalized_accuracy": sum(
            1 for r in rows if r["normalized_exact_match"]
        )
        / n,
        "mean_cer": statistics.mean(r["cer_whitespace_trimmed"] for r in rows),
        "mean_runtime_ms": statistics.mean(r["runtime_ms"] for r in rows),
    }


def pick_best_trial(candidates: list[tuple[TrialKey, dict[str, Any]]]) -> TrialKey:
    def sort_key(item: tuple[TrialKey, dict[str, Any]]) -> tuple:
        _k, agg = item
        return (
            -agg["normalized_correct"],
            -agg["exact_correct"],
            agg["mean_cer"],
        )

    return sorted(candidates, key=sort_key)[0][0]


def render_png(
    entries: list[dict[str, Any]],
    out_path: Path,
    title: str,
    max_rows: int = 12,
) -> None:
    subset = entries[:max_rows]
    if not subset:
        fig, ax = plt.subplots(figsize=(8, 2))
        ax.text(0.5, 0.5, title + " (none)", ha="center", va="center")
        ax.axis("off")
        fig.savefig(out_path, dpi=120, bbox_inches="tight")
        plt.close(fig)
        return
    fig, axes = plt.subplots(len(subset), 1, figsize=(10, 2.2 * len(subset)))
    if len(subset) == 1:
        axes = [axes]
    for ax, e in zip(axes, subset):
        img = Image.open(e["crop_path"])
        ax.imshow(img)
        ax.axis("off")
        ax.set_title(
            f"{e['test_id']}/{e['field_name']} | {e.get('config_id', '')}\n"
            f"GT: {e['reference_value']} | OCR: {e['raw_text']}",
            fontsize=7,
            loc="left",
        )
    fig.suptitle(title, fontsize=10)
    fig.tight_layout()
    fig.savefig(out_path, dpi=120, bbox_inches="tight")
    plt.close(fig)


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    english_rows = load_english_rows()
    sample_count = len(english_rows)
    print(f"English-only benchmark sample count: {sample_count}")
    if sample_count != 20:
        print(f"WARNING: expected 20 English scorable rows, got {sample_count}", file=sys.stderr)

    ocr4 = load_ocr4_primary()
    tess = TesseractEnglishEngine()
    rapid = RapidOcrEnglishEngine()
    tess.cold_init()
    rapid.cold_init()

    all_trials: list[dict[str, Any]] = []
    by_group_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in english_rows:
        by_group_rows[FIELD_GROUP[row["field_name"]]].append(row)

    # Stage A: Tesseract grid per field group
    tess_agg: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    for group, grows in by_group_rows.items():
        for tkey in tess_trials_for_group(group):
            wl = whitelist_for_trial(group, tkey.whitelist_label)
            trial_rows: list[dict[str, Any]] = []
            for row in grows:
                src = Path(row["crop_path"])
                if sha256_file(src) != row["crop_sha256"]:
                    print("DATASET_INTEGRITY_FAILURE", row["test_id"], row["field_name"])
                    return 3
                img_path = materialize_variant(
                    src, tkey.variant, CACHE_DIR, row["crop_sha256"]
                )
                ocr = tess.recognize_with_config(str(img_path), tkey.psm or 7, wl)
                scores = score_prediction(
                    row["field_name"], ocr["raw_text"], row["reference_value"]
                )
                rec = {
                    "stage": "A",
                    "field_group": group,
                    "test_id": row["test_id"],
                    "field_name": row["field_name"],
                    "reference_value": row["reference_value"],
                    "crop_path": str(src),
                    "preprocessing": tkey.variant,
                    "engine": tkey.engine,
                    "config_id": tkey.as_id(),
                    "psm": tkey.psm,
                    "whitelist_label": tkey.whitelist_label,
                    "raw_text": ocr["raw_text"],
                    "raw_confidence": ocr["confidence"],
                    "runtime_ms": ocr["runtime_ms"],
                    "validator": validate_field(row["field_name"], ocr["raw_text"]),
                    **scores,
                }
                all_trials.append(rec)
                trial_rows.append(rec)
            tess_agg[group][tkey.as_id()] = aggregate_trial(trial_rows)

    # Stage A: RapidOCR on selected variants (all English rows)
    rapid_agg: dict[str, dict[str, Any]] = {}
    for variant in RAPID_VARIANTS:
        trial_rows = []
        for row in english_rows:
            src = Path(row["crop_path"])
            img_path = materialize_variant(
                src, variant, CACHE_DIR, row["crop_sha256"]
            )
            group = FIELD_GROUP[row["field_name"]]
            ocr = rapid.recognize(str(img_path), row["field_name"])
            scores = score_prediction(
                row["field_name"], ocr["raw_text"], row["reference_value"]
            )
            rec = {
                "stage": "A",
                "field_group": group,
                "test_id": row["test_id"],
                "field_name": row["field_name"],
                "reference_value": row["reference_value"],
                "crop_path": str(src),
                "preprocessing": variant,
                "engine": "rapidocr_en",
                "config_id": f"rapidocr_en|{variant}",
                "psm": None,
                "whitelist_label": "none",
                "raw_text": ocr["raw_text"],
                "raw_confidence": ocr["confidence"],
                "runtime_ms": ocr["runtime_ms"],
                "validator": validate_field(row["field_name"], ocr["raw_text"]),
                **scores,
            }
            all_trials.append(rec)
            trial_rows.append(rec)
        rapid_agg[variant] = aggregate_trial(trial_rows)

    # Stage B: best per field group (tesseract vs rapidocr)
    best_per_group: dict[str, Any] = {}
    best_trial_rows: dict[str, list[dict[str, Any]]] = {}
    for group, grows in by_group_rows.items():
        field_names = {r["field_name"] for r in grows}
        tess_candidates: list[tuple[TrialKey, dict[str, Any]]] = []
        for tkey in tess_trials_for_group(group):
            agg = tess_agg[group].get(tkey.as_id())
            if agg and agg.get("n"):
                tess_candidates.append((tkey, agg))
        best_tess = pick_best_trial(tess_candidates) if tess_candidates else None

        rapid_candidates = [
            (TrialKey("rapidocr_en", v, None, "none"), rapid_agg[v])
            for v in RAPID_VARIANTS
            if rapid_agg.get(v, {}).get("n")
        ]
        # Restrict RapidOCR comparison to rows in this group
        rapid_by_variant: list[tuple[TrialKey, dict[str, Any]]] = []
        for v in RAPID_VARIANTS:
            subset = [
                t
                for t in all_trials
                if t["engine"] == "rapidocr_en"
                and t["preprocessing"] == v
                and t["field_name"] in field_names
            ]
            if subset:
                rapid_by_variant.append(
                    (TrialKey("rapidocr_en", v, None, "none"), aggregate_trial(subset))
                )
        best_rapid = pick_best_trial(rapid_by_variant) if rapid_by_variant else None

        tess_score = (
            tess_agg[group][best_tess.as_id()]
            if best_tess and best_tess.as_id() in tess_agg[group]
            else {"normalized_correct": -1, "mean_cer": 9}
        )
        rapid_score = next(
            (a for k, a in rapid_by_variant if k == best_rapid),
            {"normalized_correct": -1, "mean_cer": 9},
        )
        if rapid_score["normalized_correct"] > tess_score["normalized_correct"] or (
            rapid_score["normalized_correct"] == tess_score["normalized_correct"]
            and rapid_score["mean_cer"] < tess_score["mean_cer"]
        ):
            winner = best_rapid
            winner_engine = "rapidocr_en"
        else:
            winner = best_tess
            winner_engine = "tesseract"

        winner_rows = [
            t
            for t in all_trials
            if t["config_id"] == winner.as_id()
            and t["field_name"] in field_names
        ]
        best_trial_rows[group] = winner_rows
        best_per_group[group] = {
            "winner_engine": winner_engine,
            "config": {
                "engine": winner.engine,
                "preprocessing": winner.variant,
                "psm": winner.psm,
                "whitelist_label": winner.whitelist_label,
                "whitelist": whitelist_for_trial(group, winner.whitelist_label),
                "config_id": winner.as_id(),
            },
            "metrics": aggregate_trial(winner_rows),
            "tesseract_best": {
                "config_id": best_tess.as_id() if best_tess else None,
                "metrics": tess_score,
            },
            "rapidocr_best": {
                "config_id": best_rapid.as_id() if best_rapid else None,
                "metrics": rapid_score,
            },
        }

    # OCR4 comparison (primary English only)
    ocr5_best_flat: list[dict[str, Any]] = []
    for group, rows in best_trial_rows.items():
        ocr5_best_flat.extend(rows)
    ocr4_vs_ocr5 = []
    for key in sorted({(r["test_id"], r["field_name"]) for r in ocr5_best_flat}):
        o5 = next(r for r in ocr5_best_flat if (r["test_id"], r["field_name"]) == key)
        o4 = ocr4.get(key)
        ocr4_vs_ocr5.append(
            {
                "test_id": key[0],
                "field_name": key[1],
                "field_group": FIELD_GROUP[key[1]],
                "ocr4_exact": o4["exact_match"] if o4 else None,
                "ocr5_exact": o5["exact_match"],
                "ocr4_normalized_exact": o4["normalized_exact_match"] if o4 else None,
                "ocr5_normalized_exact": o5["normalized_exact_match"],
                "ocr4_cer": o4["cer_whitespace_trimmed"] if o4 else None,
                "ocr5_cer": o5["cer_whitespace_trimmed"],
                "improved_exact": (
                    o5["exact_match"] and not (o4 and o4["exact_match"])
                ),
                "ocr5_config": o5["config_id"],
            }
        )

    failures = [r for r in ocr5_best_flat if not r["normalized_exact_match"]]
    improved = [r for r in ocr4_vs_ocr5 if r["improved_exact"]]

    ocr4_en = [ocr4[k] for k in ocr4 if k in {(r["test_id"], r["field_name"]) for r in english_rows}]
    ocr4_norm = sum(1 for r in ocr4_en if r["normalized_exact_match"]) / max(len(ocr4_en), 1)
    ocr5_norm = sum(1 for r in ocr5_best_flat if r["normalized_exact_match"]) / max(
        len(ocr5_best_flat), 1
    )

    per_engine = {
        "tesseract_stage_a_trials": sum(len(v) for v in tess_agg.values()),
        "rapidocr_stage_a_variants": list(RAPID_VARIANTS),
        "ocr5_english_normalized_accuracy": ocr5_norm,
        "ocr4_english_normalized_accuracy": ocr4_norm,
    }

    perf = {
        "tesseract_mean_runtime_ms": statistics.mean(
            t["runtime_ms"] for t in all_trials if t["engine"] == "tesseract"
        ),
        "rapidocr_mean_runtime_ms": statistics.mean(
            t["runtime_ms"] for t in all_trials if t["engine"] == "rapidocr_en"
        ),
        "ocr5_best_mean_runtime_ms": statistics.mean(
            t["runtime_ms"] for t in ocr5_best_flat
        ),
    }

    best_config_doc = {
        "phase": "OCR-5",
        "english_only": True,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sample_count": sample_count,
        "excluded_fields": ["name_ar"],
        "excluded_rows": ["pilot_04/license_number (UNREADABLE)"],
        "field_groups": best_per_group,
        "rapidocr_model": str(
            PROJECT_ROOT / "vendor" / "rapidocr_en" / "en_PP-OCRv4_rec_infer.onnx"
        ),
    }
    BEST_CONFIG_PATH.write_text(
        json.dumps(best_config_doc, indent=2), encoding="utf-8"
    )

    (OUT_DIR / "all_trials.json").write_text(
        json.dumps(all_trials, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    if all_trials:
        with (OUT_DIR / "all_trials.csv").open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(all_trials[0].keys()))
            w.writeheader()
            w.writerows(all_trials)

    (OUT_DIR / "best_per_field_group.json").write_text(
        json.dumps(best_per_group, indent=2), encoding="utf-8"
    )
    (OUT_DIR / "per_engine_summary.json").write_text(
        json.dumps(
            {
                "per_engine": per_engine,
                "ocr4_vs_ocr5": ocr4_vs_ocr5,
                "ocr4_to_ocr5_improvement_count": sum(
                    1 for r in ocr4_vs_ocr5 if r["improved_exact"]
                ),
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (OUT_DIR / "failure_analysis.json").write_text(
        json.dumps(
            {
                "remaining_failures": failures,
                "failure_count": len(failures),
                "wins_over_ocr4": improved,
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (OUT_DIR / "performance_summary.json").write_text(
        json.dumps(perf, indent=2), encoding="utf-8"
    )

    render_png(
        [r for r in ocr5_best_flat if r["normalized_exact_match"]],
        OUT_DIR / "best_results.png",
        "OCR-5 best-config successes",
    )
    render_png(failures, OUT_DIR / "remaining_failures.png", "OCR-5 remaining failures")

    # Decision
    def _ex(group: str) -> int:
        return int(best_per_group[group]["metrics"].get("exact_correct", 0))

    targets_met = (
        _ex("DATES") >= 8
        and _ex("LICENSE") >= 2
        and _ex("NAME_EN") >= 3
        and _ex("NATIONALITY") >= 2
        and _ex("PLACE_OF_ISSUE") >= 2
    )
    material = ocr5_norm > ocr4_norm + 0.05
    if targets_met and material:
        decision = "OCR5_ENGLISH_OPTIMIZATION_SUCCESS"
    elif ocr5_norm >= ocr4_norm:
        decision = "OCR5_ENGLISH_IMPROVED_BUT_MORE_WORK_NEEDED"
    else:
        decision = "OCR_ENGINE_RECONSIDERATION_REQUIRED"

    summary = {
        "decision": decision,
        "sample_count": sample_count,
        "best_config_path": str(BEST_CONFIG_PATH),
        "ocr4_english_normalized_accuracy": ocr4_norm,
        "ocr5_english_normalized_accuracy": ocr5_norm,
        "best_per_group": {
            g: {
                "winner": v["winner_engine"],
                "config_id": v["config"]["config_id"],
                "metrics": v["metrics"],
            }
            for g, v in best_per_group.items()
        },
    }
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
