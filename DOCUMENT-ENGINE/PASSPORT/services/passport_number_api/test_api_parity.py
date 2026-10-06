#!/usr/bin/env python3
"""Verify API responses match direct engine calls (no engine changes)."""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from passport_number.extract_passport_number import extract_passport_number_from_image
from services.passport_number_api.engine_adapter import to_public_http_body
from services.passport_number_api.main import app

SYR = ROOT / "results" / "mrz_a2" / "20260930T134456Z" / "01_original_reference.png"
DEU = ROOT / "results" / "mrz_a2" / "20260930T214256Z" / "01_original_reference.png"


def direct(path: Path) -> dict:
    bgr = cv2.imread(str(path))
    assert bgr is not None
    return to_public_http_body(extract_passport_number_from_image(bgr))


def main() -> None:
    client = TestClient(app)
    failures = []

    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok", r.text

    r = client.post("/extract-passport-number")
    assert r.status_code == 400 and r.json()["error"] == "MISSING_IMAGE"

    r = client.post(
        "/extract-passport-number",
        files={"image": ("x.txt", b"not an image", "text/plain")},
    )
    assert r.status_code == 415 and r.json()["error"] == "UNSUPPORTED_MEDIA_TYPE"

    r = client.post(
        "/extract-passport-number",
        files={"image": ("x.png", b"not an image", "image/png")},
    )
    assert r.status_code == 400 and r.json()["error"] == "INVALID_IMAGE"

    for label, path in [("SYR_PASS", SYR), ("DEU_REVIEW", DEU)]:
        if not path.is_file():
            print(f"SKIP {label} missing {path}")
            continue
        expected = direct(path)
        with path.open("rb") as f:
            r = client.post(
                "/extract-passport-number",
                files={"image": (path.name, f, "image/png")},
            )
        if r.status_code != 200:
            failures.append(f"{label}: HTTP {r.status_code} {r.text}")
            continue
        if r.json() != expected:
            failures.append(f"{label}: API {r.json()} != direct {expected}")

    # Sequential duplicate requests
    if SYR.is_file():
        with SYR.open("rb") as f:
            a = client.post(
                "/extract-passport-number",
                files={"image": ("a.png", f.read(), "image/png")},
            )
        with SYR.open("rb") as f:
            b = client.post(
                "/extract-passport-number",
                files={"image": ("b.png", f.read(), "image/png")},
            )
        if a.json() != b.json():
            failures.append("sequential requests differ")

    if failures:
        print("FAILURES:")
        for f in failures:
            print(" -", f)
        raise SystemExit(1)
    print("OK: API parity tests passed")


if __name__ == "__main__":
    main()
