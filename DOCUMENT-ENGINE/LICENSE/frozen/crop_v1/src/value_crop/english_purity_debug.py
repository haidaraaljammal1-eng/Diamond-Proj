"""Debug visuals for English fixed-label purity."""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

from src.detect_rows import RowInfo
from src.value_crop.canonical import normalize_row
from src.value_crop.models import ValueCropResult
from src.value_crop.template_ink import compute_template_ink_bbox, load_template_ink_bboxes


EN_TEMPLATE_FIELDS = [
    ("license_number", "license_number_en"),
    ("name_en", "name_en_label"),
    ("nationality", "nationality_en"),
    ("date_of_birth", "date_of_birth_en"),
    ("issue_date", "issue_date_en"),
    ("expiry_date", "expiry_date_en"),
    ("place_of_issue", "place_of_issue_en"),
]


def build_english_label_purity_debug(
    template_dir: Path,
    image_bgr: np.ndarray,
    table_bbox: Tuple[int, int, int, int],
    rows: List[RowInfo],
    field_results: List[ValueCropResult],
    canonical_width: int,
) -> np.ndarray:
    tx1, _, tx2, _ = table_bbox
    row_by_sem = {r.semantic: r for r in rows}
    res_by_sem = {r.semantic: r for r in field_results}
    ink_bbs = load_template_ink_bboxes(template_dir)
    panels = []

    for semantic, tmpl_name in EN_TEMPLATE_FIELDS:
        tmpl_path = template_dir / f"{tmpl_name}.png"
        if not tmpl_path.is_file():
            continue
        tmpl = cv2.imread(str(tmpl_path))
        if tmpl is None:
            continue
        gray_t = cv2.cvtColor(tmpl, cv2.COLOR_BGR2GRAY) if tmpl.ndim == 3 else tmpl
        tbb = compute_template_ink_bbox(gray_t)
        tvis = cv2.cvtColor(gray_t, cv2.COLOR_GRAY2BGR)
        cv2.rectangle(tvis, (tbb[0], tbb[1]), (tbb[2] - 1, tbb[3] - 1), (0, 0, 255), 1)

        row_vis = np.full((max(tvis.shape[0], 40), 220, 3), 255, dtype=np.uint8)
        th, tw = tvis.shape[:2]
        row_vis[4 : 4 + th, 4 : 4 + tw] = tvis[: min(th, row_vis.shape[0] - 4), : min(tw, 216)]

        fres = res_by_sem.get(semantic)
        row = row_by_sem.get(semantic)
        bleed = "?"
        if fres and fres.english_label:
            bleed = fres.english_label.en_bleed_check or "?"
        title = np.full((22, row_vis.shape[1], 3), 245, dtype=np.uint8)
        cv2.putText(
            title,
            f"{tmpl_name} bleed={bleed}",
            (4, 16),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.38,
            (40, 40, 40),
            1,
        )
        panels.append(np.vstack([title, row_vis]))

    if not panels:
        return np.full((120, 400, 3), 255, dtype=np.uint8)
    cols = 2
    margin = 8
    cell_h = max(p.shape[0] for p in panels)
    cell_w = max(p.shape[1] for p in panels)
    rows_n = (len(panels) + cols - 1) // cols
    sheet = np.full(
        (rows_n * (cell_h + margin) + margin, cols * (cell_w + margin) + margin, 3),
        255,
        dtype=np.uint8,
    )
    for idx, panel in enumerate(panels):
        r, c = divmod(idx, cols)
        y0 = margin + r * (cell_h + margin)
        x0 = margin + c * (cell_w + margin)
        ph, pw = panel.shape[:2]
        sheet[y0 : y0 + ph, x0 : x0 + pw] = panel
    return sheet


def build_english_templates_before_after(template_dir: Path) -> Optional[np.ndarray]:
    archive = template_dir / "_en_rebuild_archive"
    pairs = []
    for name in ("nationality_en", "place_of_issue_en"):
        before = archive / f"{name}_before.png"
        after = template_dir / f"{name}.png"
        if before.is_file() and after.is_file():
            pairs.append((name, cv2.imread(str(before)), cv2.imread(str(after))))
    if not pairs:
        return None
    panels = []
    max_w = 0
    for name, b, a in pairs:
        h = max(b.shape[0], a.shape[0])
        w = max(b.shape[1], a.shape[1]) * 2 + 40
        max_w = max(max_w, w)
        row = np.full((h + 30, w, 3), 255, dtype=np.uint8)
        cv2.putText(row, f"{name} BEFORE", (4, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 200), 1)
        cv2.putText(
            row,
            "AFTER",
            (b.shape[1] + 24, 18),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (0, 160, 0),
            1,
        )
        row[22 : 22 + b.shape[0], 4 : 4 + b.shape[1]] = b
        row[22 : 22 + a.shape[0], b.shape[1] + 24 : b.shape[1] + 24 + a.shape[1]] = a
        panels.append(row)
    out = []
    for row in panels:
        if row.shape[1] < max_w:
            pad = np.full((row.shape[0], max_w - row.shape[1], 3), 255, dtype=np.uint8)
            row = np.hstack([row, pad])
        out.append(row)
    return np.vstack(out)


def draw_english_label_boundary_zoom(
    image_bgr: np.ndarray,
    table_bbox: Tuple[int, int, int, int],
    rows: List[RowInfo],
    field_results: List[ValueCropResult],
    canonical_width: int,
    tiny_gap: int,
) -> np.ndarray:
    tx1, _, tx2, _ = table_bbox
    row_by_sem = {r.semantic: r for r in rows}
    zooms = []

    for semantic, _ in EN_TEMPLATE_FIELDS:
        fres = next((f for f in field_results if f.semantic == semantic), None)
        row = row_by_sem.get(semantic)
        if fres is None or row is None or fres.english_label is None:
            continue
        row_bgr = image_bgr[row.y1 : row.y2, tx1:tx2]
        norm, _ = normalize_row(row_bgr, canonical_width)
        vis = cv2.cvtColor(cv2.cvtColor(norm, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
        en = fres.english_label
        tx1b, ty1b, tx2b, ty2b = en.template_match_bbox
        ix1, iy1, ix2, iy2 = en.ink_bbox
        cv2.rectangle(vis, (tx1b, ty1b), (tx2b, ty2b), (180, 180, 180), 1)
        cv2.rectangle(vis, (ix1, iy1), (ix2, iy2), (255, 120, 0), 2)
        if en.next_value_component_x is not None:
            nx = en.next_value_component_x
            cv2.line(vis, (nx, 0), (nx, vis.shape[0] - 1), (0, 200, 255), 1)
        vx1_line = en.right_edge + tiny_gap
        cv2.line(vis, (vx1_line, 0), (vx1_line, vis.shape[0] - 1), (0, 220, 0), 1)
        if fres.value_bbox_canonical:
            vx1, vy1, vx2, vy2 = fres.value_bbox_canonical
            cv2.rectangle(vis, (vx1, vy1), (vx2, vy2), (0, 255, 0), 1)

        cx = max(ix2, en.right_edge)
        x1 = max(0, cx - 70)
        x2 = min(vis.shape[1], cx + 90)
        crop = vis[:, x1:x2]
        scale = 3
        crop = cv2.resize(
            crop, (crop.shape[1] * scale, crop.shape[0] * scale), interpolation=cv2.INTER_NEAREST
        )
        title = np.full((36, crop.shape[1], 3), 245, dtype=np.uint8)
        cv2.putText(
            title,
            f"{semantic.upper()} R={en.right_edge} nxt={en.next_value_component_x} {en.en_bleed_check}",
            (4, 14),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.38,
            (0, 60, 120),
            1,
        )
        cv2.putText(
            title,
            f"value_x1={vx1_line} gap={en.next_value_component_x - en.right_edge if en.next_value_component_x else '?' }",
            (4, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.35,
            (60, 60, 60),
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
