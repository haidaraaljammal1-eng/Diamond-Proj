"""Read-only pre-benchmark audit — no OCR, no crop modification."""

from __future__ import annotations

import hashlib
import json
import platform
import statistics
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

CROP_V1_ROOT = Path(r"C:\Users\Rw\UAE_LICENSE_CROP_V2")
OCR_ROOT = Path(__file__).resolve().parents[1]

FIELD_ORDER = [
    "license_number",
    "name_ar",
    "name_en",
    "nationality",
    "date_of_birth",
    "issue_date",
    "expiry_date",
    "place_of_issue",
]

# One handoff per licence case; exclude regression duplicates and scratch runs.
CANONICAL_TEST_IDS = frozenset(
    {
        "real3",
        "real4",
        "real5",
        "real6",
        "real7",
        "real8",
        "real9",
        "real10",
        "real11",
        "real12",
        "real13",
        "real14",
        "real_01",
        "real_02",
        "real02",
    }
)

SCRATCH_PREFIXES = ("_",)
SCRATCH_NAMES = frozenset({"STALE_OUTPUT_TEST"})


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def find_handoffs(crop_root: Path) -> List[Tuple[str, Path]]:
    out: List[Tuple[str, Path]] = []
    output = crop_root / "output"
    if not output.is_dir():
        return out
    for path in sorted(output.rglob("ocr_handoff.json")):
        test_id = path.parent.name
        if test_id in SCRATCH_NAMES or test_id.startswith(SCRATCH_PREFIXES):
            continue
        out.append((test_id, path))
    return out


def test_id_from_path(handoff_path: Path) -> str:
    return handoff_path.parent.name


def load_crop_release_record() -> Dict[str, Any]:
    rel = CROP_V1_ROOT / "release" / "DYNAMIC_CROP_V1"
    src = json.loads((rel / "source_hash_manifest.json").read_text(encoding="utf-8"))
    tmpl = json.loads((rel / "template_manifest.json").read_text(encoding="utf-8"))
    meta_path = rel / "release_metadata.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.is_file() else {}
    return {
        "crop_release": "DYNAMIC_CROP_V1",
        "crop_release_status": "DYNAMIC_CROP_V1_FROZEN_FOR_OCR",
        "source_hash_manifest_path": str(rel / "source_hash_manifest.json"),
        "source_aggregate_sha256": src.get("aggregate_sha256"),
        "template_manifest_path": str(rel / "template_manifest.json"),
        "template_aggregate_sha256": tmpl.get("aggregate_sha256"),
        "release_metadata_version": meta.get("version"),
        "release_date": meta.get("release_date"),
        "manifests_regenerated": False,
    }


def edge_touch(ink: np.ndarray, margin: int = 2) -> Dict[str, bool]:
    h, w = ink.shape[:2]
    touches = {
        "LEFT": bool(np.any(ink[:, :margin] > 0)),
        "RIGHT": bool(np.any(ink[:, w - margin :] > 0)),
        "TOP": bool(np.any(ink[:margin, :] > 0)),
        "BOTTOM": bool(np.any(ink[h - margin :, :] > 0)),
    }
    return touches


def analyze_crop_image(path: Path) -> Dict[str, Any]:
    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        return {"error": "unreadable", "path": str(path)}

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]
    _, ink = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    ink_ratio = float(np.count_nonzero(ink)) / float(max(1, w * h))
    lap = cv2.Laplacian(gray, cv2.CV_64F)
    lap_var = float(lap.var())
    std = float(np.std(gray))
    mean = float(np.mean(gray))
    hist = cv2.calcHist([gray], [0], None, [256], [0, 256])
    hist = hist / max(1.0, hist.sum())
    entropy = float(-np.sum(hist * np.log2(hist + 1e-12)))

    touches = edge_touch(ink)
    touch_count = sum(1 for v in touches.values() if v)

    quality = "OCR_IMAGE_GOOD"
    if w < 48 or h < 14 or w * h < 600:
        quality = "OCR_IMAGE_TOO_SMALL"
    elif lap_var < 80:
        quality = "OCR_IMAGE_BLURRED"
    elif std < 18:
        quality = "OCR_IMAGE_LOW_CONTRAST"
    elif touch_count >= 3 and min(w, h) < 35:
        quality = "OCR_IMAGE_TIGHT_PADDING"
    elif ink_ratio > 0.55 or (ink_ratio > 0.35 and lap_var < 150):
        quality = "OCR_IMAGE_SUSPICIOUS_CONTENT"

    return {
        "width": w,
        "height": h,
        "aspect_ratio": round(w / float(h), 4) if h else 0,
        "grayscale_mean": round(mean, 4),
        "grayscale_stddev": round(std, 4),
        "contrast_estimate": round(std / max(1.0, mean), 6),
        "laplacian_variance": round(lap_var, 4),
        "ink_ratio": round(ink_ratio, 6),
        "entropy": round(entropy, 4),
        "edge_touch": touches,
        "edge_touch_count": touch_count,
        "ocr_image_quality_class": quality,
        "could_benefit_from_ocr_padding": touch_count >= 1,
    }


def real9_semantic_class(path: Optional[Path], handoff_field: Dict[str, Any]) -> str:
    """Negative-control classification (OCR-layer only)."""
    if not path or not path.is_file():
        return "UNCERTAIN"
    metrics = handoff_field.get("content_sanity_metrics") or {}
    glyph = float(metrics.get("glyph_area", 0))
    tall = float(metrics.get("tall_components", 0))
    small_ratio = float(metrics.get("small_area_ratio", 0))
    active_col = float(metrics.get("active_col_ratio", 0))
    ink_px = float(metrics.get("ink_pixels", 0))

    img = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if img is None:
        return "UNCERTAIN"
    _, ink = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    num, _, stats, _ = cv2.connectedComponentsWithStats(ink, connectivity=8)
    coherent = 0
    h = img.shape[0]
    for i in range(1, num):
        bh = int(stats[i, cv2.CC_STAT_HEIGHT])
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area >= 40 and bh >= max(5, int(0.2 * h)):
            coherent += 1

    if handoff_field.get("ocr_eligible") and glyph >= 400 and coherent >= 2:
        return "LIKELY_REAL_TEXT"
    if (
        not handoff_field.get("ocr_eligible")
        or glyph < 120
        or (small_ratio > 0.5 and coherent <= 1)
        or (active_col > 0.6 and tall <= 1 and glyph < 300)
    ):
        return "LIKELY_EMPTY_OR_WATERMARK"
    if ink_px > 500 and coherent >= 1:
        return "UNCERTAIN"
    return "LIKELY_EMPTY_OR_WATERMARK"


def low_res_benchmark_tier(
    test_id: str,
    handoff_quality: Optional[str],
    field_row: Dict[str, Any],
    image_metrics: Optional[Dict[str, Any]],
) -> str:
    if test_id == "real13" or handoff_quality == "INPUT_OK_FOR_CROP_BUT_LOW_RES_FOR_OCR":
        if not field_row.get("ocr_eligible"):
            return "REJECTED_BY_POLICY"
        q = (image_metrics or {}).get("ocr_image_quality_class", "")
        if q in ("OCR_IMAGE_TOO_SMALL", "OCR_IMAGE_BLURRED"):
            return "HARD_CASE"
        return "HARD_CASE"
    return "NORMAL"


def inspect_local_ocr() -> Dict[str, Any]:
    py_ver = sys.version.replace("\n", " ")
    items: Dict[str, Any] = {}

    def pip_show(name: str) -> Dict[str, Any]:
        try:
            r = subprocess.run(
                [sys.executable, "-m", "pip", "show", name],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if r.returncode != 0:
                return {"installed": False}
            info = {}
            for line in r.stdout.splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    info[k.strip().lower()] = v.strip()
            return {
                "installed": True,
                "version": info.get("version"),
                "location": info.get("location"),
            }
        except Exception as exc:
            return {"installed": False, "error": str(exc)}

    for pkg in (
        "pytesseract",
        "paddleocr",
        "paddlepaddle",
        "easyocr",
        "rapidocr-onnxruntime",
        "onnxruntime",
        "opencv-python",
    ):
        items[pkg] = pip_show(pkg)

    tess = {"installed": False}
    try:
        r = subprocess.run(["tesseract", "--version"], capture_output=True, text=True, timeout=15)
        if r.returncode == 0:
            tess = {"installed": True, "version_output": r.stdout.splitlines()[:3]}
    except FileNotFoundError:
        tess["note"] = "not in PATH"
    items["tesseract_executable"] = tess
    return {"python": py_ver, "packages": items}


def environment_record() -> Dict[str, Any]:
    ram_gb = None
    try:
        import ctypes

        class MEMORYSTATUSEX(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong),
                ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong),
                ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]

        stat = MEMORYSTATUSEX()
        stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
        ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
        ram_gb = round(stat.ullTotalPhys / (1024**3), 2)
    except Exception:
        pass

    return {
        "os": platform.platform(),
        "cpu": platform.processor() or platform.machine(),
        "python": sys.version.split()[0],
        "ram_gb_total_approx": ram_gb,
        "gpu": "not probed (CPU-first benchmark policy)",
        "constraints": {
            "local_only": True,
            "cpu_capable": True,
            "target_ram_gb": 8,
            "no_cloud_requirement": True,
            "no_paid_api": True,
            "commercial_deployable_licensing_required": True,
        },
    }


def main() -> int:
    audit_dir = OCR_ROOT / "audit"
    manifest_dir = OCR_ROOT / "input_manifest"
    audit_dir.mkdir(parents=True, exist_ok=True)
    manifest_dir.mkdir(parents=True, exist_ok=True)

    release = load_crop_release_record()
    all_handoffs = find_handoffs(CROP_V1_ROOT)

    jobs: List[Dict[str, Any]] = []
    corpus_rows: List[Dict[str, Any]] = []
    seen_canonical: Dict[str, str] = {}

    for test_id, handoff_path in all_handoffs:
        data = json.loads(handoff_path.read_text(encoding="utf-8"))
        job = {
            "test_id": test_id,
            "handoff_path": str(handoff_path),
            "run_id": data.get("run_id"),
            "input_sha256": data.get("input_sha256"),
            "pipeline_status": data.get("pipeline_status"),
            "input_handoff_quality": data.get("input_handoff_quality"),
            "fields": data.get("fields", []),
        }
        jobs.append(job)

        use_in_corpus = test_id in CANONICAL_TEST_IDS
        if use_in_corpus:
            prev = seen_canonical.get(test_id)
            handoff_dir = str(handoff_path.parent)
            if prev and prev != handoff_dir:
                job["corpus_note"] = "duplicate_test_id_skipped"
                use_in_corpus = False
            else:
                seen_canonical[test_id] = handoff_dir

        if not use_in_corpus:
            continue
        if data.get("pipeline_status") != "PIPELINE_COMPLETE":
            continue

        for field in data.get("fields", []):
            crop_path = field.get("crop_path")
            if not crop_path:
                continue
            cp = Path(crop_path)
            if not cp.is_file():
                continue
            crop_sha = sha256_file(cp)
            row = {
                "test_id": test_id,
                "field_name": field.get("field_name"),
                "absolute_crop_path": str(cp.resolve()),
                "crop_sha256": crop_sha,
                "width": field.get("width"),
                "height": field.get("height"),
                "ocr_eligible": bool(field.get("ocr_eligible")),
                "crop_geometry_status": field.get("crop_geometry_status"),
                "content_sanity_status": field.get("content_sanity_status"),
                "source_readability": field.get("source_readability"),
                "input_handoff_quality": data.get("input_handoff_quality"),
            }
            if row["ocr_eligible"]:
                row["image_analysis"] = analyze_crop_image(cp)
                row["low_res_benchmark_tier"] = low_res_benchmark_tier(
                    test_id,
                    data.get("input_handoff_quality"),
                    field,
                    row["image_analysis"],
                )
            else:
                row["image_analysis"] = None
                row["low_res_benchmark_tier"] = low_res_benchmark_tier(
                    test_id, data.get("input_handoff_quality"), field, None
                )
            corpus_rows.append(row)

    # Field statistics
    by_field: Dict[str, List[Dict[str, Any]]] = {f: [] for f in FIELD_ORDER}
    for row in corpus_rows:
        fn = row.get("field_name")
        if fn in by_field:
            by_field[fn].append(row)

    field_stats: Dict[str, Any] = {}
    for fname, rows in by_field.items():
        widths = [int(r["width"]) for r in rows if r.get("width")]
        heights = [int(r["height"]) for r in rows if r.get("height")]
        eligible = [r for r in rows if r.get("ocr_eligible")]

        def med(vals: List[int]) -> Optional[float]:
            return float(statistics.median(vals)) if vals else None

        field_stats[fname] = {
            "total_crops": len(rows),
            "ocr_eligible_crops": len(eligible),
            "rejected_crops": len(rows) - len(eligible),
            "min_width": min(widths) if widths else None,
            "max_width": max(widths) if widths else None,
            "median_width": med(widths),
            "min_height": min(heights) if heights else None,
            "max_height": max(heights) if heights else None,
            "median_height": med(heights),
        }

    quality_dist: Dict[str, int] = {}
    for row in corpus_rows:
        if not row.get("ocr_eligible"):
            continue
        q = (row.get("image_analysis") or {}).get("ocr_image_quality_class", "UNKNOWN")
        quality_dist[q] = quality_dist.get(q, 0) + 1

    padding_summary: Dict[str, Any] = {"by_field": {}, "total_could_benefit": 0}
    for fname in FIELD_ORDER:
        eligible = [
            r
            for r in by_field[fname]
            if r.get("ocr_eligible") and r.get("image_analysis")
        ]
        benefit = sum(
            1 for r in eligible if r["image_analysis"].get("could_benefit_from_ocr_padding")
        )
        padding_summary["by_field"][fname] = {
            "ocr_eligible": len(eligible),
            "could_benefit_from_ocr_padding": benefit,
        }
        padding_summary["total_could_benefit"] += benefit

    real9_job = next((j for j in jobs if j["test_id"] == "real9"), None)
    real9_negative: List[Dict[str, Any]] = []
    if real9_job:
        for field in real9_job["fields"]:
            cp = field.get("crop_path")
            path = Path(cp) if cp else None
            real9_negative.append(
                {
                    "field_name": field.get("field_name"),
                    "ocr_eligible": field.get("ocr_eligible"),
                    "crop_geometry_status": field.get("crop_geometry_status"),
                    "content_sanity_status": field.get("content_sanity_status"),
                    "content_sanity_metrics": field.get("content_sanity_metrics"),
                    "negative_control_class": real9_semantic_class(path, field),
                }
            )

    low_res_cases: List[Dict[str, Any]] = []
    for row in corpus_rows:
        if row.get("low_res_benchmark_tier") != "NORMAL" or row["test_id"] == "real13":
            if row["test_id"] == "real13" or row.get("input_handoff_quality") == (
                "INPUT_OK_FOR_CROP_BUT_LOW_RES_FOR_OCR"
            ):
                low_res_cases.append(
                    {
                        "test_id": row["test_id"],
                        "field_name": row["field_name"],
                        "ocr_eligible": row["ocr_eligible"],
                        "dimensions": f"{row.get('width')}x{row.get('height')}",
                        "image_analysis": row.get("image_analysis"),
                        "benchmark_tier": row.get("low_res_benchmark_tier"),
                    }
                )

    gt_files = list((OCR_ROOT / "ground_truth").glob("*.json"))
    gt_populated = [p for p in gt_files if p.name != "ground_truth.schema.json"]
    ground_truth_status = (
        "GROUND_TRUTH_PRESENT" if any(_has_verified_fields(p) for p in gt_populated) else "GROUND_TRUTH_REQUIRED"
    )

    corpus_doc = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "crop_v1_root": str(CROP_V1_ROOT),
        "crop_release": release,
        "corpus_policy": {
            "canonical_test_ids": sorted(CANONICAL_TEST_IDS),
            "handoff_root": "output/PRE_OCR_HARDENING_REGRESSION (primary)",
            "excluded_scratch": list(SCRATCH_NAMES) + ["_*"],
        },
        "crops": corpus_rows,
    }
    (manifest_dir / "ocr_corpus.json").write_text(
        json.dumps(corpus_doc, indent=2), encoding="utf-8"
    )

    eligible_by_field = {f: field_stats[f]["ocr_eligible_crops"] for f in FIELD_ORDER}

    report = {
        "audit": "OCR_V1_PRE_BENCHMARK",
        "generated_at": corpus_doc["generated_at"],
        "A_crop_release_verified": release,
        "B_handoff_jobs_found": len(jobs),
        "B_handoff_jobs": [
            {
                "test_id": j["test_id"],
                "run_id": j["run_id"],
                "pipeline_status": j["pipeline_status"],
                "input_handoff_quality": j["input_handoff_quality"],
            }
            for j in jobs
        ],
        "C_ocr_eligible_crops_by_field": eligible_by_field,
        "C_total_ocr_eligible_crops": sum(eligible_by_field.values()),
        "D_image_quality_distribution": quality_dist,
        "D_field_statistics": field_stats,
        "E_low_resolution_cases": low_res_cases,
        "F_real9_negative_control": real9_negative,
        "G_ground_truth_availability": {
            "status": ground_truth_status,
            "searched_paths": [str(OCR_ROOT / "ground_truth"), str(CROP_V1_ROOT)],
            "crop_v1_ground_truth_matches": 0,
        },
        "K_local_ocr_software": inspect_local_ocr(),
        "L_environment": environment_record(),
        "corpus_manifest_path": str(manifest_dir / "ocr_corpus.json"),
        "canonical_corpus_jobs": len(seen_canonical),
    }

    (audit_dir / "pre_benchmark_audit_report.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )

    # Supplemental design docs (static)
    write_design_artifacts(audit_dir)

    print(json.dumps({"report": str(audit_dir / "pre_benchmark_audit_report.json"), "corpus": str(manifest_dir / "ocr_corpus.json")}, indent=2))
    return 0


def _has_verified_fields(path: Path) -> bool:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return bool(data.get("fields")) and bool(data.get("verified_by"))
    except Exception:
        return False


def write_design_artifacts(audit_dir: Path) -> None:
    scoring = OCR_ROOT / "config" / "scoring_rules.json"
    scoring.write_text(
        json.dumps(
            {
                "metrics": [
                    "EXACT_MATCH",
                    "NORMALIZED_EXACT_MATCH",
                    "CHARACTER_ERROR_RATE",
                    "FIELD_SUCCESS_RATE",
                    "PER_FIELD_ACCURACY",
                    "DOCUMENT_COMPLETE_ACCURACY",
                    "OCR_REJECT_PRECISION",
                ],
                "normalization": {
                    "dates": {
                        "canonical": "DD/MM/YYYY",
                        "preserve_digits": True,
                        "normalize_whitespace": True,
                        "separator_normalization_tracked_separately": True,
                    },
                    "name_en": {
                        "case_insensitive_secondary_score": True,
                        "preserve_word_order": True,
                        "collapse_spaces": True,
                        "do_not_strip_real_characters": True,
                    },
                    "name_ar": {
                        "unicode_normalize": "NFC",
                        "collapse_spaces": True,
                        "diacritics_ignored_in_secondary_score": True,
                        "no_transliteration": True,
                    },
                    "nationality_place": {
                        "case_insensitive_secondary_score": True,
                        "collapse_spaces": True,
                    },
                    "license_number": {
                        "strip_surrounding_whitespace_only": True,
                        "preserve_all_characters": True,
                    },
                },
                "do_not_use_average_confidence_alone": True,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    validators = OCR_ROOT / "config" / "field_validators_design.json"
    validators.write_text(
        json.dumps(
            {
                "policy": "Validators never invent correct answers; outputs ACCEPT | REJECT | FLAG_UNCERTAIN",
                "fields": {
                    "date_of_birth": ["shape_DD/MM/YYYY", "calendar_valid"],
                    "issue_date": ["shape_DD/MM/YYYY", "calendar_valid"],
                    "expiry_date": ["shape_DD/MM/YYYY", "calendar_valid"],
                    "license_number": ["allowed_charset", "length_range_from_corpus"],
                    "name_en": ["latin_script_spaces"],
                    "name_ar": ["arabic_script"],
                    "nationality": ["latin_text"],
                    "place_of_issue": ["latin_text_spaces"],
                },
                "date_fields_advantage": "Highly constrained; whitelist + regex + calendar check; never guess digits",
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    preproc = OCR_ROOT / "config" / "preprocessing_variants.json"
    preproc.write_text(
        json.dumps(
            {
                "architecture": "Crop V1 PNG (read-only) -> copy -> preprocess -> OCR -> normalize -> validate",
                "never_overwrite_source_crop": True,
                "variants": {
                    "P0_RAW": "original crop unchanged",
                    "P1_PAD": "canvas padding only on copy",
                    "P2_GRAY_PAD": "grayscale + padding on copy",
                    "P3_CONTRAST_PAD": "contrast normalization + padding on copy",
                    "P4_UPSCALE_GRAY_PAD": "2x/3x scale + grayscale + padding on copy",
                    "P5_BINARIZED": "thresholded copy",
                    "P6_SHARPENED": "light sharpen on copy",
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    bench = OCR_ROOT / "benchmark" / "benchmark_design.json"
    bench.parent.mkdir(parents=True, exist_ok=True)
    bench.write_text(
        json.dumps(
            {
                "same_inputs_per_engine": [
                    "source_crop_path",
                    "preprocessing_variant",
                    "ground_truth",
                    "scoring_rules",
                ],
                "per_run_record": [
                    "engine",
                    "engine_version",
                    "model",
                    "language",
                    "preprocessing_variant",
                    "runtime_ms",
                    "raw_text",
                    "engine_confidence",
                    "normalized_text",
                    "validator_result",
                    "exact_match",
                    "cer",
                ],
                "performance": {
                    "ms_per_crop": True,
                    "ms_per_licence": True,
                    "approx_peak_ram": True,
                    "model_load_time": True,
                    "cold_start_vs_warm_inference": True,
                },
                "privacy": "local_only_no_cloud_telemetry",
                "licensing": "LICENCE_VERIFICATION_REQUIRED_per_engine_and_model_weights",
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    split = OCR_ROOT / "benchmark" / "dataset_split_proposal.json"
    split.write_text(
        json.dumps(
            {
                "note": "Small corpus; keep real9 and real13 visible as challenge/negative cases",
                "development_calibration": [
                    "real3",
                    "real5",
                    "real6",
                    "real7",
                    "real8",
                    "real10",
                    "real11",
                    "real12",
                    "real14",
                    "real_01",
                    "real_02",
                ],
                "holdout_test": ["real4", "real02"],
                "special_challenge": {
                    "negative_control": "real9",
                    "low_resolution": "real13",
                },
                "warning": "Holdout is tiny; expand ground truth before trusting holdout metrics",
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    targets = OCR_ROOT / "config" / "acceptance_targets.json"
    targets.write_text(
        json.dumps(
            {
                "dates": ">= 99% normalized exact accuracy",
                "license_number": ">= 99% normalized exact accuracy",
                "name_en": ">= 95% normalized exact or very low CER",
                "nationality": ">= 98%",
                "place_of_issue": ">= 98%",
                "name_ar": "report separately; Arabic expected hardest",
                "document_complete_accuracy": "report explicitly; do not lower targets preemptively",
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    lang = OCR_ROOT / "config" / "language_requirements.json"
    lang.write_text(
        json.dumps(
            {
                "arabic": ["name_ar"],
                "english_latin": ["name_en", "nationality", "place_of_issue"],
                "digits_dates": ["license_number", "date_of_birth", "issue_date", "expiry_date"],
                "benchmark_strategy": "Field-specific engine/config allowed if accuracy improves; compare fairly on same crops",
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    results_plan = OCR_ROOT / "results" / "README.md"
    results_plan.parent.mkdir(parents=True, exist_ok=True)
    results_plan.write_text(
        "# Planned benchmark outputs\n\n"
        "- benchmark_results.csv\n"
        "- benchmark_results.json\n"
        "- per_field_summary.json\n"
        "- engine_summary.json\n"
        "- failure_cases.json\n"
        "- performance_summary.json\n"
        "- visual comparison sheets (later)\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    raise SystemExit(main())
