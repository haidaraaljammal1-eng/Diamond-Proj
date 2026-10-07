"""One-shot: refresh workspace + build development review pack (no OCR)."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

PYTHON = Path(r"C:\Users\Rw\UAE_LICENSE_CROP_V2\venv\Scripts\python.exe")
ROOT = Path(__file__).resolve().parents[1]


def _run(module: str) -> None:
    env = {**dict(__import__("os").environ), "PYTHONPATH": str(ROOT)}
    r = subprocess.run(
        [str(PYTHON), "-m", module],
        cwd=str(ROOT),
        env=env,
    )
    if r.returncode != 0:
        raise SystemExit(r.returncode)


def main() -> int:
    _run("scripts.init_ground_truth_workspace")
    _run("scripts.prepare_development_review_pack")
    print(
        json.dumps(
            {
                "status": "DEVELOPMENT_REVIEW_PREP_COMPLETE",
                "next_command": (
                    f"{PYTHON} -m scripts.review_development_set --reviewer YOUR_INITIALS"
                ),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
