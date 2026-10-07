"""Generate local PNG contact sheets for offline ground-truth review."""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np

OCR_ROOT = Path(__file__).resolve().parents[1]
REVIEW_PATH = OCR_ROOT / "ground_truth" / "ground_truth_review.json"
OUT_DIR = OCR_ROOT / "ground_truth" / "review_sheets"


def _label_bar(text: str, width: int) -> np.ndarray:
    bar = np.full((36, width, 3), 240, dtype=np.uint8)
    cv2.putText(
        bar,
        text[:80],
        (8, 24),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (20, 20, 20),
        1,
        cv2.LINE_AA,
    )
    return bar


def _load_or_placeholder(path: str, w: int, h: int) -> np.ndarray:
    p = Path(path)
    if p.is_file():
        img = cv2.imread(str(p))
        if img is not None:
            return img
    ph = np.full((h, w, 3), 220, dtype=np.uint8)
    cv2.putText(ph, "missing", (10, h // 2), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (80, 80, 80), 1)
    return ph


def _pad_width(img: np.ndarray, width: int) -> np.ndarray:
    h, w = img.shape[:2]
    if w >= width:
        return img[:, :width]
    pad = np.full((h, width - w, 3), 255, dtype=np.uint8)
    return np.hstack([img, pad])


def build_sheet(doc: dict, canvas_width: int = 900) -> np.ndarray:
    tid = doc["test_id"]
    blocks = [_label_bar(f"{tid} — original (reference only)", canvas_width)]
    orig = doc.get("original_image")
    if orig:
        oimg = _load_or_placeholder(orig, 400, 120)
        scale = min(1.0, (canvas_width - 20) / max(oimg.shape[1], 1))
        oimg = cv2.resize(oimg, None, fx=scale, fy=scale)
        blocks.append(_pad_width(oimg, canvas_width))

    for fname, fa in doc.get("fields", {}).items():
        blocks.append(_label_bar(f"{fname} | value crop", canvas_width))
        vc = _load_or_placeholder(fa.get("value_crop", ""), 400, 40)
        blocks.append(_pad_width(vc, canvas_width))
        blocks.append(_label_bar(f"{fname} | row crop", canvas_width))
        rc = _load_or_placeholder(fa.get("row_crop", ""), 600, 50)
        blocks.append(_pad_width(rc, canvas_width))
        blocks.append(np.full((8, canvas_width, 3), 255, dtype=np.uint8))

    return np.vstack(blocks)


def main() -> int:
    review = json.loads(REVIEW_PATH.read_text(encoding="utf-8"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for doc in review.get("documents", []):
        sheet = build_sheet(doc)
        out = OUT_DIR / f"{doc['test_id']}_review_sheet.png"
        cv2.imwrite(str(out), sheet)
    print(f"Wrote {len(review.get('documents', []))} sheets to {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
