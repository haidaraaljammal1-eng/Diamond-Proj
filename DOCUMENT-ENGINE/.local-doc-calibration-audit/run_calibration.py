"""Local-only calibration harness. Does not modify engine source. Outputs non-PII metrics."""

from __future__ import annotations

import json
import time
import urllib.request
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

import cv2
import numpy as np

OUT = Path(__file__).resolve().parent / "results.json"
LICENSE_URL = "http://127.0.0.1:8020/extract-driving-license"
PASSPORT_URL = "http://127.0.0.1:8010/extract-passport-number"

LICENSE_FIXTURES = [
    Path(__file__).resolve().parents[2]
    / "APP/frontend/e2e/fixtures/driving-license/uae-driving-license-ocr-test.jpg",
    Path(__file__).resolve().parents[2]
    / "APP/frontend/e2e/fixtures/driving-license/uae-driving-license-ocr-test.png",
    Path(__file__).resolve().parents[2]
    / "APP/frontend/e2e/fixtures/driving-license/uae-driving-license-expired-corpus.jpg",
]
PASSPORT_FIXTURE = Path(
    r"C:\Users\Rw\.cursor\projects\c-Users-Rw-Documents-DIAMOND-SYSTEM\assets"
    r"\c__Users_Rw_AppData_Roaming_Cursor_User_workspaceStorage_ed577a768a71940254545da375e80d22_images_image-f7cea3a3-c6f6-4689-bf13-fafdca1407a0.png"
)


def laplacian_var(bgr: np.ndarray) -> float:
    g = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(g, cv2.CV_64F).var())


def mean_luma(bgr: np.ndarray) -> float:
    g = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    return float(g.mean())


def adjust_brightness_contrast(bgr: np.ndarray, brightness_pct: float, contrast_pct: float) -> np.ndarray:
    # brightness_pct/contrast_pct: 0 = identity; +20 = +20% style shift
    alpha = 1.0 + (contrast_pct / 100.0)
    beta = (brightness_pct / 100.0) * 40.0
    out = cv2.convertScaleAbs(bgr, alpha=alpha, beta=beta)
    return out


def scale_image(bgr: np.ndarray, scale: float) -> np.ndarray:
    h, w = bgr.shape[:2]
    nh, nw = max(1, int(round(h * scale))), max(1, int(round(w * scale)))
    interp = cv2.INTER_AREA if scale < 1.0 else cv2.INTER_CUBIC
    return cv2.resize(bgr, (nw, nh), interpolation=interp)


def rotate_image(bgr: np.ndarray, deg: float) -> np.ndarray:
    h, w = bgr.shape[:2]
    m = cv2.getRotationMatrix2D((w / 2, h / 2), deg, 1.0)
    return cv2.warpAffine(bgr, m, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def crop_margin(bgr: np.ndarray, margin_frac: float) -> np.ndarray:
    """margin_frac: 0 = full; 0.05 = crop 5% each side."""
    h, w = bgr.shape[:2]
    dx = int(w * margin_frac)
    dy = int(h * margin_frac)
    if dx * 2 >= w - 2 or dy * 2 >= h - 2:
        return bgr.copy()
    return bgr[dy : h - dy, dx : w - dx].copy()


def encode_jpeg(bgr: np.ndarray, quality: int) -> bytes:
    ok, buf = cv2.imencode(".jpg", bgr, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        raise RuntimeError("jpeg encode failed")
    return buf.tobytes()


def encode_png(bgr: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", bgr)
    if not ok:
        raise RuntimeError("png encode failed")
    return buf.tobytes()


def post_multipart(url: str, field: str, data: bytes, filename: str, mime: str) -> tuple[int, dict, int]:
    import uuid

    boundary = f"----DiamondCalib{uuid.uuid4().hex}"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="{field}"; filename="{filename}"\r\n'
        f"Content-Type: {mime}\r\n\r\n"
    ).encode("utf-8") + data + f"\r\n--{boundary}--\r\n".encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}", "Accept": "application/json"},
    )
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            raw = resp.read()
            ms = int((time.perf_counter() - t0) * 1000)
            return resp.status, json.loads(raw.decode("utf-8")), ms
    except urllib.error.HTTPError as e:
        ms = int((time.perf_counter() - t0) * 1000)
        try:
            payload = json.loads(e.read().decode("utf-8"))
        except Exception:
            payload = {"error": str(e)}
        return e.code, payload, ms


def summarize_license(payload: dict) -> dict:
    fields = payload.get("fields") or {}
    ln = fields.get("license_number") or {}
    ex = fields.get("expiry_date") or {}
    return {
        "document_status": payload.get("document_status"),
        "license_field_status": ln.get("status"),
        "expiry_field_status": ex.get("status"),
        "license_conf": ln.get("confidence"),
        "expiry_conf": ex.get("confidence"),
        "has_license_value": bool(ln.get("value")),
        "has_expiry_value": bool(ex.get("value")),
        "runtime_ms": payload.get("runtime_ms"),
    }


def summarize_passport(payload: dict) -> dict:
    return {
        "status": payload.get("status"),
        "has_number": bool(payload.get("passport_number")),
        "error": payload.get("error"),
    }


@dataclass
class Case:
    engine: str
    sample: str
    transform: str
    meta: dict
    http: int
    summary: dict
    ms: int


def run_engine_cases(engine: str, name: str, bgr: np.ndarray, url: str, field: str) -> list[Case]:
    cases: list[Case] = []
    h, w = bgr.shape[:2]
    base_meta = {"w": w, "h": h, "aspect": round(w / h, 3), "laplacian_var": round(laplacian_var(bgr), 1), "mean_luma": round(mean_luma(bgr), 1)}

    def one(transform: str, img: np.ndarray, extra: dict, filename: str, mime: str, data: bytes):
        code, payload, ms = post_multipart(url, field, data, filename, mime)
        summ = summarize_license(payload) if engine == "license" else summarize_passport(payload)
        cases.append(Case(engine, name, transform, {**base_meta, **extra}, code, summ, ms))

    # baseline PNG
    one("baseline_png", bgr, {}, "cal.png", "image/png", encode_png(bgr))

    for scale in [1.0, 0.85, 0.7, 0.5, 0.35]:
        if scale == 1.0:
            continue
        s = scale_image(bgr, scale)
        one(f"scale_{int(scale*100)}", s, {"scale": scale, "w": s.shape[1], "h": s.shape[0]}, "cal.png", "image/png", encode_png(s))

    for b in [-30, -20, -10, 0, 10, 20, 30]:
        img = adjust_brightness_contrast(bgr, b, 0)
        one(f"brightness_{b:+d}", img, {"brightness_pct": b, "contrast_pct": 0}, "cal.png", "image/png", encode_png(img))

    for c in [-30, -20, -10, 0, 10, 20, 30, 40]:
        img = adjust_brightness_contrast(bgr, 0, c)
        one(f"contrast_{c:+d}", img, {"brightness_pct": 0, "contrast_pct": c}, "cal.png", "image/png", encode_png(img))

    combos = [(0, 15), (-10, 15), (10, 15), (-10, 25), (0, 25)]
    for b, c in combos:
        img = adjust_brightness_contrast(bgr, b, c)
        one(f"combo_b{b}_c{c}", img, {"brightness_pct": b, "contrast_pct": c}, "cal.png", "image/png", encode_png(img))

    for q in [100, 95, 90, 85, 75]:
        one(f"jpeg_q{q}", bgr, {"jpeg_quality": q}, "cal.jpg", "image/jpeg", encode_jpeg(bgr, q))

    for m in [0.0, 0.05, 0.12]:
        img = crop_margin(bgr, m)
        one(f"crop_margin_{int(m*100)}", img, {"margin_frac": m, "w": img.shape[1], "h": img.shape[0]}, "cal.png", "image/png", encode_png(img))

    for deg in [0, 2, -2, 4, -4, 6, -6, 10, -10]:
        if deg == 0:
            continue
        img = rotate_image(bgr, deg)
        one(f"rotate_{deg:+d}", img, {"rotate_deg": deg}, "cal.png", "image/png", encode_png(img))

    return cases


def main() -> None:
    all_cases: list[dict] = []
    for p in LICENSE_FIXTURES:
        if not p.is_file():
            continue
        bgr = cv2.imread(str(p))
        if bgr is None:
            continue
        for c in run_engine_cases("license", p.name, bgr, LICENSE_URL, "image"):
            all_cases.append({"engine": c.engine, "sample": c.sample, "transform": c.transform, "meta": c.meta, "http": c.http, "summary": c.summary, "ms": c.ms})

    if PASSPORT_FIXTURE.is_file():
        bgr = cv2.imread(str(PASSPORT_FIXTURE))
        if bgr is not None:
            for c in run_engine_cases("passport", "spanish_passport_local", bgr, PASSPORT_URL, "image"):
                all_cases.append({"engine": c.engine, "sample": c.sample, "transform": c.transform, "meta": c.meta, "http": c.http, "summary": c.summary, "ms": c.ms})

    OUT.write_text(json.dumps({"cases": all_cases}, indent=2), encoding="utf-8")
    print(f"wrote {OUT} cases={len(all_cases)}")


if __name__ == "__main__":
    main()
