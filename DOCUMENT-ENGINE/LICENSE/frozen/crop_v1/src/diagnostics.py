"""Debug visualization helpers."""

from __future__ import annotations

from typing import List, Optional, Tuple

import cv2
import numpy as np

from src.detect_rows import RowInfo
from src.detect_table import InferredBoundary, MergedCandidate, TableDebugInfo


SEMANTIC_LABELS = {
    "license_number": "LICENSE_NUMBER",
    "name_ar": "NAME_AR",
    "name_en": "NAME_EN",
    "nationality": "NATIONALITY",
    "date_of_birth": "DATE_OF_BIRTH",
    "issue_date": "ISSUE_DATE",
    "expiry_date": "EXPIRY_DATE",
    "place_of_issue": "PLACE_OF_ISSUE",
}


def draw_table_x_boundary_debug(
    image_bgr: np.ndarray,
    y_top: int,
    y_bot: int,
    x_refinement: dict,
) -> np.ndarray:
    out = image_bgr.copy()
    old_x1, old_x2 = x_refinement["old_table_bbox_x"]
    new_x1, new_x2 = x_refinement["new_table_bbox_x"]
    h, w = out.shape[:2]

    for y in range(y_top, y_bot + 1, max(1, (y_bot - y_top) // 12)):
        cv2.line(out, (old_x1, y), (old_x2, y), (180, 180, 255), 1)

    for x in x_refinement.get("left_endpoint_pool", []):
        cv2.circle(out, (x, (y_top + y_bot) // 2), 3, (255, 0, 0), -1)
    for x in x_refinement.get("right_endpoint_pool", []):
        cv2.circle(out, (x, (y_top + y_bot) // 2), 3, (0, 0, 255), -1)

    cv2.line(out, (old_x2, y_top), (old_x2, y_bot), (0, 165, 255), 2)
    cv2.line(out, (new_x2, y_top), (new_x2, y_bot), (0, 255, 0), 2)

    v_right = x_refinement.get("vertical_border_right")
    if v_right is not None:
        cv2.line(out, (v_right, y_top), (v_right, y_bot), (255, 0, 255), 1)

    cv2.putText(
        out,
        f"old x2={old_x2}",
        (max(5, old_x2 - 80), max(20, y_top - 6)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.45,
        (0, 140, 255),
        1,
        cv2.LINE_AA,
    )
    cv2.putText(
        out,
        f"new x2={new_x2}",
        (max(5, new_x2 - 80), min(h - 8, y_bot + 18)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.45,
        (0, 180, 0),
        1,
        cv2.LINE_AA,
    )
    return out


def draw_table_detection(
    image_bgr: np.ndarray,
    table_bbox: Tuple[int, int, int, int],
) -> np.ndarray:
    out = image_bgr.copy()
    x1, y1, x2, y2 = table_bbox
    cv2.rectangle(out, (x1, y1), (x2, y2), (0, 255, 0), 2)
    return out


def draw_row_detection(
    image_bgr: np.ndarray,
    table_bbox: Tuple[int, int, int, int],
    separator_ys: List[int],
    rows: List[RowInfo],
) -> np.ndarray:
    out = image_bgr.copy()
    x1, y1, x2, y2 = table_bbox
    cv2.rectangle(out, (x1, y1), (x2, y2), (0, 255, 0), 2)
    for y in separator_ys:
        cv2.line(out, (x1, y), (x2, y), (255, 0, 0), 1)
    for row in rows:
        cy = (row.y1 + row.y2) // 2
        cv2.putText(
            out,
            str(row.index),
            (x1 + 5, cy),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (0, 0, 255),
            2,
            cv2.LINE_AA,
        )
    return out


def draw_search_region_debug(
    image_bgr: np.ndarray,
    search_region: Tuple[int, int, int, int],
) -> np.ndarray:
    out = image_bgr.copy()
    x1, y1, x2, y2 = search_region
    overlay = out.copy()
    cv2.rectangle(overlay, (x1, y1), (x2, y2), (255, 200, 0), -1)
    out = cv2.addWeighted(overlay, 0.15, out, 0.85, 0)
    cv2.rectangle(out, (x1, y1), (x2, y2), (0, 200, 255), 2)
    cv2.putText(
        out,
        "table search region",
        (x1 + 6, max(y1 - 8, 18)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.45,
        (0, 140, 255),
        1,
        cv2.LINE_AA,
    )
    return out


def draw_horizontal_candidates_debug(
    image_bgr: np.ndarray,
    raw_by_method: dict,
    search_region: Tuple[int, int, int, int],
) -> np.ndarray:
    out = image_bgr.copy()
    x1, _, x2, _ = search_region
    colors = {
        "morph_adaptive": (255, 0, 0),
        "morph_clahe": (0, 165, 255),
        "hough": (0, 255, 0),
        "projection": (255, 0, 255),
        "dark_energy": (0, 255, 255),
    }
    for method, ys in raw_by_method.items():
        color = colors.get(method, (180, 180, 180))
        for y in ys:
            cv2.line(out, (x1, y), (x2, y), color, 1)
    return out


def draw_candidate_clusters_debug(
    image_bgr: np.ndarray,
    merged: List[MergedCandidate],
    search_region: Tuple[int, int, int, int],
) -> np.ndarray:
    out = image_bgr.copy()
    x1, _, x2, _ = search_region
    for cand in merged:
        cv2.line(out, (x1, cand.y), (x2, cand.y), (0, 255, 255), 2)
        label = f"y={cand.y} s={cand.support_count}"
        cv2.putText(
            out,
            label,
            (x1 + 4, max(12, cand.y - 4)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.35,
            (0, 80, 200),
            1,
            cv2.LINE_AA,
        )
    return out


def draw_sequence_selection_debug(
    image_bgr: np.ndarray,
    selected: List[int],
    rejected: List[int],
    inferred: Optional[InferredBoundary],
    search_region: Tuple[int, int, int, int],
) -> np.ndarray:
    out = image_bgr.copy()
    x1, _, x2, _ = search_region
    for y in rejected:
        cv2.line(out, (x1, y), (x2, y), (120, 120, 120), 1)
    for y in selected:
        color = (0, 255, 0) if not inferred or y != inferred.y else (0, 140, 255)
        cv2.line(out, (x1, y), (x2, y), color, 2)
    if inferred is not None:
        cv2.putText(
            out,
            f"INFERRED y={inferred.y}",
            (x1 + 6, inferred.y + 14),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (0, 100, 255),
            1,
            cv2.LINE_AA,
        )
    return out


def draw_table_debug_bundle(
    image_bgr: np.ndarray,
    debug: TableDebugInfo,
) -> dict:
    sr = debug.search_region
    return {
        "03a_search_region_debug": draw_search_region_debug(image_bgr, sr),
        "03b_horizontal_candidates": draw_horizontal_candidates_debug(
            image_bgr, debug.raw_by_method, sr
        ),
        "03c_candidate_clusters": draw_candidate_clusters_debug(
            image_bgr, debug.merged_candidates, sr
        ),
        "03d_sequence_selection": draw_sequence_selection_debug(
            image_bgr,
            debug.selected_boundaries,
            debug.rejected_nearby,
            debug.inferred_boundary,
            sr,
        ),
    }


def draw_structural_layout(
    image_bgr: np.ndarray,
    table_bbox: Tuple[int, int, int, int],
    rows: List[RowInfo],
) -> np.ndarray:
    out = image_bgr.copy()
    x1, y1, x2, y2 = table_bbox
    cv2.rectangle(out, (x1, y1), (x2, y2), (0, 200, 0), 2)
    for row in rows:
        label = SEMANTIC_LABELS.get(row.semantic, row.semantic.upper())
        text = f"ROW {row.index} — {label}"
        ty = max(row.y1 + 22, 20)
        cv2.rectangle(out, (x1, row.y1), (x2, row.y2), (255, 180, 0), 1)
        cv2.putText(
            out,
            text,
            (x1 + 8, ty),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (0, 80, 255),
            1,
            cv2.LINE_AA,
        )
    return out
