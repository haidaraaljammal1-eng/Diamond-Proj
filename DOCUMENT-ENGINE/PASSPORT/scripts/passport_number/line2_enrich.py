"""Generic line-2 vertical re-crop from source when fallback rows are too thin for OCR."""

from __future__ import annotations

import cv2
import numpy as np

MIN_LINE2_HEIGHT_PX = 32
HORIZONTAL_MARGIN_PX = 2


def enrich_line2_from_source(
    image_bgr: np.ndarray,
    line2_bgr: np.ndarray,
    line2_bbox: tuple[int, int, int, int],
) -> tuple[np.ndarray, dict]:
    """Re-read line 2 from the source image with vertical padding when the row crop is short."""
    h, w = line2_bgr.shape[:2]
    meta = {"applied": False, "reason": "height_ok", "source_height": h}
    if h >= MIN_LINE2_HEIGHT_PX:
        return line2_bgr.copy(), meta

    x, y, bw, bh = line2_bbox
    img_h, img_w = image_bgr.shape[:2]
    pad_total = max(MIN_LINE2_HEIGHT_PX - bh, int(bh * 1.0))
    pad_top = pad_total // 2
    pad_bot = pad_total - pad_top
    y0 = max(0, y - pad_top)
    y1 = min(img_h, y + bh + pad_bot)
    x0 = max(0, x - HORIZONTAL_MARGIN_PX)
    x1 = min(img_w, x + bw + HORIZONTAL_MARGIN_PX)
    rec = image_bgr[y0:y1, x0:x1].copy()
    if rec.size == 0:
        return line2_bgr.copy(), meta

    meta.update(
        {
            "applied": True,
            "reason": "thin_row_source_recrop",
            "source_height": h,
            "enriched_height": int(rec.shape[0]),
            "enriched_wh": [int(rec.shape[1]), int(rec.shape[0])],
        }
    )
    return rec, meta
