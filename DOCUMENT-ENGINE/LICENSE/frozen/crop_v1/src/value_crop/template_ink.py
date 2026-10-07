"""Tight ink bounding boxes inside fixed label templates."""

from __future__ import annotations

from pathlib import Path
from typing import Dict, Tuple

import cv2
import numpy as np

from src.value_crop.preprocess import prepare_ink_mask

InkBBox = Tuple[int, int, int, int]


def compute_template_ink_bbox(template_gray: np.ndarray) -> InkBBox:
    """Tight bbox of label ink inside a template patch (template-local coordinates)."""
    h, w = template_gray.shape[:2]
    ink = prepare_ink_mask(template_gray)
    num, _, stats, _ = cv2.connectedComponentsWithStats(ink, connectivity=8)
    boxes = []
    for i in range(1, num):
        bx, by, bw, bh, area = stats[i]
        if area < 8 or bh < 4:
            continue
        if bh <= 2 and bw > int(0.55 * w):
            continue
        if bw <= 1 and bh > int(0.55 * h):
            continue
        boxes.append((bx, by, bx + bw, by + bh))
    if not boxes:
        ys, xs = np.where(ink > 0)
        if ys.size == 0:
            return (0, 0, w - 1, h - 1)
        return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)

    x1 = min(b[0] for b in boxes)
    y1 = min(b[1] for b in boxes)
    x2 = max(b[2] for b in boxes)
    y2 = max(b[3] for b in boxes)
    return (int(x1), int(y1), int(x2), int(y2))


def load_template_ink_bboxes(template_dir: Path) -> Dict[str, InkBBox]:
    out: Dict[str, InkBBox] = {}
    for path in sorted(template_dir.glob("*.png")):
        if path.name == "label_templates_debug.png":
            continue
        img = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
        if img is None:
            continue
        out[path.stem] = compute_template_ink_bbox(img)
    return out


def map_ink_bbox_to_row(
    template_ink: InkBBox,
    match_x: int,
    match_y: int,
    scale: float,
) -> InkBBox:
    ix1, iy1, ix2, iy2 = template_ink
    s = float(scale)
    return (
        int(round(match_x + ix1 * s)),
        int(round(match_y + iy1 * s)),
        int(round(match_x + ix2 * s)),
        int(round(match_y + iy2 * s)),
    )


def build_template_ink_bbox_debug(template_dir: Path) -> np.ndarray:
    paths = sorted(
        p
        for p in template_dir.glob("*.png")
        if p.name not in ("label_templates_debug.png", "label_templates_ink_bbox_debug.png")
    )
    if not paths:
        return np.full((120, 400, 3), 255, dtype=np.uint8)

    cell_h = 0
    cell_w = 0
    cells = []
    for p in paths:
        gray = cv2.imread(str(p), cv2.IMREAD_GRAYSCALE)
        if gray is None:
            continue
        ink_bb = compute_template_ink_bbox(gray)
        vis = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
        cv2.rectangle(vis, (ink_bb[0], ink_bb[1]), (ink_bb[2] - 1, ink_bb[3] - 1), (0, 0, 255), 1)
        iw = ink_bb[2] - ink_bb[0]
        ih = ink_bb[3] - ink_bb[1]
        cv2.putText(
            vis,
            f"{iw}x{ih}",
            (2, max(12, vis.shape[0] - 4)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.35,
            (0, 160, 0),
            1,
        )
        cells.append((p.stem, vis))
        cell_h = max(cell_h, vis.shape[0])
        cell_w = max(cell_w, vis.shape[1])

    cols = 4
    margin = 10
    title_h = 22
    rows_n = (len(cells) + cols - 1) // cols
    sheet_w = cols * (cell_w + margin) + margin
    sheet_h = rows_n * (cell_h + title_h + margin) + margin
    sheet = np.full((sheet_h, sheet_w, 3), 255, dtype=np.uint8)

    for idx, (name, vis) in enumerate(cells):
        r, c = divmod(idx, cols)
        x0 = margin + c * (cell_w + margin)
        y0 = margin + r * (cell_h + title_h + margin)
        cv2.putText(
            sheet,
            name[:24],
            (x0, y0 + 16),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.38,
            (30, 30, 30),
            1,
        )
        yp = y0 + title_h
        h, w = vis.shape[:2]
        sheet[yp : yp + h, x0 : x0 + w] = vis
    return sheet
