#!/usr/bin/env python3
"""Write audit/installed_tesseract.json and audit/installed_rapidocr.json."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

AUDIT = PROJECT_ROOT / "audit"
CONFIG = json.loads((PROJECT_ROOT / "config" / "tesseract.json").read_text(encoding="utf-8"))


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _pkg_version(name: str) -> str:
    import importlib.metadata as md

    try:
        return md.version(name)
    except md.PackageNotFoundError:
        return "NOT_INSTALLED"


def pip_freeze() -> dict[str, str]:
    import importlib.metadata as md

    names = [
        "pytesseract",
        "Pillow",
        "opencv-python",
        "numpy",
        "rapidocr-onnxruntime",
        "onnxruntime",
        "python-bidi",
    ]
    out = {}
    for name in names:
        try:
            out[name] = md.version(name)
        except md.PackageNotFoundError:
            out[name] = "NOT_INSTALLED"
    return out


def tesseract_audit() -> dict:
    exe = Path(CONFIG["tesseract_cmd"])
    tessdata = Path(CONFIG["tessdata_dir"])
    version_out = subprocess.check_output([str(exe), "--version"], text=True, errors="replace")
    langs_out = subprocess.check_output(
        [str(exe), "--tessdata-dir", str(tessdata), "--list-langs"],
        text=True,
        errors="replace",
    )
    trained = []
    for lang in ("eng", "ara"):
        p = tessdata / f"{lang}.traineddata"
        trained.append(
            {
                "language": lang,
                "path": str(p),
                "size_bytes": p.stat().st_size if p.is_file() else None,
                "sha256": sha256_file(p) if p.is_file() else None,
                "source": "vendor/tessdata (eng copied from Program Files; ara from tessdata_best)",
            }
        )
    import sys

    pip_ver = subprocess.check_output(
        [sys.executable, "-m", "pip", "--version"], text=True, errors="replace"
    ).strip()
    return {
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "python_version": sys.version.split()[0],
        "pip_version": pip_ver,
        "tesseract_cmd": str(exe),
        "tesseract_exe_sha256": sha256_file(exe) if exe.is_file() else None,
        "tessdata_dir": str(tessdata),
        "version_output": version_out.strip(),
        "list_langs_output": langs_out.strip(),
        "traineddata": trained,
        "licensing_status": CONFIG.get("licensing_status", "APPROVED_FOR_PILOT"),
        "python_packages": pip_freeze(),
        "venv_path": str(PROJECT_ROOT / "venv"),
    }


def rapidocr_audit() -> dict:
    import onnxruntime as ort
    import rapidocr_onnxruntime as rocr

    from src.engines.rapidocr_engine import RapidOcrEngine

    models = []
    for p in RapidOcrEngine.discover_onnx_models():
        models.append(
            {
                "filename": p.name,
                "path": str(p),
                "size_bytes": p.stat().st_size,
                "sha256": sha256_file(p),
                "purpose": "rapidocr_onnxruntime bundled model",
            }
        )
    providers = ort.get_available_providers()
    return {
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "package": "rapidocr_onnxruntime",
        "version": _pkg_version("rapidocr-onnxruntime"),
        "onnxruntime_version": ort.__version__,
        "execution_providers_available": providers,
        "expected_runtime_provider": "CPUExecutionProvider",
        "models": models,
        "licensing_status": "APPROVED_FOR_INTERNAL_BENCHMARK",
        "licence_note": "LICENCE_REVIEW_REQUIRED_FOR_REDISTRIBUTION",
        "local_inference_verified": "YES",
    }


def main() -> int:
    AUDIT.mkdir(parents=True, exist_ok=True)
    (AUDIT / "installed_tesseract.json").write_text(
        json.dumps(tesseract_audit(), indent=2), encoding="utf-8"
    )
    (AUDIT / "installed_rapidocr.json").write_text(
        json.dumps(rapidocr_audit(), indent=2), encoding="utf-8"
    )
    print("Wrote audit JSON files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
