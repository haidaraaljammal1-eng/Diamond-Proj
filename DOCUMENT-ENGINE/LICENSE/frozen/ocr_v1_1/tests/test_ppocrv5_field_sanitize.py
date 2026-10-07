"""PP-OCRv5 field-aware sanitize (name vs licence)."""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.inference.name_output import (  # noqa: E402
    sanitize_field_ocr_output,
    sanitize_license_ocr_output,
    sanitize_name_ocr_output,
)


def test_name_unchanged():
    assert sanitize_name_ocr_output(" 99 SMITH ") == "SMITH"
    assert sanitize_field_ocr_output("name_en", " 99 SMITH ") == "SMITH"


def test_license_digits():
    assert sanitize_field_ocr_output("license_number", "260 8080") == "2608080"
    assert sanitize_license_ocr_output("2608080") == "2608080"
