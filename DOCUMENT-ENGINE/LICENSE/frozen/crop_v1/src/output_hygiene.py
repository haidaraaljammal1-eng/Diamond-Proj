"""Clean per-job output directories so stale crops cannot survive failed runs."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Iterable

GENERATED_DIRS = ("value_crops", "row_crops", "template_debug")

GENERATED_FILES = (
    "pipeline_report.json",
    "ocr_handoff.json",
    "run_metadata.json",
)


def _numbered_debug_globs() -> Iterable[str]:
    for i in range(1, 30):
        yield f"{i:02d}_*.png"
    yield "1*.png"
    yield "2*.png"


def clean_job_output(output_dir: Path) -> None:
    """Remove all pipeline-generated artifacts under output_dir (not the dir itself)."""
    output_dir.mkdir(parents=True, exist_ok=True)
    for name in GENERATED_DIRS:
        path = output_dir / name
        if path.is_dir():
            shutil.rmtree(path, ignore_errors=True)
    for name in GENERATED_FILES:
        path = output_dir / name
        if path.is_file():
            path.unlink()
    for pattern in _numbered_debug_globs():
        for path in output_dir.glob(pattern):
            if path.is_file():
                path.unlink()
