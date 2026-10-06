"""Debug visuals for text-band row fallback."""

from __future__ import annotations

from typing import List, Optional, Tuple

import cv2
import numpy as np

from src.text_band_fallback import TextBand, TextBandFallbackResult


def _header(title: str, w: int, h: int = 36) -> np.ndarray:
    bar = np.full((h, w, 3), 245, dtype=np.uint8)
    cv2.putText(bar, title[:90], (6, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (40, 60, 100), 1)
    return bar


def draw_text_mask_debug(
    image_bgr: np.ndarray,
    search_region: Tuple[int, int, int, int],
    mask: np.ndarray,
) -> np.ndarray:
    sx1, sy1, sx2, sy2 = search_region
    roi = image_bgr[sy1:sy2, sx1:sx2].copy()
    h, w = roi.shape[:2]
    if mask.shape[:2] != (h, w):
        mask = cv2.resize(mask, (w, h), interpolation=cv2.INTER_NEAREST)
    overlay = roi.copy()
    overlay[mask > 0] = (0, 200, 255)
    blend = cv2.addWeighted(roi, 0.55, overlay, 0.45, 0)
    return np.vstack([_header("17_text_mask", w), blend])


def draw_projection_debug(
    image_bgr: np.ndarray,
    search_region: Tuple[int, int, int, int],
    projection: np.ndarray,
    bands: List[TextBand],
) -> np.ndarray:
    sx1, sy1, sx2, sy2 = search_region
    roi_h = sy2 - sy1
    w = max(320, sx2 - sx1)
    plot_h = max(120, roi_h)
    canvas = np.full((plot_h, w, 3), 255, dtype=np.uint8)
    if projection is not None and projection.size > 0:
        p = projection.astype(np.float32)
        p = p / (float(p.max()) + 1e-6)
        for y in range(min(plot_h, p.shape[0])):
            x2 = int(p[y] * (w - 20))
            cv2.line(canvas, (10, y), (10 + x2, y), (80, 80, 200), 1)
    for b in bands:
        y = int(b.center_y - sy1)
        if 0 <= y < plot_h:
            cv2.line(canvas, (0, y), (w - 1, y), (0, 180, 0), 1)
    return np.vstack([_header("18_horizontal_text_projection", w), canvas])


def draw_band_candidates(
    image_bgr: np.ndarray,
    search_region: Tuple[int, int, int, int],
    candidates: List[TextBand],
    selected: Optional[List[TextBand]] = None,
    title: str = "19_text_band_candidates",
) -> np.ndarray:
    sx1, sy1, sx2, sy2 = search_region
    vis = image_bgr.copy()
    cv2.rectangle(vis, (sx1, sy1), (sx2, sy2), (200, 200, 0), 1)
    sel_set = {id(b) for b in (selected or [])}
    for i, b in enumerate(candidates):
        color = (0, 255, 0) if selected and b in selected else (255, 160, 0)
        cv2.rectangle(vis, (sx1 + 4, b.y1), (sx2 - 4, b.y2), color, 1)
        cv2.putText(
            vis,
            str(i),
            (sx1 + 8, max(sy1 + 14, b.y1 + 12)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.4,
            color,
            1,
        )
    return np.vstack([_header(title, vis.shape[1]), vis])


def draw_midpoint_boundaries(
    image_bgr: np.ndarray,
    boundaries: List[int],
    bands: List[TextBand],
) -> np.ndarray:
    vis = image_bgr.copy()
    for y in boundaries:
        cv2.line(vis, (0, y), (vis.shape[1] - 1, y), (0, 0, 255), 1)
    for b in bands:
        cy = int(b.center_y)
        cv2.circle(vis, (vis.shape[1] // 2, cy), 4, (0, 255, 0), -1)
    return np.vstack([_header("21_text_band_midpoint_boundaries", vis.shape[1]), vis])


def draw_hybrid_snap(
    image_bgr: np.ndarray,
    boundaries: List[int],
    snapped: List[bool],
) -> np.ndarray:
    vis = image_bgr.copy()
    for y, sn in zip(boundaries, snapped):
        color = (255, 0, 255) if sn else (0, 140, 255)
        cv2.line(vis, (0, y), (vis.shape[1] - 1, y), color, 2)
    return np.vstack([_header("22_hybrid_boundary_snap (magenta=physical snap)", vis.shape[1]), vis])


def draw_final_table_rows(
    image_bgr: np.ndarray,
    table_bbox: Tuple[int, int, int, int],
    boundaries: List[int],
    structure_mode: str,
) -> np.ndarray:
    x1, y1, x2, y2 = table_bbox
    vis = image_bgr.copy()
    cv2.rectangle(vis, (x1, y1), (x2, y2), (0, 220, 0), 2)
    for y in boundaries:
        cv2.line(vis, (x1, y), (x2, y), (0, 0, 255), 1)
    for i in range(8):
        ry1 = boundaries[i]
        ry2 = boundaries[i + 1]
        cy = (ry1 + ry2) // 2
        cv2.putText(
            vis,
            str(i + 1),
            (x1 + 6, cy),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (255, 100, 0),
            2,
        )
    foot = _header(f"23_final_table_rows | {structure_mode}", vis.shape[1], 40)
    return np.vstack([vis, foot])


def write_text_band_debug_bundle(
    image_bgr: np.ndarray,
    search_region: Tuple[int, int, int, int],
    fallback: TextBandFallbackResult,
    table_bbox: Tuple[int, int, int, int],
    structure_mode: str,
    output_dir,
) -> None:
    from pathlib import Path

    out = Path(output_dir)
    raw_bands = []
    if fallback.projection is not None and fallback.text_mask is not None:
        sx1, sy1, _, _ = search_region
        min_band_h = 8
        from src.text_band_fallback import _cluster_projection_peaks

        raw_bands = _cluster_projection_peaks(
            fallback.projection, sy1, min_band_h, 6
        )
        for b in raw_bands:
            b.horizontal_coverage = 0.0

    if fallback.text_mask is not None:
        cv2.imwrite(
            str(out / "17_text_mask.png"),
            draw_text_mask_debug(image_bgr, search_region, fallback.text_mask),
        )
    if fallback.projection is not None:
        cv2.imwrite(
            str(out / "18_horizontal_text_projection.png"),
            draw_projection_debug(
                image_bgr, search_region, fallback.projection, raw_bands
            ),
        )
    cv2.imwrite(
        str(out / "19_text_band_candidates.png"),
        draw_band_candidates(image_bgr, search_region, raw_bands or fallback.bands),
    )
    cv2.imwrite(
        str(out / "20_selected_8_text_bands.png"),
        draw_band_candidates(
            image_bgr,
            search_region,
            raw_bands or fallback.bands,
            selected=fallback.bands,
            title="20_selected_8_text_bands",
        ),
    )
    if fallback.boundaries:
        cv2.imwrite(
            str(out / "21_text_band_midpoint_boundaries.png"),
            draw_midpoint_boundaries(image_bgr, fallback.boundaries, fallback.bands),
        )
        cv2.imwrite(
            str(out / "22_hybrid_boundary_snap.png"),
            draw_hybrid_snap(
                image_bgr, fallback.boundaries, fallback.snapped_to_physical
            ),
        )
        cv2.imwrite(
            str(out / "23_final_table_rows.png"),
            draw_final_table_rows(
                image_bgr, table_bbox, fallback.boundaries, structure_mode
            ),
        )
