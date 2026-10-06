"""Focused OCR on the 10-cell passport-number corridor only (lower MRZ line cells 0–9)."""

from __future__ import annotations

import tempfile
from pathlib import Path

import cv2
import numpy as np

from run_mrz_a1 import MODEL_NAME

MRZ_CHARS = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<")


def normalize_mrz_token(raw: str) -> str:
    s = raw.upper().replace(" ", "")
    return "".join(c for c in s if c in MRZ_CHARS)


def _variant_original(bgr: np.ndarray) -> np.ndarray:
    return bgr


def _variant_upscale_clahe(bgr: np.ndarray, scale: float = 2.0) -> np.ndarray:
    h, w = bgr.shape[:2]
    up = cv2.resize(bgr, (max(1, int(w * scale)), max(1, int(h * scale))), interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(up, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    g = clahe.apply(gray)
    return cv2.cvtColor(g, cv2.COLOR_GRAY2BGR)


def _variant_upscale_sharp(bgr: np.ndarray, scale: float = 2.0) -> np.ndarray:
    h, w = bgr.shape[:2]
    up = cv2.resize(bgr, (max(1, int(w * scale)), max(1, int(h * scale))), interpolation=cv2.INTER_CUBIC)
    blur = cv2.GaussianBlur(up, (0, 0), 1.0)
    sharp = cv2.addWeighted(up, 1.4, blur, -0.4, 0)
    return sharp


def ocr_image_bgr(bgr: np.ndarray) -> tuple[str, float | None]:
    from paddleocr import TextRecognition

    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "crop.png"
        cv2.imwrite(str(p), bgr)
        recognizer = TextRecognition(model_name=MODEL_NAME)
        results = recognizer.predict(input=str(p))
    text = ""
    conf = None
    if results:
        r0 = results[0]
        if isinstance(r0, dict):
            text = r0.get("rec_text") or r0.get("text") or ""
            conf = r0.get("rec_score") or r0.get("score")
        else:
            text = getattr(r0, "rec_text", "") or str(r0)
    return text, conf


def _prepare_ocr_input(bgr: np.ndarray) -> np.ndarray:
    h, w = bgr.shape[:2]
    pad_y = max(0, (40 - h) // 2)
    pad_y2 = max(0, 40 - h - pad_y)
    padded = cv2.copyMakeBorder(bgr, pad_y, pad_y2, 10, 10, cv2.BORDER_CONSTANT, value=(255, 255, 255))
    nh, nw = padded.shape[:2]
    scale = max(3.0, 120.0 / max(nw, 1))
    return cv2.resize(
        padded,
        (max(1, int(round(nw * scale))), max(48, int(round(nh * scale)))),
        interpolation=cv2.INTER_CUBIC,
    )


def ocr_ten_cell_corridor(crop10_bgr: np.ndarray) -> list[dict]:
    """Run OCR variants on the 10-cell image only. Never pass full line 1/2 or 44-char MRZ."""
    return ocr_focused_crop_variants(crop10_bgr)


def ocr_focused_crop_variants(crop_bgr: np.ndarray) -> list[dict]:
    variants: list[tuple[str, np.ndarray]] = [
        ("original", crop_bgr),
        ("upscale_clahe_2x", _variant_upscale_clahe(crop_bgr)),
        ("upscale_sharp_2x", _variant_upscale_sharp(crop_bgr)),
    ]
    if crop_bgr.shape[0] < 22:
        variants.append(("thin_prep", _prepare_ocr_input(crop_bgr)))
    out = []
    for name, img in variants:
        raw, conf = ocr_image_bgr(img)
        norm = normalize_mrz_token(raw)
        out.append(
            {
                "variant": name,
                "raw_text": raw,
                "normalized": norm,
                "length": len(norm),
                "confidence": conf,
            }
        )
    return out


def pick_best_nine_char_doc(readings: list[dict]) -> dict | None:
    candidates = [r for r in readings if len(r["normalized"]) >= 7]
    if not candidates:
        return None
    candidates.sort(
        key=lambda r: (
            abs(len(r["normalized"]) - 9),
            -(r["confidence"] or 0),
        )
    )
    best = dict(candidates[0])
    best["doc9"] = best["normalized"][:9]
    return best


def pick_best_ten_char_reading(readings: list[dict]) -> dict | None:
    candidates = [r for r in readings if len(r["normalized"]) >= 8]
    if not candidates:
        return None
    candidates.sort(
        key=lambda r: (
            abs(len(r["normalized"]) - 10),
            -len(r["normalized"]),
            -(r["confidence"] or 0),
        )
    )
    best = dict(candidates[0])
    seq = best["normalized"]
    if len(seq) > 10:
        seq = seq[:10]
    best["sequence_10"] = seq.ljust(10, "<")[:10] if len(seq) < 10 else seq[:10]
    return best
