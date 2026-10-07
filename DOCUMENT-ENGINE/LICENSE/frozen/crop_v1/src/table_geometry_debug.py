"""Milestone 1.4 table geometry debug panels (Y quality, sequence, bottom role, x2)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from src.detect_table import MergedCandidate, TableDebugInfo


def _panel_title(h: int, w: int, text: str) -> np.ndarray:
    bar = np.full((28, w, 3), 245, dtype=np.uint8)
    cv2.putText(bar, text, (6, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (40, 40, 40), 1)
    return bar


def draw_y_candidate_quality(
    image_bgr: np.ndarray,
    debug: TableDebugInfo,
    candidate_meta: List[Dict[str, Any]],
) -> np.ndarray:
    h, w = image_bgr.shape[:2]
    vis = image_bgr.copy()
    sx1, sy1, sx2, sy2 = debug.search_region
    cv2.rectangle(vis, (sx1, sy1), (sx2, sy2), (255, 255, 0), 1)
    for meta in candidate_meta:
        y = int(meta["y"])
        eligible = meta.get("eligible", False)
        color = (0, 200, 0) if eligible else (0, 0, 255)
        cv2.line(vis, (sx1, y), (sx2, y), color, 1)
        label = (
            f"y={y} sp={meta.get('horizontal_span', 0)} "
            f"m={meta.get('support_count', 0)} q={meta.get('quality_score', 0):.2f} "
            f"{'OK' if eligible else 'NO'}"
        )
        cv2.putText(vis, label, (sx1 + 4, max(12, y - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.32, color, 1)
    for y in debug.selected_boundaries:
        cv2.line(vis, (sx1, y), (sx2, y), (255, 0, 255), 2)
    return np.vstack([_panel_title(h, w, "11 Y candidate quality (green=eligible red=rejected magenta=selected)"), vis])


def draw_sequence_score_comparison(
    image_bgr: np.ndarray,
    debug: TableDebugInfo,
    comparison: Optional[Dict[str, Any]],
) -> np.ndarray:
    h, w = image_bgr.shape[:2]
    vis = image_bgr.copy()
    sx1, _, sx2, _ = debug.search_region
    if comparison:
        old_ys = comparison.get("legacy_boundaries") or []
        for y in old_ys:
            cv2.line(vis, (sx1, y), (sx2, y), (0, 165, 255), 2)
        cv2.putText(
            vis,
            f"legacy score={comparison.get('legacy_score', 0):.2f}",
            (sx1, 24),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (0, 140, 255),
            1,
        )
    for y in debug.selected_boundaries:
        cv2.line(vis, (sx1, y), (sx2, y), (0, 255, 0), 2)
    cv2.putText(
        vis,
        f"new score={debug.structure_score:.2f} mode={debug.structure_mode}",
        (sx1, 44),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.45,
        (0, 180, 0),
        1,
    )
    return np.vstack([_panel_title(h, w, "12 sequence comparison (orange=legacy green=new)"), vis])


def draw_table_bottom_role_debug(
    image_bgr: np.ndarray,
    debug: TableDebugInfo,
    bottom_meta: Optional[Dict[str, Any]],
) -> np.ndarray:
    h, w = image_bgr.shape[:2]
    vis = image_bgr.copy()
    sx1, _, sx2, _ = debug.search_region
    if bottom_meta:
        for y in bottom_meta.get("candidate_ys", []):
            cv2.line(vis, (sx1, y), (sx2, y), (200, 200, 200), 1)
        for y in bottom_meta.get("strong_lower_ys", []):
            cv2.line(vis, (sx1, y), (sx2, y), (0, 165, 255), 2)
        if bottom_meta.get("inferred_bottom_y") is not None:
            yb = int(bottom_meta["inferred_bottom_y"])
            cv2.line(vis, (sx1, yb), (sx2, yb), (255, 0, 255), 3)
    if debug.selected_boundaries:
        y_last = debug.selected_boundaries[-1]
        cv2.line(vis, (sx1, y_last), (sx2, y_last), (0, 255, 0), 2)
        cv2.putText(
            vis,
            f"table_bottom_y={y_last}",
            (sx1 + 4, y_last - 6),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (0, 255, 0),
            1,
        )
    return np.vstack([_panel_title(h, w, "13 table bottom role (cyan=strong lower magenta=inferred)"), vis])


def draw_x2_outer_consensus(
    image_bgr: np.ndarray,
    y_top: int,
    y_bot: int,
    x_refinement: Dict[str, Any],
) -> np.ndarray:
    h, w = image_bgr.shape[:2]
    vis = image_bgr.copy()
    per = x_refinement.get("per_boundary", [])
    for pb in per:
        y = pb["y"]
        for seg in pb.get("segments", []):
            x1, x2 = seg["leftmost_credible_x"], seg["rightmost_credible_x"]
            span = seg.get("horizontal_coverage_px", 0)
            color = (0, 255, 255) if span >= w * 0.35 else (180, 180, 180)
            cv2.line(vis, (x1, y), (x2, y), color, 2)
        cv2.circle(vis, (pb["selected_right"], y), 4, (0, 0, 255), -1)
    pool = x_refinement.get("outer_right_pool") or x_refinement.get("right_endpoint_pool", [])
    for x in pool:
        cv2.line(vis, (x, y_top - 6), (x, y_bot + 6), (255, 0, 0), 1)
    nx2 = x_refinement["new_table_bbox_x"][1]
    cv2.line(vis, (nx2, y_top), (nx2, y_bot), (0, 255, 0), 2)
    cv2.putText(vis, f"x2={nx2}", (nx2 + 4, y_top + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
    return np.vstack([_panel_title(h, w, "14 x2 outer consensus (cyan=long seg red=pool green=x2)"), vis])
