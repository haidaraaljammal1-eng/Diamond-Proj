"""Recover English TYPE_2 value phrase when the text mask misses faint ink."""

from __future__ import annotations

from typing import List, Optional, Tuple

import cv2
import numpy as np


def min_english_phrase_width(median_h: int) -> int:
    return max(14, int(round(0.38 * median_h)))


def recover_english_phrase_from_ink(
    ink: np.ndarray,
    x_lo: int,
    x_hi: int,
    text_y1: int,
    text_y2: int,
    median_h: int,
) -> Optional[Tuple[int, int, int, int]]:
    """Union of text-like components in the window (full ink, not TYPE2 mask)."""
    h, w = ink.shape[:2]
    x_lo = max(0, min(w - 1, x_lo))
    x_hi = max(x_lo + 1, min(w, x_hi))
    y1 = max(0, text_y1)
    y2 = min(h, text_y2)
    if x_hi - x_lo < 8 or y2 <= y1:
        return None

    band = ink[y1:y2, x_lo:x_hi]
    num, _, stats, _ = cv2.connectedComponentsWithStats(band, connectivity=8)
    min_h = max(4, int(0.28 * median_h))
    min_a = max(12, int(0.10 * median_h * median_h))
    boxes: List[Tuple[int, int, int, int]] = []
    for i in range(1, num):
        bx, by, bw, bh, area = stats[i]
        if bh < min_h or area < min_a:
            continue
        if bw < 2:
            continue
        boxes.append((x_lo + bx, y1 + by, x_lo + bx + bw, y1 + by + bh))
    if not boxes:
        return _recover_from_column_projection(
            ink, x_lo, x_hi, text_y1, text_y2, median_h
        )

    boxes.sort(key=lambda b: b[0])
    gap_px = max(6, int(round(median_h * 1.05)))
    merged: List[Tuple[int, int, int, int]] = [boxes[0]]
    for box in boxes[1:]:
        prev = merged[-1]
        if box[0] - prev[2] <= gap_px:
            merged[-1] = (
                prev[0],
                min(prev[1], box[1]),
                max(prev[2], box[2]),
                max(prev[3], box[3]),
            )
        else:
            merged.append(box)

    min_w = min_english_phrase_width(median_h)
    best = max(merged, key=lambda b: b[2] - b[0])
    if best[2] - best[0] < min_w:
        wide = [b for b in merged if b[2] - b[0] >= min_w]
        if not wide:
            return _recover_from_column_projection(
                ink, x_lo, x_hi, text_y1, text_y2, median_h
            )
        best = max(wide, key=lambda b: b[2] - b[0])
    return best


def _recover_from_column_projection(
    ink: np.ndarray,
    x_lo: int,
    x_hi: int,
    text_y1: int,
    text_y2: int,
    median_h: int,
) -> Optional[Tuple[int, int, int, int]]:
    """Faint English on security patterns often appears as thin horizontal strokes."""
    h, w = ink.shape[:2]
    x_lo = max(0, min(w - 1, x_lo))
    x_hi = max(x_lo + 1, min(w, x_hi))
    y1 = max(0, text_y1)
    y2 = min(h, text_y2)
    band = ink[y1:y2, x_lo:x_hi]
    if band.size == 0:
        return None
    proj = np.sum(band > 0, axis=0).astype(np.int32)
    row_h = max(1, y2 - y1)
    thr = max(1, int(0.06 * row_h))
    active = proj >= thr
    segments: List[Tuple[int, int]] = []
    i = 0
    while i < active.size:
        if not active[i]:
            i += 1
            continue
        j = i + 1
        while j < active.size and active[j]:
            j += 1
        segments.append((i, j))
        i = j
    if not segments:
        return None
    merge_gap = max(8, int(round(0.85 * median_h)))
    merged: List[Tuple[int, int]] = [segments[0]]
    for seg in segments[1:]:
        prev = merged[-1]
        if seg[0] - prev[1] <= merge_gap:
            merged[-1] = (prev[0], seg[1])
        else:
            merged.append(seg)
    min_w = min_english_phrase_width(median_h)
    wide = [s for s in merged if s[1] - s[0] >= min_w]
    if not wide:
        return None
    row_h = max(1, y2 - y1)
    tall_thr = max(7, int(0.34 * row_h))

    def _seg_has_tall(seg: Tuple[int, int]) -> bool:
        sl = band[:, seg[0] : seg[1]]
        for dx in range(sl.shape[1]):
            if _max_vertical_run(sl[:, dx]) >= tall_thr:
                return True
        return False

    latin_wide = [s for s in wide if not _seg_has_tall(s)]
    if latin_wide:
        best_seg = max(latin_wide, key=lambda s: s[1] - s[0])
    else:
        best_seg = min(wide, key=lambda s: s[0])
    x1 = x_lo + best_seg[0]
    x2 = x_lo + best_seg[1]
    rows = np.where(band[:, best_seg[0] : best_seg[1]] > 0)[0]
    if rows.size == 0:
        return (x1, y1, x2, y2)
    return (x1, y1 + int(rows.min()), x2, y1 + int(rows.max()) + 1)


def phrase_width_ok(bbox: Tuple[int, int, int, int], median_h: int) -> bool:
    return (bbox[2] - bbox[0]) >= min_english_phrase_width(median_h)


def _max_vertical_run(col: np.ndarray) -> int:
    if col.size == 0:
        return 0
    best = cur = 0
    for v in col:
        if v > 0:
            cur += 1
            best = max(best, cur)
        else:
            cur = 0
    return best


def _tight_text_row_span(
    ink: np.ndarray,
    x1: int,
    x2: int,
    y1: int,
    y2: int,
) -> Tuple[int, int]:
    strip = ink[y1:y2, x1:x2]
    if strip.size == 0:
        return y1, y2
    row_sums = np.sum(strip > 0, axis=1)
    idx = np.where(row_sums > 0)[0]
    if idx.size == 0:
        return y1, y2
    return y1 + int(idx[0]), y1 + int(idx[-1]) + 1


def _latin_profile_column(band: np.ndarray, dx: int, thin_thr: int) -> bool:
    if dx < 0 or dx >= band.shape[1]:
        return False
    col = band[:, dx]
    if np.count_nonzero(col) == 0:
        return False
    return _max_vertical_run(col) <= thin_thr


def cap_type2_english_right_edge(
    ink: np.ndarray,
    bbox: Tuple[int, int, int, int],
    ar_translation_x1: Optional[int],
    gap: int,
    median_h: int = 12,
) -> Tuple[int, int, int, int]:
    """Cap English value at Arabic translation without left-side trimming."""
    x1, y1, x2, y2 = bbox
    h, w = ink.shape[:2]
    x1, x2 = max(0, x1), min(w, x2)
    y1, y2 = max(0, y1), min(h, y2)
    if ar_translation_x1 is not None and ar_translation_x1 > x1:
        x2 = min(x2, ar_translation_x1 - gap)
    band = ink[y1:y2, x1:x2]
    if band.size == 0:
        return (x1, y1, x2, y2)
    row_h = max(1, y2 - y1)
    tall_thr = max(7, int(0.34 * row_h))
    bw = band.shape[1]
    min_tall_run = 3
    run = 0
    cut_at: Optional[int] = None
    for dx in range(bw - 1, -1, -1):
        if _max_vertical_run(band[:, dx]) >= tall_thr:
            run += 1
        else:
            if run >= min_tall_run:
                cut_at = dx + 1
                break
            run = 0
    if cut_at is None and run >= min_tall_run:
        cut_at = 0
    if cut_at is not None and cut_at < bw:
        x2 = min(x2, x1 + max(1, cut_at - gap))
    return (x1, y1, x2, y2)


def trim_type2_english_bbox(
    ink: np.ndarray,
    bbox: Tuple[int, int, int, int],
    ar_translation_x1: Optional[int],
    gap: int,
    median_h: int = 12,
) -> Tuple[int, int, int, int]:
    """Drop Arabic tall-glyphs and left label/speck noise (nationality-style rows)."""
    x1, y1, x2, y2 = cap_type2_english_right_edge(
        ink, bbox, ar_translation_x1, gap, median_h
    )
    h, w = ink.shape[:2]
    x1, x2 = max(0, x1), min(w, x2)
    y1, y2 = max(0, y1), min(h, y2)
    if x2 - x1 < 10:
        return (x1, y1, x2, y2)

    ty1, ty2 = _tight_text_row_span(ink, x1, x2, y1, y2)
    band = ink[ty1:ty2, x1:x2]
    if band.size == 0:
        return (x1, y1, x2, y2)

    thin_thr = max(5, int(0.24 * max(1, y2 - y1)))
    bw = band.shape[1]

    min_w = min_english_phrase_width(median_h)
    latin_runs: List[Tuple[int, int]] = []
    i = 0
    while i < bw:
        if not _latin_profile_column(band, i, thin_thr):
            i += 1
            continue
        j = i + 1
        while j < bw and _latin_profile_column(band, j, thin_thr):
            j += 1
        latin_runs.append((i, j))
        i = j
    if latin_runs:
        def _run_density(run: Tuple[int, int]) -> float:
            lo, hi = run
            return float(np.sum(band[:, lo:hi])) / max(1, hi - lo)

        lo, hi = max(latin_runs, key=_run_density)
        if hi - lo >= min_w:
            span = hi - lo
            single_run = len(latin_runs) == 1
            if single_run and span <= max(120, int(2.8 * min_w)):
                x1 = x1 + lo
                x2 = min(x2, x1 + span)
            elif span >= int(0.72 * bw) and span > int(2.5 * min_w):
                proj = np.sum(band[:, lo:hi] > 0, axis=0).astype(np.float32)
                win = min(span, max(min_w, int(round(0.42 * span))))
                best_i, best_s = 0, -1.0
                for i in range(0, span - win + 1):
                    s = float(np.sum(proj[i : i + win]))
                    if s > best_s:
                        best_s = s
                        best_i = i
                x1 = x1 + lo + best_i
                x2 = min(x2, x1 + win)
            else:
                x1 = x1 + lo
                x2 = min(x2, x1 + (hi - lo))
    elif bw >= min_w:
        proj = np.sum(band > 0, axis=0).astype(np.float32)
        win = min(bw, max(min_w, int(round(0.42 * bw))))
        best_i, best_s = 0, -1.0
        for i in range(0, bw - win + 1):
            s = float(np.sum(proj[i : i + win]))
            if s > best_s:
                best_s = s
                best_i = i
        if best_s > 0:
            x1 = x1 + best_i
            x2 = min(x2, x1 + win)

    if x2 - x1 < min_w:
        return (x1, y1, x2, y2)
    return (x1, y1, x2, y2)


def assert_english_crop_glyph_profile(
    ink: np.ndarray,
    bbox: Tuple[int, int, int, int],
    min_span_width: int = 14,
) -> bool:
    """Reject value boxes that are only security-pattern specks (no readable EN band)."""
    x1, y1, x2, y2 = bbox
    h, w = ink.shape[:2]
    x1, x2 = max(0, x1), min(w, x2)
    y1, y2 = max(0, y1), min(h, y2)
    if x2 - x1 < min_span_width:
        return False
    band = ink[y1:y2, x1:x2]
    if band.size == 0:
        return False
    row_h = max(1, y2 - y1)
    thin_thr = max(5, int(0.24 * row_h))
    latin_cols = sum(
        1 for dx in range(band.shape[1]) if _latin_profile_column(band, dx, thin_thr)
    )
    if latin_cols >= max(12, int(0.35 * (x2 - x1))):
        return True
    tall_cols = sum(
        1
        for dx in range(band.shape[1])
        if _max_vertical_run(band[:, dx]) >= max(7, int(0.34 * row_h))
    )
    return tall_cols >= 3 and (x2 - x1) >= min_span_width
