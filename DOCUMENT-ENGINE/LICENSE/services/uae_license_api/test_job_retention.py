"""Focused retention tests for per-request licence job workspaces."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from services.uae_license_api.orchestrator import release_job_workspace


class JobRetentionTests(unittest.TestCase):
    def test_release_job_workspace_removes_entire_job_dir_when_disabled(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            job_dir = Path(root) / "job-1"
            (job_dir / "input").mkdir(parents=True)
            (job_dir / "input" / "original.jpg").write_bytes(b"jpeg")
            (job_dir / "crop").mkdir()
            (job_dir / "crop" / "pipeline_report.json").write_text("{}", encoding="utf-8")

            release_job_workspace(job_dir, keep_artifacts=False)
            self.assertFalse(job_dir.exists())

    def test_release_job_workspace_keeps_job_when_enabled(self) -> None:
        with tempfile.TemporaryDirectory() as root:
            job_dir = Path(root) / "job-2"
            (job_dir / "input").mkdir(parents=True)
            (job_dir / "input" / "original.png").write_bytes(b"png")

            release_job_workspace(job_dir, keep_artifacts=True)
            self.assertTrue((job_dir / "input" / "original.png").is_file())


if __name__ == "__main__":
    unittest.main()
