"""Export value crops and contact sheets."""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Tuple

import cv2
import numpy as np

from src.detect_rows import RowInfo
from src.diagnostics import SEMANTIC_LABELS
from src.value_crop.models import FieldStatus, ValueCropResult


VALUE_CROP_FILES = [
    ("01_license_number.png", "license_number"),
    ("02_name_ar.png", "name_ar"),
    ("03_name_en.png", "name_en"),
    ("04_nationality.png", "nationality"),
    ("05_date_of_birth.png", "date_of_birth"),
    ("06_issue_date.png", "issue_date"),
    ("07_expiry_date.png", "expiry_date"),
    ("08_place_of_issue.png", "place_of_issue"),
]


def export_value_crops(
    image_bgr: np.ndarray,
    table_bbox: Tuple[int, int, int, int],
    rows: List[RowInfo],
    field_results: List[ValueCropResult],
    output_dir: Path,
) -> Dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    tx1, _, _, _ = table_bbox
    row_by_sem = {r.semantic: r for r in rows}
    result_by_sem = {r.semantic: r for r in field_results}
    paths: Dict[str, str] = {}

    for filename, semantic in VALUE_CROP_FILES:
        fres = result_by_sem.get(semantic)
        row = row_by_sem.get(semantic)
        out_path = output_dir / filename
        if (
            fres is None
            or row is None
            or fres.field_status != FieldStatus.VALUE_OK
            or fres.value_bbox is None
        ):
            placeholder = np.full((40, 200, 3), 220, dtype=np.uint8)
            cv2.putText(
                placeholder,
                "UNCERTAIN",
                (10, 28),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 0, 200),
                2,
            )
            cv2.imwrite(str(out_path), placeholder)
            paths[semantic] = str(out_path)
            continue

        vx1, vy1, vx2, vy2 = fres.value_bbox
        abs_y1 = row.y1 + vy1
        abs_y2 = row.y1 + vy2
        abs_x1 = tx1 + vx1
        abs_x2 = tx1 + vx2
        crop = image_bgr[abs_y1:abs_y2, abs_x1:abs_x2]
        cv2.imwrite(str(out_path), crop)
        paths[semantic] = str(out_path)

    return paths


def build_value_contact_sheet(
    image_bgr: np.ndarray,
    table_bbox: Tuple[int, int, int, int],
    rows: List[RowInfo],
    field_results: List[ValueCropResult],
    margin: int = 12,
    label_height: int = 34,
) -> np.ndarray:
    tx1, _, tx2, _ = table_bbox
    row_by_sem = {r.semantic: r for r in rows}
    result_by_sem = {r.semantic: r for r in field_results}
    blocks: List[np.ndarray] = []
    max_w = tx2 - tx1

    for _fname, semantic in VALUE_CROP_FILES:
        label = SEMANTIC_LABELS.get(semantic, semantic.upper())
        bar = np.full((label_height, max_w, 3), 245, dtype=np.uint8)
        cv2.putText(
            bar,
            label,
            (8, 24),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (20, 60, 160),
            2,
            cv2.LINE_AA,
        )
        blocks.append(bar)

        fres = result_by_sem.get(semantic)
        row = row_by_sem.get(semantic)
        if (
            fres
            and row
            and fres.field_status == FieldStatus.VALUE_OK
            and fres.value_bbox is not None
        ):
            vx1, vy1, vx2, vy2 = fres.value_bbox
            crop = image_bgr[row.y1 + vy1 : row.y1 + vy2, tx1 + vx1 : tx1 + vx2]
        else:
            crop = np.full((36, max_w, 3), 210, dtype=np.uint8)
            cv2.putText(
                crop,
                "VALUE_BOUNDARY_UNCERTAIN",
                (8, 24),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (0, 0, 180),
                1,
            )
        blocks.append(crop)

    total_h = sum(b.shape[0] for b in blocks) + margin * (len(blocks) + 1)
    sheet = np.full((total_h, max_w + 2 * margin, 3), 255, dtype=np.uint8)
    y = margin
    for block in blocks:
        h, w = block.shape[:2]
        sheet[y : y + h, margin : margin + w] = block
        y += h + margin
    return sheet
