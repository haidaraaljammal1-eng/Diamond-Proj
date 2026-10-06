"""Offline LICENSE readiness (no HTTP server). See DOCUMENT-ENGINE/INSTALLATION.md."""

from __future__ import annotations

import json
import sys
from pathlib import Path

LICENSE_ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    sys.path.insert(0, str(LICENSE_ROOT))
    from services.uae_license_api.runtime_paths import apply_runtime_environment

    apply_runtime_environment()
    from services.uae_license_api.health import build_health
    from services.uae_license_api.two_field.ocr_pipeline import RELEASE_ID, TwoFieldOcrPipeline

    pipe = TwoFieldOcrPipeline()
    try:
        health = build_health(pipe)
    finally:
        pipe.close()

    print("release_id", RELEASE_ID)
    print(json.dumps(health, indent=2))
    ready = health.get("status") == "READY"
    return 0 if ready else 1


if __name__ == "__main__":
    raise SystemExit(main())
