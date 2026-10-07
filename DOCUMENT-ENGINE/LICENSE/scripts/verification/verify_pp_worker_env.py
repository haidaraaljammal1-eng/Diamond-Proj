"""PP-OCRv5 worker interpreter proof. See DOCUMENT-ENGINE/INSTALLATION.md."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

LICENSE_ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    sys.path.insert(0, str(LICENSE_ROOT))
    from services.uae_license_api.runtime_paths import apply_runtime_environment

    apply_runtime_environment()
    from services.uae_license_api.two_field.ocr_pipeline import TwoFieldOcrPipeline

    pipe = TwoFieldOcrPipeline()
    try:
        pipe.ppocrv5_client.ensure_started()
        pid = pipe.ppocrv5_client.worker_pid
        v5_py = os.environ.get("LICENSE_PPOCRV5_PYTHON", "")
    finally:
        pipe.close()

    payload = {
        "license_root": str(LICENSE_ROOT),
        "pp_worker_python": v5_py,
        "pp_worker_pid": pid,
        "this_interpreter": sys.executable,
        "this_prefix": sys.prefix,
    }
    print(json.dumps(payload, indent=2))
    if not v5_py or not Path(v5_py).is_file():
        return 1
    expected_win = (LICENSE_ROOT / ".venv_ppocrv5" / "Scripts" / "python.exe").resolve()
    expected_unix = (LICENSE_ROOT / ".venv_ppocrv5" / "bin" / "python").resolve()
    actual = Path(v5_py).resolve()
    if actual not in (expected_win, expected_unix):
        print("PP_WORKER_PYTHON_MISMATCH", file=sys.stderr)
        print(f"  expected: {expected_win}", file=sys.stderr)
        print(f"  actual:   {actual}", file=sys.stderr)
        return 2
    return 0 if pid else 3


if __name__ == "__main__":
    raise SystemExit(main())
