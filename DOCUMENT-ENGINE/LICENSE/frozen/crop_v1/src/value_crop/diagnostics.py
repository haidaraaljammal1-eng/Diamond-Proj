"""Value-crop debug visualizations."""

from __future__ import annotations

from pathlib import Path
from typing import List, Tuple

import cv2
import numpy as np

from src.detect_rows import RowInfo
from src.value_crop.canonical import normalize_row
from src.value_crop.models import ValueCropResult
from src.value_crop.preprocess import prepare_ink_mask, suppress_table_lines
from src.value_crop.template_ink import build_template_ink_bbox_debug


def build_label_templates_debug(template_dir: Path) -> np.ndarray:
    paths = sorted(
        p
        for p in template_dir.glob("*.png")
        if p.name not in ("label_templates_debug.png", "label_templates_ink_bbox_debug.png")
    )
    if not paths:
        return np.full((120, 400, 3), 255, dtype=np.uint8)
    patches = []
    max_h = 0
    for p in paths:
        img = cv2.imread(str(p))
        if img is None:
            continue
        max_h = max(max_h, img.shape[0])
        patches.append((p.stem, img))
    if not patches:
        return np.full((120, 400, 3), 255, dtype=np.uint8)

    margin = 8
    total_w = sum(im.shape[1] for _, im in patches) + margin * (len(patches) + 1)
    sheet = np.full((max_h + 40, total_w, 3), 255, dtype=np.uint8)
    x = margin
    for name, img in patches:
        h, w = img.shape[:2]
        sheet[30 : 30 + h, x : x + w] = img
        cv2.putText(
            sheet,
            name[:18],
            (x, 22),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.35,
            (40, 40, 40),
            1,
        )
        x += w + margin
    return sheet


def draw_fixed_label_anchor_debug(
    image_bgr: np.ndarray,
    table_bbox: Tuple[int, int, int, int],
    rows: List[RowInfo],
    field_results: List[ValueCropResult],
    canonical_width: int,
) -> np.ndarray:
    tx1, _, tx2, _ = table_bbox
    out = image_bgr.copy()
    row_by_sem = {r.semantic: r for r in rows}

    for fres in field_results:
        row = row_by_sem.get(fres.semantic)
        if row is None:
            continue
        row_bgr = image_bgr[row.y1 : row.y2, tx1:tx2]
        _, scale = normalize_row(row_bgr, canonical_width)

        def to_global(bbox, color, thickness=1):
            if bbox is None:
                return
            x1, y1, x2, y2 = bbox
            gx1 = tx1 + int(round(x1 / scale))
            gy1 = row.y1 + int(round(y1 / scale))
            gx2 = tx1 + int(round(x2 / scale))
            gy2 = row.y1 + int(round(y2 / scale))
            cv2.rectangle(out, (gx1, gy1), (gx2, gy2), color, thickness)

        for det, tcolor, icolor in (
            (fres.english_label, (180, 180, 180), (255, 120, 0)),
            (fres.arabic_label, (180, 180, 180), (0, 140, 255)),
        ):
            if det is None:
                continue
            to_global(det.template_match_bbox, tcolor, 1)
            to_global(det.ink_bbox, icolor, 2)
            x1, y1, _, _ = det.ink_bbox
            gx = tx1 + int(round(x1 / scale))
            cv2.putText(
                out,
                f"w={det.detected_width_ratio:.2f}",
                (gx, max(row.y1, row.y1 + 10)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.32,
                icolor,
                1,
            )

        if fres.value_bbox_canonical is not None:
            vx1, vy1, vx2, vy2 = fres.value_bbox_canonical
            to_global((vx1, vy1, vx2, vy2), (0, 220, 0), 2)
    return out


def draw_translated_value_split_debug(
    image_bgr: np.ndarray,
    table_bbox: Tuple[int, int, int, int],
    rows: List[RowInfo],
    field_results: List[ValueCropResult],
    canonical_width: int,
) -> np.ndarray:
    tx1, _, tx2, _ = table_bbox
    panels = []
    for semantic in ("nationality", "place_of_issue"):
        fres = next((f for f in field_results if f.semantic == semantic), None)
        row = next((r for r in rows if r.semantic == semantic), None)
        if fres is None or row is None:
            continue
        row_bgr = image_bgr[row.y1 : row.y2, tx1:tx2]
        norm, _ = normalize_row(row_bgr, canonical_width)
        gray = cv2.cvtColor(norm, cv2.COLOR_BGR2GRAY)
        from src.value_crop.type2_split import build_type2_text_mask

        h = norm.shape[0]
        vis = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

        if fres.english_label:
            ex1, ey1, ex2, ey2 = fres.english_label.ink_bbox
            cv2.rectangle(vis, (ex1, ey1), (ex2, ey2), (255, 120, 0), 1)
        if fres.arabic_label:
            ax1, ay1, ax2, ay2 = fres.arabic_label.ink_bbox
            cv2.rectangle(vis, (ax1, ay1), (ax2, ay2), (0, 140, 255), 1)

        t2 = fres.type2
        if t2 is not None:
            cv2.rectangle(
                vis,
                (t2.internal_x1, 0),
                (t2.internal_x2, h - 1),
                (0, 255, 255),
                1,
            )
            mask = build_type2_text_mask(gray, t2.internal_x1, t2.internal_x2, 0, h - 1)
            overlay = vis.copy()
            overlay[mask > 0] = (overlay[mask > 0] * 0.5 + np.array((80, 80, 255)) * 0.5).astype(
                np.uint8
            )
            vis = overlay
            from src.value_crop.type2_split import extract_text_islands

            islands = extract_text_islands(
                mask,
                t2.internal_x1,
                t2.internal_x2,
                0,
                h - 1,
            )
            for ix1, iy1, ix2, iy2 in islands:
                cv2.rectangle(vis, (ix1, iy1), (ix2, iy2), (200, 100, 255), 1)
            ax1, ay1, ax2, ay2 = t2.arabic_value_full_bbox
            if ax2 > ax1:
                thick = 2 if "COMPLETE" in t2.arabic_phrase_status else 1
                cv2.rectangle(vis, (ax1, ay1), (ax2, ay2), (255, 0, 255), thick)
                if "PARTIAL" in t2.arabic_phrase_status:
                    cv2.putText(
                        vis,
                        "PARTIAL",
                        (ax1, max(12, ay1 - 2)),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.35,
                        (255, 0, 255),
                        1,
                    )
            cv2.line(
                vis,
                (t2.arabic_value_left_edge, 0),
                (t2.arabic_value_left_edge, h - 1),
                (255, 255, 0),
                1,
            )
            if t2.projection_split_x is not None:
                cv2.line(
                    vis,
                    (t2.projection_split_x, 0),
                    (t2.projection_split_x, h - 1),
                    (0, 255, 0),
                    1,
                )
            if t2.translation_split_x is not None:
                cv2.line(
                    vis,
                    (t2.translation_split_x, 0),
                    (t2.translation_split_x, h - 1),
                    (0, 0, 255),
                    2,
                )
        if fres.value_bbox_canonical is not None:
            vx1, vy1, vx2, vy2 = fres.value_bbox_canonical
            cv2.rectangle(vis, (vx1, vy1), (vx2, vy2), (0, 220, 0), 2)

        header_h = 52
        header = np.full((header_h, vis.shape[1], 3), 240, dtype=np.uint8)
        msg = f"{semantic} {fres.field_status.value}"
        if t2 is not None:
            agree_txt = "N/A" if t2.estimates_agree is None else str(t2.estimates_agree)
            msg += (
                f" | {t2.arabic_phrase_status} n={t2.arabic_component_count}"
                f" | {t2.support_mode} agree={agree_txt}"
            )
            cv2.putText(header, msg[:110], (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 80, 160), 1)
            cv2.putText(
                header,
                f"raw={t2.split_raw_score:.2f} norm={t2.normalized_confidence:.2f}"
                f" left_conf={t2.arabic_value_left_edge_confidence:.2f}",
                (6, 40),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.4,
                (60, 60, 60),
                1,
            )
        else:
            cv2.putText(header, msg[:90], (6, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 80, 160), 1)
        panels.append(np.vstack([header, vis]))

    if not panels:
        return np.full((200, 600, 3), 255, dtype=np.uint8)
    return np.vstack(panels)


def draw_type2_boundary_zoom(
    image_bgr: np.ndarray,
    table_bbox: Tuple[int, int, int, int],
    rows: List[RowInfo],
    field_results: List[ValueCropResult],
    canonical_width: int,
    zoom_px: int = 140,
) -> np.ndarray:
    tx1, _, tx2, _ = table_bbox
    zooms = []
    for semantic in ("nationality", "place_of_issue"):
        fres = next((f for f in field_results if f.semantic == semantic), None)
        row = next((r for r in rows if r.semantic == semantic), None)
        if fres is None or row is None or fres.type2 is None:
            continue
        row_bgr = image_bgr[row.y1 : row.y2, tx1:tx2]
        norm, _ = normalize_row(row_bgr, canonical_width)
        gray = cv2.cvtColor(norm, cv2.COLOR_BGR2GRAY)
        vis = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
        h, w = vis.shape[:2]
        t2 = fres.type2
        cx = t2.translation_split_x or t2.arabic_value_left_edge
        x1 = max(0, cx - zoom_px // 2)
        x2 = min(w, cx + zoom_px // 2)
        crop = vis[:, x1:x2].copy()
        scale = 3
        crop = cv2.resize(crop, (crop.shape[1] * scale, crop.shape[0] * scale), interpolation=cv2.INTER_NEAREST)
        rel_split = (cx - x1) * scale
        rel_ar = (t2.arabic_value_left_edge - x1) * scale
        cv2.line(
            crop,
            (int(rel_ar), 0),
            (int(rel_ar), crop.shape[0] - 1),
            (255, 255, 0),
            2,
        )
        if t2.translation_split_x is not None:
            cv2.line(
                crop,
                (int(rel_split), 0),
                (int(rel_split), crop.shape[0] - 1),
                (0, 0, 255),
                2,
            )
        ax1, ay1, ax2, ay2 = t2.arabic_value_full_bbox
        if ax2 > ax1:
            cv2.rectangle(
                crop,
                ((ax1 - x1) * scale, ay1 * scale),
                ((ax2 - x1) * scale, ay2 * scale),
                (255, 0, 255),
                2,
            )
        title = np.full((32, crop.shape[1], 3), 245, dtype=np.uint8)
        cv2.putText(
            title,
            f"{semantic.upper()} ZOOM | {t2.support_mode} | {t2.arabic_phrase_status}",
            (4, 22),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (0, 60, 120),
            1,
        )
        zooms.append(np.vstack([title, crop]))
    if not zooms:
        return np.full((200, 600, 3), 255, dtype=np.uint8)
    max_w = max(z.shape[1] for z in zooms)
    padded = []
    for z in zooms:
        if z.shape[1] < max_w:
            pad = np.full((z.shape[0], max_w - z.shape[1], 3), 245, dtype=np.uint8)
            z = np.hstack([z, pad])
        padded.append(z)
    return np.vstack(padded)


def draw_type2_two_front_segmentation(
    image_bgr: np.ndarray,
    table_bbox: Tuple[int, int, int, int],
    rows: List[RowInfo],
    field_results: List[ValueCropResult],
    canonical_width: int,
) -> np.ndarray:
    tx1, _, tx2, _ = table_bbox
    panels: List[np.ndarray] = []
    for semantic in ("nationality", "place_of_issue"):
        fres = next((f for f in field_results if f.semantic == semantic), None)
        row = next((r for r in rows if r.semantic == semantic), None)
        if fres is None or row is None or fres.type2 is None:
            continue
        row_bgr = image_bgr[row.y1 : row.y2, tx1:tx2]
        norm, _ = normalize_row(row_bgr, canonical_width)
        vis = cv2.cvtColor(norm, cv2.COLOR_BGR2GRAY)
        vis = cv2.cvtColor(vis, cv2.COLOR_GRAY2BGR)
        t2 = fres.type2
        h, w = vis.shape[:2]
        cv2.rectangle(
            vis,
            (t2.internal_x1, 0),
            (t2.internal_x2, h - 1),
            (180, 180, 180),
            1,
        )
        for isl in t2.ordered_islands:
            ix1, iy1, ix2, iy2 = isl["x1"], isl["y1"], isl["x2"], isl["y2"]
            cv2.rectangle(vis, (ix1, iy1), (ix2, iy2), (200, 200, 0), 1)
            cv2.putText(
                vis,
                str(isl.get("index", "")),
                (ix1, max(10, iy1 - 2)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.35,
                (120, 120, 0),
                1,
            )
        ex1, ey1, ex2, ey2 = t2.english_value_full_bbox
        if ex2 > ex1:
            cv2.rectangle(vis, (ex1, ey1), (ex2, ey2), (0, 200, 0), 2)
        ax1, ay1, ax2, ay2 = t2.arabic_value_full_bbox
        if ax2 > ax1:
            cv2.rectangle(vis, (ax1, ay1), (ax2, ay2), (255, 0, 255), 2)
        if t2.english_front_x2 > 0:
            cv2.line(
                vis,
                (t2.english_front_x2, 0),
                (t2.english_front_x2, h - 1),
                (0, 255, 0),
                1,
            )
        if t2.arabic_front_x1 > 0:
            cv2.line(
                vis,
                (t2.arabic_front_x1, 0),
                (t2.arabic_front_x1, h - 1),
                (255, 0, 255),
                1,
            )
        if t2.english_front_x2 and t2.arabic_front_x1 and t2.arabic_front_x1 > t2.english_front_x2:
            cv2.rectangle(
                vis,
                (t2.english_front_x2, 0),
                (t2.arabic_front_x1, h - 1),
                (40, 40, 40),
                1,
            )
        for row_g in t2.gap_score_table:
            gx = (row_g["x_left"] + row_g["x_right"]) // 2
            color = (0, 140, 255) if row_g.get("selected") else (80, 160, 220)
            cv2.line(vis, (gx, 0), (gx, h - 1), color, 1)
        if t2.translation_split_x is not None:
            cv2.line(
                vis,
                (t2.translation_split_x, 0),
                (t2.translation_split_x, h - 1),
                (0, 0, 255),
                2,
            )
        if fres.value_bbox is not None:
            vx1, vy1, vx2, vy2 = fres.value_bbox
            cv2.rectangle(vis, (vx1, vy1), (vx2, vy2), (0, 255, 255), 2)
        header = np.full((48, w, 3), 245, dtype=np.uint8)
        msg = (
            f"{semantic} | {t2.support_mode} | {t2.split_status.value} | "
            f"{t2.failure_code or 'ok'}"
        )
        cv2.putText(header, msg[:95], (4, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 60, 120), 1)
        cv2.putText(
            header,
            f"split={t2.translation_split_x} proj={t2.projection_split_x}",
            (4, 38),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.38,
            (60, 60, 60),
            1,
        )
        panels.append(np.vstack([header, vis]))
    if not panels:
        return np.full((200, 600, 3), 255, dtype=np.uint8)
    return np.vstack(panels)


def draw_value_boxes_on_rows(
    image_bgr: np.ndarray,
    table_bbox: Tuple[int, int, int, int],
    rows: List[RowInfo],
    field_results: List[ValueCropResult],
) -> np.ndarray:
    out = image_bgr.copy()
    tx1, ty1, tx2, ty2 = table_bbox
    cv2.rectangle(out, (tx1, ty1), (tx2, ty2), (0, 200, 0), 1)
    row_by_sem = {r.semantic: r for r in rows}
    for fres in field_results:
        row = row_by_sem.get(fres.semantic)
        if row is None or fres.value_bbox is None:
            continue
        vx1, vy1, vx2, vy2 = fres.value_bbox
        cv2.rectangle(
            out,
            (tx1 + vx1, row.y1 + vy1),
            (tx1 + vx2, row.y1 + vy2),
            (0, 255, 0),
            2,
        )
    return out


__all__ = [
    "build_label_templates_debug",
    "build_template_ink_bbox_debug",
    "draw_fixed_label_anchor_debug",
    "draw_translated_value_split_debug",
    "draw_type2_boundary_zoom",
    "draw_type2_two_front_segmentation",
    "draw_value_boxes_on_rows",
]
