"""Per-run metadata for crop jobs."""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


@dataclass
class RunMetadata:
    run_id: str
    input_path: str
    input_sha256: str
    started_at: str
    completed_at: Optional[str] = None
    pipeline_status: str = "RUNNING"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "run_id": self.run_id,
            "input_path": self.input_path,
            "input_sha256": self.input_sha256,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "pipeline_status": self.pipeline_status,
        }


def begin_run(input_path: Path) -> RunMetadata:
    now = datetime.now(timezone.utc).isoformat()
    return RunMetadata(
        run_id=uuid.uuid4().hex,
        input_path=str(input_path.resolve()),
        input_sha256=sha256_file(input_path),
        started_at=now,
        pipeline_status="RUNNING",
    )


def finish_run(meta: RunMetadata, pipeline_status: str) -> None:
    meta.completed_at = datetime.now(timezone.utc).isoformat()
    meta.pipeline_status = pipeline_status


def write_run_metadata(output_dir: Path, meta: RunMetadata) -> Path:
    path = output_dir / "run_metadata.json"
    import json

    path.write_text(json.dumps(meta.to_dict(), indent=2), encoding="utf-8")
    return path
