"""Portable Passport runtime (repo-local Paddle cache; no hard dependency on developer profile)."""

from __future__ import annotations

import os
from pathlib import Path

PASSPORT_ROOT = Path(__file__).resolve().parents[2]


def apply_passport_runtime_environment() -> None:
    """Call before any Paddle/PaddleX import in this process."""
    os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
    paddle_home = Path(
        os.environ.get("PASSPORT_PADDLE_HOME", str(PASSPORT_ROOT / ".paddle-home"))
    ).resolve()
    paddle_home.mkdir(parents=True, exist_ok=True)
    os.environ["PASSPORT_PADDLE_HOME"] = str(paddle_home)
    # PaddleX resolves models under Path.home() / ".paddlex"
    os.environ["USERPROFILE"] = str(paddle_home)
    os.environ["HOME"] = str(paddle_home)
