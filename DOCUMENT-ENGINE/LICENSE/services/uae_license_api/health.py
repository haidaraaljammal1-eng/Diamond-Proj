"""Readiness checks for Crop V1 + OCR V1.1 runtimes."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from services.uae_license_api.runtime_paths import CROP_ROOT, LICENSE_ROOT, OCR_ENGINES_ROOT, OCR_ROOT


def _sha256_file(path: Path) -> str | None:
    if not path.is_file():
        return None
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check_crop_runtime() -> dict[str, Any]:
    manifest_path = CROP_ROOT / "release" / "DYNAMIC_CROP_V1" / "template_manifest.json"
    templates = CROP_ROOT / "label_templates"
    layout = CROP_ROOT / "config" / "crop_layout.json"
    ok = manifest_path.is_file() and templates.is_dir() and layout.is_file()
    detail: dict[str, Any] = {"manifest": manifest_path.is_file(), "templates_dir": templates.is_dir()}
    if ok:
        try:
            import os
            import subprocess
            import sys

            py = sys.executable
            script = (
                "from src.template_manifest import verify_template_manifest; "
                "import sys; "
                f"ok, msg = verify_template_manifest("
                f"__import__('pathlib').Path(r'{templates}'), "
                f"__import__('pathlib').Path(r'{manifest_path}')); "
                "print('OK' if ok else 'FAIL'); print(msg)"
            )
            env = {**os.environ, "PYTHONPATH": str(CROP_ROOT.resolve())}
            proc = subprocess.run(
                [py, "-c", script],
                cwd=str(CROP_ROOT),
                env=env,
                capture_output=True,
                text=True,
                timeout=60,
            )
            lines = (proc.stdout or "").splitlines()
            msg = lines[-1] if lines else (proc.stderr or "crop verify failed")
            ok_manifest = proc.returncode == 0 and lines and lines[0] == "OK"
            detail["template_manifest"] = msg
            if not ok_manifest:
                ok = False
        except Exception as exc:
            ok = False
            detail["template_manifest"] = str(exc)
    expected = (
        CROP_ROOT / "release" / "DYNAMIC_CROP_V1" / "release_metadata.json"
    )
    if expected.is_file():
        meta = json.loads(expected.read_text(encoding="utf-8"))
        detail["release"] = meta.get("release")
    return {"ok": ok, "detail": detail}


def check_tesseract() -> dict[str, Any]:
    try:
        from src.engines.tesseract_english import TesseractEnglishEngine

        eng = TesseractEnglishEngine()
        eng.cold_init()
        return {"ok": True, "version": eng._version}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def check_rapidocr() -> dict[str, Any]:
    model = OCR_ENGINES_ROOT / "vendor" / "rapidocr_en" / "en_PP-OCRv4_rec_infer.onnx"
    if not model.is_file():
        return {"ok": False, "error": "missing rapidocr model", "path": str(model)}
    try:
        from src.engines.rapidocr_english import RapidOcrEnglishEngine

        eng = RapidOcrEnglishEngine()
        eng.cold_init()
        return {"ok": True, "model_sha256": _sha256_file(model)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def check_ppocrv5_worker(pipeline: Any) -> dict[str, Any]:
    client = getattr(pipeline, "ppocrv5_client", None)
    if client is None:
        return {"ok": False, "error": "ppocrv5_client_missing"}
    try:
        client.ensure_started()
        resp = client.ping()
        ok = resp.get("status") == "READY"
        return {
            "ok": ok,
            "worker_pid": client.worker_pid,
            "ping_status": resp.get("status"),
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def check_model_integrity() -> dict[str, Any]:
    manifest = OCR_ENGINES_ROOT / "release" / "OCR_ENGLISH_V1_1_RUNTIME" / "model_manifest.json"
    if not manifest.is_file():
        return {"ok": True, "note": "no frozen manifest to verify"}
    data = json.loads(manifest.read_text(encoding="utf-8"))
    mismatches = []
    for _key, art in data.get("artifacts", {}).items():
        rel = art.get("path", "")
        if "UAE_LICENSE_OCR_V1" in rel:
            name = Path(rel).name
            local = None
            if "tessdata" in rel:
                local = OCR_ENGINES_ROOT / "vendor" / "tessdata" / name
            elif "ppocrv5" in rel:
                local = OCR_ENGINES_ROOT / "vendor" / "ppocrv5_en" / name
            elif "rapidocr" in rel:
                local = OCR_ENGINES_ROOT / "vendor" / "rapidocr_en" / name
            if local and local.is_file():
                expected = art.get("sha256")
                actual = _sha256_file(local)
                if expected and actual != expected:
                    mismatches.append({"file": str(local), "expected": expected, "actual": actual})
    return {"ok": len(mismatches) == 0, "mismatches": mismatches}


def build_health(pipeline: Any) -> dict[str, Any]:
    components = {
        "crop_v1": check_crop_runtime(),
        "tesseract": check_tesseract(),
        "rapidocr_v4": check_rapidocr(),
        "ppocrv5_worker": check_ppocrv5_worker(pipeline),
        "model_integrity": check_model_integrity(),
        "license_root": str(LICENSE_ROOT),
    }
    ready = all(
        components[k].get("ok")
        for k in ("crop_v1", "tesseract", "rapidocr_v4", "ppocrv5_worker", "model_integrity")
    )
    return {
        "status": "READY" if ready else "NOT_READY",
        "service": "uae-license-api",
        "engine": "OCR_ENGLISH_V1_3_1_TWO_FIELD",
        "components": components,
    }
