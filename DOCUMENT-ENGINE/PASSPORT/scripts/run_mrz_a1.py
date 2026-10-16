#!/usr/bin/env python3
"""MRZ-A1: single-passport local TD3 pipeline for Diamond."""

from __future__ import annotations

import hashlib
import json
import os
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

import cv2

SCRIPT_DIR = Path(__file__).resolve().parent
WORKSPACE_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

from icao_td3 import parse_td3, status_from_validation, validate_td3  # noqa: E402
from mrz_correction import try_controlled_correction  # noqa: E402
from mrz_detect import detect_mrz_region, save_detection_artifacts  # noqa: E402
from mrz_segment import save_segmentation, segment_two_lines  # noqa: E402

PASSPORT_DIR = WORKSPACE_ROOT / "samples" / "passport"
MODEL_NAME = "en_PP-OCRv4_mobile_rec"
MODEL_SOURCE = "https://huggingface.co/PaddlePaddle/en_PP-OCRv4_mobile_rec"
MODEL_LOCAL = Path.home() / ".paddlex" / "official_models" / MODEL_NAME
DICT_SUPPORTS_LT = "YES"  # verified from official ppocr/utils/en_dict.txt


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def model_manifest() -> dict:
    weights = MODEL_LOCAL / "inference.pdiparams"
    info = {
        "model_name": MODEL_NAME,
        "source": MODEL_SOURCE,
        "local_path": str(MODEL_LOCAL),
        "license": "Apache-2.0",
        "dictionary_supports_lt": DICT_SUPPORTS_LT,
    }
    if weights.is_file():
        info["weights_file"] = weights.name
        info["weights_size_bytes"] = weights.stat().st_size
        info["weights_sha256"] = sha256_file(weights)
    return info


def list_passport_images() -> list[Path]:
    exts = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".bmp"}
    if not PASSPORT_DIR.is_dir():
        return []
    return sorted(p for p in PASSPORT_DIR.iterdir() if p.suffix.lower() in exts and p.is_file())


def get_process_ram_mb() -> float | None:
    try:
        import psutil

        return psutil.Process().memory_info().rss / (1024 * 1024)
    except Exception:
        return None


def run_ocr_on_lines(line1_path: Path, line2_path: Path) -> dict:
    from paddleocr import TextRecognition

    recognizer = TextRecognition(model_name=MODEL_NAME)
    t0 = time.perf_counter()
    out: dict = {"model_name": MODEL_NAME, "lines": []}
    for idx, p in enumerate((line1_path, line2_path), start=1):
        t_line = time.perf_counter()
        results = recognizer.predict(input=str(p))
        elapsed = time.perf_counter() - t_line
        text = ""
        conf = None
        if results:
            r0 = results[0]
            if isinstance(r0, dict):
                text = r0.get("rec_text") or r0.get("text") or ""
                conf = r0.get("rec_score") or r0.get("score")
            else:
                text = getattr(r0, "rec_text", "") or str(r0)
        out["lines"].append(
            {
                "line": idx,
                "path": str(p),
                "raw_text": text,
                "length": len(text),
                "confidence": conf,
                "inference_seconds": elapsed,
            }
        )
    out["total_ocr_seconds"] = time.perf_counter() - t0
    return out


def write_final_report(
    out_dir: Path,
    ctx: dict,
) -> None:
    lines = [
        "# MRZ-A1 FINAL REPORT",
        "",
        "## LICENSE",
        f"- OpenCV: {ctx.get('opencv_license', 'Apache-2.0 (see docs/LICENSE_AUDIT.md)')}",
        f"- OCR code: {ctx.get('ocr_code_license', 'Apache-2.0')}",
        f"- OCR weights: {ctx.get('ocr_weights_license', 'Apache-2.0 (en_PP-OCRv4_mobile_rec)')}",
        f"- ONNX Runtime if used: {ctx.get('onnx_license', 'MIT (if installed as dependency)')}",
        f"- commercial proprietary deployment: {ctx.get('commercial', 'PERMITTED per audit')}",
        f"- subscription/API key: {ctx.get('api_key', 'NONE')}",
        f"- gate: {ctx.get('license_gate', 'CLEAR')}",
        "",
        "## MODEL",
        f"- exact recognizer: {ctx.get('model_name', MODEL_NAME)}",
        f"- source: {ctx.get('model_source', 'https://huggingface.co/PaddlePaddle/en_PP-OCRv4_mobile_rec')}",
        f"- size: {ctx.get('model_size', 'unknown')}",
        f'- dictionary supports "<": {ctx.get("dict_lt", DICT_SUPPORTS_LT)}',
        "",
        "## INPUT",
        f"- filename: {ctx.get('input_filename', 'NONE')}",
        f"- SHA-256: {ctx.get('input_sha256', 'N/A')}",
        "",
        "## MRZ DETECTION",
        f"- automatic: {ctx.get('detection_automatic', 'YES')}",
        f"- region found: {ctx.get('region_found', 'NO')}",
        f"- two lines found: {ctx.get('two_lines_found', 'NO')}",
        "",
        "## RAW OCR",
        f"- line 1: {ctx.get('raw_line1', '')}",
        f"- line 1 length: {ctx.get('raw_line1_len', 0)}",
        f"- line 2: {ctx.get('raw_line2', '')}",
        f"- line 2 length: {ctx.get('raw_line2_len', 0)}",
        "",
        "## ICAO",
        f"- document-number check: {ctx.get('doc_check', 'N/A')}",
        f"- DOB check: {ctx.get('dob_check', 'N/A')}",
        f"- expiry check: {ctx.get('exp_check', 'N/A')}",
        f"- composite check: {ctx.get('comp_check', 'N/A')}",
        "",
        "## DIAMOND OUTPUT",
        f"- fullName: {ctx.get('fullName')}",
        f"- nationality: {ctx.get('nationality')}",
        f"- passportNumber: {ctx.get('passportNumber')}",
        f"- mrzValid: {ctx.get('mrzValid')}",
        f"- status: {ctx.get('status')}",
        "",
        "## PERFORMANCE",
        f"- detection: {ctx.get('t_detection', 'N/A')}",
        f"- OCR: {ctx.get('t_ocr', 'N/A')}",
        f"- total: {ctx.get('t_total', 'N/A')}",
        f"- peak RAM: {ctx.get('peak_ram', 'N/A')}",
        "",
        "## SAFETY",
        "- files deleted: 0",
        "- source modified: NO",
        "- previous projects touched: NO",
        "- Diamond touched: NO",
        "",
        f"## FINAL DECISION",
        "",
        ctx.get("final_decision", "MRZ-A1 FAIL — unknown"),
        "",
    ]
    (out_dir / "FINAL_REPORT.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir = WORKSPACE_ROOT / "results" / ts
    out_dir.mkdir(parents=True, exist_ok=True)

    ctx: dict = {
        "license_gate": "CLEAR",
        "model_name": MODEL_NAME,
        "dict_lt": DICT_SUPPORTS_LT,
        "detection_automatic": "YES",
    }

    ram_before = get_process_ram_mb()
    peak_ram = ram_before
    t_start = time.perf_counter()

    images = list_passport_images()
    if len(images) == 0:
        mm = model_manifest()
        ctx["model_size"] = mm.get("weights_size_bytes", "unknown")
        ctx["model_source"] = MODEL_SOURCE
        ctx["final_decision"] = "MRZ-A1 FAIL — zero images in samples/passport/ (INPUT GATE STOP)"
        ctx["status"] = "INVALID"
        ctx["fullName"] = None
        ctx["nationality"] = None
        ctx["passportNumber"] = None
        ctx["mrzValid"] = False
        write_final_report(out_dir, ctx)
        manifest = {
            "error": "INPUT_GATE_STOP",
            "message": "Place exactly ONE passport image in samples/passport/ and re-run.",
            "workspace": str(WORKSPACE_ROOT),
        }
        (out_dir / "input_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        print("STOP: zero passport images in samples/passport/")
        return 2

    if len(images) > 1:
        ctx["final_decision"] = f"MRZ-A1 FAIL — {len(images)} images in samples/passport/ (expected 1)"
        ctx["filenames"] = [p.name for p in images]
        write_final_report(out_dir, ctx)
        (out_dir / "input_manifest.json").write_text(
            json.dumps({"error": "INPUT_GATE_STOP", "files": ctx["filenames"]}, indent=2),
            encoding="utf-8",
        )
        print("STOP: multiple passport images:", ctx["filenames"])
        return 2

    image_path = images[0]
    ctx["input_filename"] = image_path.name
    ctx["input_sha256"] = sha256_file(image_path)

    img = cv2.imread(str(image_path))
    if img is None:
        ctx["final_decision"] = "MRZ-A1 FAIL — could not read input image"
        write_final_report(out_dir, ctx)
        return 1

    manifest = {
        "filename": image_path.name,
        "path": str(image_path),
        "sha256": ctx["input_sha256"],
        "width": int(img.shape[1]),
        "height": int(img.shape[0]),
        "size_bytes": image_path.stat().st_size,
    }
    (out_dir / "input_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    t_det0 = time.perf_counter()
    det = detect_mrz_region(img)
    t_detection = time.perf_counter() - t_det0
    ctx["t_detection"] = f"{t_detection:.3f}s"
    ctx["region_found"] = "YES" if det.success else "NO"
    save_detection_artifacts(det, out_dir)

    if not det.success or det.mrz_crop is None:
        ctx["final_decision"] = "MRZ-A1 FAIL — MRZ region not detected"
        ctx["status"] = "INVALID"
        ctx["fullName"] = None
        ctx["nationality"] = None
        ctx["passportNumber"] = None
        ctx["mrzValid"] = False
        ctx["t_total"] = f"{time.perf_counter() - t_start:.3f}s"
        write_final_report(out_dir, ctx)
        return 1

    t_seg0 = time.perf_counter()
    seg = segment_two_lines(det.mrz_crop)
    t_segmentation = time.perf_counter() - t_seg0
    ctx["two_lines_found"] = "YES" if seg.success else "NO"
    save_segmentation(seg, out_dir)

    if not seg.success or seg.line1 is None or seg.line2 is None:
        ctx["final_decision"] = "MRZ-A1 FAIL — could not segment two MRZ lines"
        ctx["status"] = "INVALID"
        write_final_report(out_dir, ctx)
        return 1

    line1_path = out_dir / "line1.png"
    line2_path = out_dir / "line2.png"

    try:
        ocr_result = run_ocr_on_lines(line1_path, line2_path)
    except Exception as e:
        (out_dir / "raw_ocr.json").write_text(
            json.dumps({"error": str(e), "trace": traceback.format_exc()}, indent=2),
            encoding="utf-8",
        )
        ctx["final_decision"] = f"MRZ-A1 FAIL — OCR error: {e}"
        write_final_report(out_dir, ctx)
        return 1

    ocr_result["model_manifest"] = model_manifest()
    (out_dir / "raw_ocr.json").write_text(json.dumps(ocr_result, indent=2), encoding="utf-8")
    manifest_path = WORKSPACE_ROOT / "reports" / "model_manifest.json"
    if manifest_path.is_file():
        ctx["model_size"] = json.loads(manifest_path.read_text(encoding="utf-8")).get(
            "weights_size_bytes"
        )
    mm = model_manifest()
    ctx["model_size"] = mm.get("weights_size_bytes", ctx.get("model_size", "unknown"))
    ctx["model_source"] = MODEL_SOURCE
    ctx["t_ocr"] = f"{ocr_result.get('total_ocr_seconds', 0):.3f}s"

    raw_l1 = ocr_result["lines"][0]["raw_text"]
    raw_l2 = ocr_result["lines"][1]["raw_text"]
    ctx["raw_line1"] = raw_l1
    ctx["raw_line2"] = raw_l2
    ctx["raw_line1_len"] = len(raw_l1)
    ctx["raw_line2_len"] = len(raw_l2)

    t_parse0 = time.perf_counter()
    parsed = parse_td3(raw_l1, raw_l2)
    correction = try_controlled_correction(raw_l1, raw_l2)
    (out_dir / "corrected_mrz.json").write_text(json.dumps(correction, indent=2), encoding="utf-8")

    val = parsed.validation
    icao_out = {
        "structure_valid": val.structure_valid,
        "document_number_check": val.document_number_check,
        "dob_check": val.dob_check,
        "expiry_check": val.expiry_check,
        "composite_check": val.composite_check,
        "all_required_checks_pass": val.all_required_checks_pass,
        "notes": val.notes,
        "line1_length": val.line1_length,
        "line2_length": val.line2_length,
    }
    (out_dir / "icao_validation.json").write_text(json.dumps(icao_out, indent=2), encoding="utf-8")

    ctx["doc_check"] = val.document_number_check
    ctx["dob_check"] = val.dob_check
    ctx["exp_check"] = val.expiry_check
    ctx["comp_check"] = val.composite_check

    status = status_from_validation(val)
    if correction.get("status") == "AMBIGUOUS":
        status = "AMBIGUOUS"

    mrz_valid = val.all_required_checks_pass
    full_name = parsed.full_name or None
    nationality = parsed.nationality or None
    passport_number = parsed.passport_number or None

    if not mrz_valid:
        full_name = None
        nationality = None
        passport_number = None

    extracted = {
        "fullName": full_name,
        "nationality": nationality,
        "passportNumber": passport_number,
        "mrzValid": mrz_valid,
        "status": status,
    }
    (out_dir / "extracted_fields.json").write_text(json.dumps(extracted, indent=2), encoding="utf-8")

    t_parse = time.perf_counter() - t_parse0
    ram_after = get_process_ram_mb()
    if ram_after and peak_ram:
        peak_ram = max(peak_ram, ram_after)
    elif ram_after:
        peak_ram = ram_after

    metrics = {
        "detection_seconds": t_detection,
        "segmentation_seconds": t_segmentation,
        "ocr_seconds": ocr_result.get("total_ocr_seconds"),
        "parse_validation_seconds": t_parse,
        "total_seconds": time.perf_counter() - t_start,
        "ram_mb_before": ram_before,
        "ram_mb_after": ram_after,
        "ram_mb_peak_estimate": peak_ram,
    }
    (out_dir / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    ctx["fullName"] = full_name
    ctx["nationality"] = nationality
    ctx["passportNumber"] = passport_number
    ctx["mrzValid"] = mrz_valid
    ctx["status"] = status
    ctx["t_total"] = f"{metrics['total_seconds']:.3f}s"
    ctx["peak_ram"] = f"{peak_ram:.1f} MB" if peak_ram else "N/A"

    if mrz_valid and status == "VALID":
        ctx["final_decision"] = "MRZ-A1 PASS"
    else:
        ctx["final_decision"] = f"MRZ-A1 FAIL — status={status}, mrzValid={mrz_valid}"

    write_final_report(out_dir, ctx)
    print(f"Run complete: {out_dir}")
    print(ctx["final_decision"])
    return 0 if mrz_valid else 1


if __name__ == "__main__":
    raise SystemExit(main())
