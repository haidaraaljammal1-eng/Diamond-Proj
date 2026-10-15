"""Production extraction import + HTTP smoke (synthetic image, no PII).

Proves POST /extract-passport-number traverses:
  main → engine_adapter → extract_passport_number → detection_bridge → run_mrz_a2
  → diamond_mrz_acceptance (importable) without ModuleNotFoundError.

Health-only checks are insufficient; this script fails if the engine chain cannot load.
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

PASSPORT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PASSPORT_ROOT))
sys.path.insert(0, str(PASSPORT_ROOT / "scripts"))

from services.passport_number_api.runtime_paths import apply_passport_runtime_environment

apply_passport_runtime_environment()

from fastapi.testclient import TestClient

from diamond_mrz_acceptance import evaluate_mrz_for_diamond  # noqa: E402
from run_mrz_a2 import _params_with_a14  # noqa: E402
from services.passport_number_api.engine_adapter import run_engine_on_bgr  # noqa: E402
from services.passport_number_api.main import app  # noqa: E402


def _synthetic_page_png() -> bytes:
    """Non-PII gradient page — not a passport; only exercises runtime wiring."""
    img = np.linspace(0, 255, 800 * 600, dtype=np.uint8).reshape(600, 800)
    bgr = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        path = Path(tmp.name)
    cv2.imwrite(str(path), bgr)
    data = path.read_bytes()
    path.unlink(missing_ok=True)
    return data


def main() -> int:
    failures: list[str] = []

    # Import / adapter path (same thread entry as HTTP handler).
    blank = np.zeros((800, 600, 3), dtype=np.uint8)
    try:
        internal = run_engine_on_bgr(blank)
    except Exception as exc:  # noqa: BLE001
        failures.append(f"run_engine_on_bgr raised: {exc!r}")
        internal = None

    if internal is None or "status" not in internal:
        failures.append("run_engine_on_bgr did not return production-shaped dict")

    # diamond_mrz_acceptance reachable from run_mrz_a2 import graph.
    try:
        ev = evaluate_mrz_for_diamond("P<GBRDOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<", "AB12345671GBR8001014M3110142<<<<<<<<<<08")
        if ev.status not in ("VALID_FOR_DIAMOND", "VALID", "REVIEW"):
            failures.append(f"unexpected diamond acceptance status: {ev.status}")
    except Exception as exc:  # noqa: BLE001
        failures.append(f"evaluate_mrz_for_diamond raised: {exc!r}")

    try:
        _ = _params_with_a14({})
    except Exception as exc:  # noqa: BLE001
        failures.append(f"_params_with_a14 raised: {exc!r}")

    png = _synthetic_page_png()
    client = TestClient(app)
    response = client.post(
        "/extract-passport-number",
        files={"image": ("synthetic-chain-smoke.png", png, "image/png")},
    )
    if response.status_code == 500:
        body = response.json()
        if body.get("error") == "INTERNAL_ERROR":
            failures.append(f"HTTP 500 INTERNAL_ERROR (import/runtime): {body}")
        else:
            failures.append(f"HTTP 500: {body}")
    elif response.status_code != 200:
        failures.append(f"unexpected HTTP {response.status_code}: {response.text[:200]}")

    payload = {
        "import_chain": internal is not None and not failures,
        "http_status": response.status_code,
        "http_body_status": response.json().get("status") if response.status_code == 200 else None,
        "adapter_status": internal.get("status") if isinstance(internal, dict) else None,
        "failures": failures,
    }
    print(json.dumps(payload, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
