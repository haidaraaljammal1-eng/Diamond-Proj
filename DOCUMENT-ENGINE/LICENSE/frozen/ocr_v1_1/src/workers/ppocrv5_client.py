"""Client for persistent PP-OCRv5 worker subprocess."""

from __future__ import annotations

import json
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Optional

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_WORKER_MODULE = "src.workers.ppocrv5_worker"


def _resolve_v5_python() -> Path:
    import os

    env = os.environ.get("LICENSE_PPOCRV5_PYTHON")
    if env:
        return Path(env)
    license_root = os.environ.get("LICENSE_ENGINE_ROOT")
    if license_root:
        win = Path(license_root) / ".venv_ppocrv5" / "Scripts" / "python.exe"
        if win.is_file():
            return win
        unix = Path(license_root) / ".venv_ppocrv5" / "bin" / "python"
        if unix.is_file():
            return unix
    win = _PROJECT_ROOT / "venv_ppocrv5" / "Scripts" / "python.exe"
    if win.is_file():
        return win
    return _PROJECT_ROOT / "venv_ppocrv5" / "bin" / "python"


class Ppocrv5WorkerClient:
    def __init__(
        self,
        timeout_s: float = 120.0,
        enabled: bool = True,
    ) -> None:
        self._enabled = enabled
        self._timeout_s = timeout_s
        self._proc: Optional[subprocess.Popen[str]] = None
        self._lock = threading.Lock()
        self._cold_start_ms: Optional[float] = None
        self._start_attempts = 0

    @property
    def worker_pid(self) -> Optional[int]:
        return self._proc.pid if self._proc and self._proc.poll() is None else None

    def _start_worker(self) -> None:
        v5_py = _resolve_v5_python()
        if not v5_py.is_file():
            raise FileNotFoundError(f"PP-OCRv5 venv missing: {v5_py}")
        t0 = time.perf_counter()
        self._proc = subprocess.Popen(
            [str(v5_py), "-m", _WORKER_MODULE],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
            cwd=str(_PROJECT_ROOT),
        )
        self._cold_start_ms = (time.perf_counter() - t0) * 1000.0
        self._start_attempts += 1
        rid = str(uuid.uuid4())
        assert self._proc.stdin and self._proc.stdout
        self._proc.stdin.write(json.dumps({"command": "ping", "request_id": rid}) + "\n")
        self._proc.stdin.flush()
        line = self._proc.stdout.readline()
        if not line:
            self._terminate()
            raise RuntimeError("PP-OCRv5 worker failed ping: no response")
        ping = json.loads(line)
        if ping.get("status") not in ("READY",):
            err = ping.get("error") or ping.get("status")
            self._terminate()
            raise RuntimeError(f"PP-OCRv5 worker failed ping: {err}")

    def _terminate(self) -> None:
        if self._proc is None:
            return
        try:
            if self._proc.poll() is None and self._proc.stdin:
                try:
                    self._proc.stdin.write(
                        json.dumps({"command": "shutdown", "request_id": "shutdown"}) + "\n"
                    )
                    self._proc.stdin.flush()
                except Exception:
                    pass
            self._proc.terminate()
            try:
                self._proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._proc.kill()
        finally:
            self._proc = None

    def close(self) -> None:
        with self._lock:
            self._terminate()

    def __enter__(self) -> Ppocrv5WorkerClient:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()

    def ensure_started(self) -> None:
        with self._lock:
            if self._proc is None or self._proc.poll() is not None:
                self._start_worker()

    def ping(self) -> dict[str, Any]:
        self.ensure_started()
        return self._request({"command": "ping"}, _retry=False)

    def recognize(self, crop_path: str, field_name: str = "name_en") -> dict[str, Any]:
        if not self._enabled:
            return {"status": "ENGINE_ERROR", "error": "worker disabled"}
        req_id = str(uuid.uuid4())
        payload = {
            "request_id": req_id,
            "command": "recognize",
            "field_name": field_name,
            "crop_path": str(crop_path),
        }
        return self._request(payload, _retry=True)

    def _request(self, payload: dict[str, Any], _retry: bool) -> dict[str, Any]:
        attempts = 2 if _retry else 1
        last_err: Optional[str] = None
        for attempt in range(attempts):
            with self._lock:
                if self._proc is None or self._proc.poll() is not None:
                    if attempt > 0 or self._proc is not None:
                        self._terminate()
                    self._start_worker()
                assert self._proc is not None and self._proc.stdin and self._proc.stdout
                line = json.dumps(payload) + "\n"
                try:
                    self._proc.stdin.write(line)
                    self._proc.stdin.flush()
                except (BrokenPipeError, OSError) as e:
                    last_err = str(e)
                    self._terminate()
                    continue
                deadline = time.perf_counter() + self._timeout_s
                while time.perf_counter() < deadline:
                    if self._proc.poll() is not None:
                        last_err = "worker exited"
                        self._terminate()
                        break
                    resp_line = self._proc.stdout.readline()
                    if not resp_line:
                        time.sleep(0.01)
                        continue
                    resp = json.loads(resp_line)
                    if payload.get("request_id") and resp.get("request_id") != payload.get(
                        "request_id"
                    ):
                        continue
                    return resp
                last_err = "timeout"
                self._terminate()
        return {
            "request_id": payload.get("request_id"),
            "status": "ENGINE_ERROR",
            "error": last_err or "worker request failed",
            "raw_text": "",
            "confidence": None,
            "runtime_ms": 0.0,
        }
