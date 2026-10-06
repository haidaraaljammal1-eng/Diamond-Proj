from __future__ import annotations

import sys
import threading
from pathlib import Path
from typing import Any

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

# Paddle OCR / OpenCV are not verified thread-safe for concurrent inference.
_INFERENCE_LOCK = threading.Lock()


def run_engine_on_bgr(image_bgr: np.ndarray) -> dict[str, Any]:
    """Call the frozen Passport Number Engine (full-page image in BGR)."""
    from passport_number.extract_passport_number import extract_passport_number_from_image

    with _INFERENCE_LOCK:
        return extract_passport_number_from_image(image_bgr)


def to_public_http_body(internal: dict[str, Any]) -> dict[str, Any]:
    """Map internal engine output to the HTTP API contract (no extra OCR/correction)."""
    if internal.get("passport_number"):
        return {"passport_number": internal["passport_number"], "status": "VALID"}
    return {"passport_number": None, "status": "REVIEW"}
