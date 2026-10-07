"""Full-width row crops for visual inspection (not value-zone crops)."""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Tuple

import cv2
import numpy as np

from src.detect_rows import RowInfo
from src.diagnostics import SEMANTIC_LABELS


ROW_CROP_FILES = [
    ("01_license_number_row.png", "license_number"),
    ("02_name_ar_row.png", "name_ar"),
    ("03_name_en_row.png", "name_en"),
    ("04_nationality_row.png", "nationality"),
    ("05_date_of_birth_row.png", "date_of_birth"),
    ("06_issue_date_row.png", "issue_date"),
    ("07_expiry_date_row.png", "expiry_date"),
    ("08_place_of_issue_row.png", "place_of_issue"),
]


def export_row_crops(
    image_bgr: np.ndarray,
    table_bbox: Tuple[int, int, int, int],
    rows: List[RowInfo],
    output_dir: Path,
) -> Dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    x1, _, x2, _ = table_bbox
    paths: Dict[str, str] = {}
    row_by_semantic = {r.semantic: r for r in rows}

    for filename, semantic in ROW_CROP_FILES:
        row = row_by_semantic.get(semantic)
        if row is None:
            continue
        crop = image_bgr[row.y1 : row.y2, x1:x2]
        out_path = output_dir / filename
        cv2.imwrite(str(out_path), crop)
        paths[semantic] = str(out_path)

    return paths


def build_row_crop_contact_sheet(
    image_bgr: np.ndarray,
    table_bbox: Tuple[int, int, int, int],
    rows: List[RowInfo],
    margin: int = 12,
    label_height: int = 36,
) -> np.ndarray:
    x1, _, x2, _ = table_bbox
    row_by_semantic = {r.semantic: r for r in rows}
    blocks: List[np.ndarray] = []
    max_w = x2 - x1

    for _fname, semantic in ROW_CROP_FILES:
        label = SEMANTIC_LABELS.get(semantic, semantic.upper())
        row = row_by_semantic.get(semantic)
        if row is None:
            continue
        crop = image_bgr[row.y1 : row.y2, x1:x2]
        label_bar = np.full((label_height, max_w, 3), 245, dtype=np.uint8)
        cv2.putText(
            label_bar,
            label,
            (8, 26),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (20, 60, 160),
            2,
            cv2.LINE_AA,
        )
        blocks.append(label_bar)
        blocks.append(crop)

    if not blocks:
        return image_bgr.copy()

    total_h = sum(b.shape[0] for b in blocks) + margin * (len(blocks) + 1)
    sheet = np.full((total_h, max_w + 2 * margin, 3), 255, dtype=np.uint8)
    y = margin
    for block in blocks:
        h, w = block.shape[:2]
        sheet[y : y + h, margin : margin + w] = block
        y += h + margin
    return sheet
