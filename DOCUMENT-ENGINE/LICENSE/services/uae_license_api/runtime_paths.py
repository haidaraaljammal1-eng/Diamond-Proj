"""Resolve LICENSE engine roots and apply runtime environment (no Passport coupling)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

LICENSE_ROOT = Path(__file__).resolve().parents[2]
CROP_ROOT = LICENSE_ROOT / "frozen" / "crop_v1"
OCR_ROOT = LICENSE_ROOT / "frozen" / "ocr_v1_2"
OCR_ENGINES_ROOT = LICENSE_ROOT / "frozen" / "ocr_v1_1"
JOBS_ROOT = Path(os.environ.get("LICENSE_JOBS_ROOT", str(LICENSE_ROOT / "jobs")))


def apply_runtime_environment() -> None:
    """Must run before importing frozen OCR/crop packages."""
    os.environ.setdefault("LICENSE_ENGINE_ROOT", str(LICENSE_ROOT))
    os.environ.setdefault(
        "LICENSE_TESSDATA_DIR",
        str((OCR_ENGINES_ROOT / "vendor" / "tessdata").resolve()),
    )
    if "LICENSE_TESSERACT_CMD" not in os.environ:
        default_tesseract = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")
        if default_tesseract.is_file():
            os.environ["LICENSE_TESSERACT_CMD"] = str(default_tesseract)
    v5_win = LICENSE_ROOT / ".venv_ppocrv5" / "Scripts" / "python.exe"
    v5_unix = LICENSE_ROOT / ".venv_ppocrv5" / "bin" / "python"
    if "LICENSE_PPOCRV5_PYTHON" not in os.environ:
        if v5_win.is_file():
            os.environ["LICENSE_PPOCRV5_PYTHON"] = str(v5_win)
        elif v5_unix.is_file():
            os.environ["LICENSE_PPOCRV5_PYTHON"] = str(v5_unix)

    # V1.1 engines/models on sys.path (V1.2 pipeline lives under services/).
    v11 = str(OCR_ENGINES_ROOT.resolve())
    if v11 not in sys.path:
        sys.path.insert(0, v11)
