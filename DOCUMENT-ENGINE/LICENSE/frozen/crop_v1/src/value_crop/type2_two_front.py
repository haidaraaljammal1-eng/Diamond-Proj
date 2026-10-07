"""Two-front TYPE_2 segmentation (English from left, Arabic from right)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from src.value_crop.type2_english_recover import min_english_phrase_width

import numpy as np

from src.value_crop.models import BoundaryStatus
from src.value_crop.type2_split import (
    ArValueGroupStatus,
    Type2SplitResult,
    Type2SupportMode,
    _baseline_compatible,
    _merge_phrase_groups,
    _union_boxes,
    extract_text_islands,
)


@dataclass
class _Island:
    x1: int
    y1: int
    x2: int
    y2: int
    idx: int

    @property
    def w(self) -> int:
        return self.x2 - self.x1

    @property
    def h(self) -> int:
        return self.y2 - self.y1

    def as_tuple(self) -> Tuple[int, int, int, int]:
        return (self.x1, self.y1, self.x2, self.y2)


@dataclass
class TwoFrontDebug:
    ordered_islands: List[Dict[str, Any]] = field(default_factory=list)
    english_phrase_bbox: Tuple[int, int, int, int] = (0, 0, 0, 0)
    arabic_phrase_bbox: Tuple[int, int, int, int] = (0, 0, 0, 0)
    english_front_x2: int = 0
    arabic_front_x1: int = 0
    gap_score_table: List[Dict[str, Any]] = field(default_factory=list)
    failure_code: Optional[str] = None
    english_islands: List[Tuple[int, int, int, int]] = field(default_factory=list)
    arabic_islands: List[Tuple[int, int, int, int]] = field(default_factory=list)


def _filter_noise(
    islands: List[_Island], median_h: int, median_area: float
) -> List[_Island]:
    min_h = max(4, int(0.35 * median_h))
    min_a = max(8, int(0.25 * median_area))
    kept: List[_Island] = []
    for isl in islands:
        if isl.h < min_h and isl.w < max(6, median_h // 2):
            continue
        area = isl.w * isl.h
        if area < min_a and isl.h < median_h * 0.5:
            continue
        kept.append(isl)
    return kept if kept else islands


def _filter_horizontal_rule_artifacts(
    islands: List[_Island],
    internal_w: int,
    text_y1: int,
    text_y2: int,
    median_h: int,
) -> List[_Island]:
    """Drop wide, thin ink at the row rim (table-line bleed), not real text."""
    if not islands:
        return islands
    band_h = max(1, text_y2 - text_y1)
    rim = max(3, band_h // 6)
    kept: List[_Island] = []
    for isl in islands:
        wide = isl.w >= int(0.38 * internal_w)
        thin = isl.h <= max(10, int(0.55 * median_h))
        top_rim = (isl.y1 - text_y1) <= rim
        if wide and thin and top_rim:
            continue
        if isl.w >= int(0.35 * internal_w) and isl.h <= max(8, int(0.42 * median_h)):
            if isl.w > isl.h * 10:
                continue
        if top_rim and isl.w >= int(0.35 * internal_w):
            upper_cap = text_y1 + max(12, int(0.82 * band_h))
            if isl.y2 <= upper_cap and isl.w > isl.h * 5:
                continue
        kept.append(isl)
    return kept if kept else islands


def _robust_intra_gap(gaps: List[int]) -> float:
    if not gaps:
        return 8.0
    arr = np.array(gaps, dtype=np.float32)
    return float(max(6.0, np.median(arr)))


def _grow_indices(
    groups: List[Tuple[int, int, int, int]],
    start: int,
    direction: int,
    merge_gap: int,
    band_tol: int,
) -> List[int]:
    if not groups:
        return []
    idxs = [start]
    if direction > 0:
        i = start + 1
        while i < len(groups):
            prev = _union_boxes([groups[j] for j in idxs])
            g = groups[i]
            gap = g[0] - prev[2]
            if gap <= merge_gap and _baseline_compatible(prev, g, band_tol):
                idxs.append(i)
                i += 1
            else:
                break
    else:
        i = start - 1
        while i >= 0:
            prev = _union_boxes([groups[j] for j in idxs])
            g = groups[i]
            gap = prev[0] - g[2]
            if gap <= merge_gap and _baseline_compatible(prev, g, band_tol):
                idxs.insert(0, i)
                i -= 1
            else:
                break
    return idxs


def _projection_valley_interval(
    mask: np.ndarray,
    x_lo: int,
    x_hi: int,
    text_y1: int,
    text_y2: int,
    median_h: int,
) -> Optional[Tuple[int, float]]:
    if x_hi - x_lo < max(8, median_h):
        return None
    band = mask[text_y1:text_y2, x_lo:x_hi]
    proj = np.sum(band > 0, axis=0).astype(np.float32)
    if proj.size < 5:
        return None
    k = max(3, median_h // 3)
    proj_s = np.convolve(proj, np.ones(k) / float(k), mode="same")
    valley_idx = int(np.argmin(proj_s))
    valley_val = float(proj_s[valley_idx])
    lw = max(2, median_h // 2)
    left_m = float(np.mean(proj_s[max(0, valley_idx - lw) : valley_idx + 1]))
    right_m = float(np.mean(proj_s[valley_idx : min(len(proj_s), valley_idx + lw)]))
    peak = max(left_m, right_m, 1.0)
    if left_m < 0.8 or right_m < 0.6:
        return None
    if valley_val > 0.58 * peak:
        return None
    depth = 1.0 - valley_val / peak
    return x_lo + valley_idx, depth


def _maybe_recover_english_union(
    ink: Optional[np.ndarray],
    en_union: Tuple[int, int, int, int],
    internal_x1: int,
    ar_front_x1: int,
    text_y1: int,
    text_y2: int,
    median_h: int,
) -> Tuple[int, int, int, int]:
    from src.value_crop.type2_english_recover import (
        min_english_phrase_width,
        phrase_width_ok,
        recover_english_phrase_from_ink,
    )

    if phrase_width_ok(en_union, median_h):
        return en_union
    if ink is None:
        return en_union
    cap_x = max(internal_x1 + 8, ar_front_x1 - max(4, median_h // 4))
    rec = recover_english_phrase_from_ink(
        ink, internal_x1, cap_x, text_y1, text_y2, median_h
    )
    if rec is None or not phrase_width_ok(rec, median_h):
        return en_union
    if rec[2] > cap_x:
        rec = (rec[0], rec[1], cap_x, rec[3])
    if not phrase_width_ok(rec, median_h):
        return en_union
    return rec


def analyze_type2_two_front(
    text_mask: np.ndarray,
    internal_x1: int,
    internal_x2: int,
    text_y1: int,
    text_y2: int,
    ink: Optional[np.ndarray] = None,
    arabic_field_label_left: Optional[int] = None,
) -> Tuple[Type2SplitResult, TwoFrontDebug]:
    dbg = TwoFrontDebug()
    internal_w = max(1, internal_x2 - internal_x1)
    raw_boxes = extract_text_islands(
        text_mask, internal_x1, internal_x2, text_y1, text_y2
    )
    if not raw_boxes:
        return _fail(internal_x1, internal_x2, text_mask, dbg, None), dbg

    islands = [_Island(*b, i) for i, b in enumerate(raw_boxes)]
    islands.sort(key=lambda x: x.x1)
    heights = [isl.h for isl in islands]
    areas = [isl.w * isl.h for isl in islands]
    median_h = max(8, int(np.median(heights)))
    median_area = float(max(8.0, np.median(areas)))
    islands = _filter_noise(islands, median_h, median_area)
    islands = _filter_horizontal_rule_artifacts(
        islands, internal_w, text_y1, text_y2, median_h
    )
    islands.sort(key=lambda x: x.x1)

    for isl in islands:
        dbg.ordered_islands.append(
            {
                "index": isl.idx,
                "x1": isl.x1,
                "x2": isl.x2,
                "y1": isl.y1,
                "y2": isl.y2,
                "width": isl.w,
                "height": isl.h,
            }
        )

    boxes = [isl.as_tuple() for isl in islands]
    gap_px = max(6, int(round(median_h * 1.05)))
    band_tol = max(4, median_h // 2)
    groups = _merge_phrase_groups(boxes, gap_px, band_tol)
    if not groups:
        return _fail(internal_x1, internal_x2, text_mask, dbg, None), dbg

    split_groups: List[Tuple[int, int, int, int]] = []
    wide_cut = max(int(0.46 * internal_w), median_h * 6)
    for g in groups:
        if g[2] - g[0] < wide_cut:
            split_groups.append(g)
            continue
        valley = _projection_valley_interval(
            text_mask, g[0], g[2], text_y1, text_y2, median_h
        )
        if valley is None:
            split_groups.append(g)
            continue
        vx, _depth = valley
        if vx <= g[0] + min_english_phrase_width(median_h) or vx >= g[2] - min_english_phrase_width(
            median_h
        ):
            split_groups.append(g)
            continue
        split_groups.append((g[0], g[1], vx, g[3]))
        split_groups.append((vx, g[1], g[2], g[3]))
    groups = sorted(split_groups, key=lambda b: b[0])

    en_start = 0
    ar_end = len(groups) - 1
    if ar_end < en_start:
        return _fail(internal_x1, internal_x2, text_mask, dbg, "TYPE2_GROUP_OVERLAP"), dbg

    ar_seed_x = internal_x1 + int(0.42 * internal_w)
    ar_right_anchor_x = internal_x2 - int(0.32 * internal_w)
    has_ar_value_ink = any(isl.x1 >= ar_seed_x for isl in islands)

    if not has_ar_value_ink:
        en_idxs = list(range(len(groups)))
        ar_idxs = []
        en_boxes = [groups[i] for i in en_idxs]
        dbg.english_islands = list(en_boxes)
        dbg.arabic_islands = []
        en_union = _union_boxes(en_boxes)
        dbg.english_phrase_bbox = en_union
        dbg.arabic_phrase_bbox = (0, 0, 0, 0)
        dbg.english_front_x2 = en_union[2]
        dbg.arabic_front_x1 = internal_x2
        split_margin = max(3, int(round(median_h * 0.18)))
        en_union = _maybe_recover_english_union(
            ink, en_union, internal_x1, internal_x2, text_y1, text_y2, median_h
        )
        dbg.english_phrase_bbox = en_union
        dbg.english_front_x2 = en_union[2]
        split_x = min(internal_x2 - 2, en_union[2] + split_margin)
        if arabic_field_label_left is not None:
            cap = arabic_field_label_left - max(gap_px, split_margin + 2)
            split_x = min(split_x, cap)
        if split_x <= internal_x1 + max(10, int(0.06 * internal_w)):
            return _fail(internal_x1, internal_x2, text_mask, dbg, "TYPE2_ENGLISH_VALUE_CLIPPED"), dbg
        dbg.gap_score_table.append(
            {
                "gap_index": 0,
                "x_left": en_union[2],
                "x_right": internal_x2,
                "gap_px": internal_x2 - en_union[2],
                "gap_over_median_h": round((internal_x2 - en_union[2]) / float(median_h), 3),
                "between_fronts": True,
                "projection_valley": False,
                "candidate_score": 2.2,
                "selected": True,
                "english_only_window": True,
            }
        )
        result = Type2SplitResult(
            internal_x1=internal_x1,
            internal_x2=internal_x2,
            arabic_value_full_bbox=(0, 0, 0, 0),
            arabic_value_left_edge=internal_x2,
            arabic_value_left_edge_confidence=0.85,
            arabic_phrase_status=ArValueGroupStatus.UNCERTAIN,
            arabic_component_count=0,
            arabic_islands=[],
            translation_split_x=split_x,
            split_raw_score=0.88,
            normalized_confidence=0.88,
            split_status=BoundaryStatus.FOUND,
            support_mode=Type2SupportMode.COMPONENT_GAP_STRONG,
            estimates_agree=None,
            text_mask=text_mask,
            english_value_full_bbox=en_union,
            english_islands=en_boxes,
            two_front_debug=dbg,
        )
        return result, dbg

    en_idxs = _grow_indices(groups, en_start, 1, gap_px, band_tol)
    def _ar_seed_index() -> int:
        for i in range(len(groups) - 1, -1, -1):
            if groups[i][0] >= ar_right_anchor_x:
                return i
        for i in range(len(groups) - 1, -1, -1):
            g = groups[i]
            if g[0] < ar_seed_x:
                continue
            if i > 0 and (g[0] - groups[i - 1][2]) < max(12, int(1.1 * median_h)):
                continue
            return i
        return ar_end

    ar_idxs = _grow_indices(groups, _ar_seed_index(), -1, gap_px, band_tol)
    if ar_idxs and groups[ar_idxs[0]][0] < ar_seed_x:
        ar_idxs = [i for i in ar_idxs if groups[i][0] >= ar_right_anchor_x]
    if not ar_idxs:
        en_boxes = list(groups)
        en_union = _maybe_recover_english_union(
            ink, _union_boxes(en_boxes), internal_x1, internal_x2, text_y1, text_y2, median_h
        )
        dbg.english_islands = en_boxes
        dbg.arabic_islands = []
        dbg.english_phrase_bbox = en_union
        dbg.arabic_phrase_bbox = (0, 0, 0, 0)
        dbg.english_front_x2 = en_union[2]
        dbg.arabic_front_x1 = internal_x2
        split_margin = max(3, int(round(median_h * 0.18)))
        split_x = min(internal_x2 - 2, en_union[2] + split_margin)
        if arabic_field_label_left is not None:
            split_x = min(split_x, arabic_field_label_left - max(gap_px, split_margin + 2))
        if split_x <= internal_x1 + max(10, int(0.06 * internal_w)):
            return _fail(internal_x1, internal_x2, text_mask, dbg, "TYPE2_ENGLISH_VALUE_CLIPPED"), dbg
        dbg.gap_score_table.append(
            {
                "gap_index": 0,
                "x_left": en_union[2],
                "x_right": internal_x2,
                "gap_px": internal_x2 - en_union[2],
                "gap_over_median_h": round((internal_x2 - en_union[2]) / float(median_h), 3),
                "between_fronts": True,
                "projection_valley": False,
                "candidate_score": 2.2,
                "selected": True,
                "english_only_window": True,
            }
        )
        result = Type2SplitResult(
            internal_x1=internal_x1,
            internal_x2=internal_x2,
            arabic_value_full_bbox=(0, 0, 0, 0),
            arabic_value_left_edge=internal_x2,
            arabic_value_left_edge_confidence=0.85,
            arabic_phrase_status=ArValueGroupStatus.UNCERTAIN,
            arabic_component_count=0,
            arabic_islands=[],
            translation_split_x=split_x,
            split_raw_score=0.88,
            normalized_confidence=0.88,
            split_status=BoundaryStatus.FOUND,
            support_mode=Type2SupportMode.COMPONENT_GAP_STRONG,
            estimates_agree=None,
            text_mask=text_mask,
            english_value_full_bbox=en_union,
            english_islands=en_boxes,
            two_front_debug=dbg,
        )
        return result, dbg

    ar_front_probe = groups[ar_idxs[0]][0] if ar_idxs else internal_x2
    min_en_w = min_english_phrase_width(median_h)
    en_probe = _union_boxes([groups[i] for i in en_idxs]) if en_idxs else (0, 0, 0, 0)
    if en_probe[2] - en_probe[0] < min_en_w and ar_idxs:
        split_margin = max(3, int(round(median_h * 0.18)))
        cap_i = min(ar_idxs)
        expanded = [i for i in range(cap_i) if groups[i][0] >= internal_x1]
        if not expanded:
            cap_x = ar_front_probe - split_margin
            expanded = [
                i
                for i, g in enumerate(groups)
                if g[0] >= internal_x1 and g[2] <= cap_x and i not in ar_idxs
            ]
        if expanded:
            en_idxs = expanded

    if set(en_idxs) & set(ar_idxs):
        dbg.failure_code = "TYPE2_GROUP_OVERLAP"
        return _fail(internal_x1, internal_x2, text_mask, dbg, dbg.failure_code), dbg

    en_boxes = [groups[i] for i in en_idxs]
    ar_boxes = [groups[i] for i in ar_idxs]
    dbg.english_islands = list(en_boxes)
    dbg.arabic_islands = list(ar_boxes)
    en_union = _union_boxes(en_boxes)
    ar_union = _union_boxes(ar_boxes)
    ar_front_x1 = ar_union[0]
    en_union = _maybe_recover_english_union(
        ink, en_union, internal_x1, ar_front_x1, text_y1, text_y2, median_h
    )
    if en_union[2] > ar_front_x1:
        dbg.failure_code = "TYPE2_GROUP_OVERLAP"
        return _fail(internal_x1, internal_x2, text_mask, dbg, dbg.failure_code), dbg
    dbg.english_phrase_bbox = en_union
    dbg.arabic_phrase_bbox = ar_union
    en_front_x2 = en_union[2]
    dbg.english_front_x2 = en_front_x2
    dbg.arabic_front_x1 = ar_front_x1

    en_first_x = en_union[0]
    swallow_tol = max(4, int(0.12 * median_h))
    if ar_union[0] <= internal_x1 + swallow_tol and en_front_x2 > internal_x1 + swallow_tol:
        dbg.failure_code = "ARABIC_GROUP_SWALLOWED_ENGLISH"
        return _fail(internal_x1, internal_x2, text_mask, dbg, dbg.failure_code), dbg

    if en_front_x2 > ar_front_x1:
        dbg.failure_code = "TYPE2_GROUP_OVERLAP"
        return _fail(internal_x1, internal_x2, text_mask, dbg, dbg.failure_code), dbg

    en_gaps = [
        groups[en_idxs[i + 1]][0] - groups[en_idxs[i]][2]
        for i in range(len(en_idxs) - 1)
    ]
    ar_gaps = [
        groups[ar_idxs[i]][0] - groups[ar_idxs[i - 1]][2]
        for i in range(1, len(ar_idxs))
    ]
    left_intra = _robust_intra_gap(en_gaps)
    right_intra = _robust_intra_gap(ar_gaps)
    sep_thresh = max(left_intra, right_intra) * 1.35 + 2.0

    split_margin = max(3, int(round(median_h * 0.18)))
    min_en_w = min_english_phrase_width(median_h)
    en_phrase_w = en_front_x2 - en_union[0]
    gap_candidates: List[Tuple[int, float, int]] = []
    gi = 0
    g_en = groups[en_idxs[-1]]
    g_ar = groups[ar_idxs[0]]
    g_between = g_ar[0] - g_en[2]
    if en_phrase_w < min_en_w and g_between >= sep_thresh * 1.5:
        bound_split = max(en_front_x2, g_ar[0] - split_margin)
    else:
        bound_split = max(en_front_x2, g_ar[0]) + split_margin
    dbg.gap_score_table.append(
        {
            "gap_index": gi,
            "x_left": g_en[2],
            "x_right": g_ar[0],
            "gap_px": max(0, g_between),
            "gap_over_median_h": round(max(0, g_between) / float(median_h), 3),
            "between_fronts": True,
            "projection_valley": False,
            "candidate_score": 2.55,
            "selected": False,
            "en_ar_boundary": True,
        }
    )
    gap_candidates.append((bound_split, 2.55, gi))
    gi += 1

    for i in range(len(groups) - 1):
        g1, g2 = groups[i], groups[i + 1]
        gap = g2[0] - g1[2]
        if gap < 1:
            continue
        if en_phrase_w < min_en_w and g1[2] <= en_front_x2 + 2 and g2[0] >= ar_front_x1 - 2:
            split_x = ar_front_x1 - split_margin
        else:
            split_x = g1[2] + gap // 2
        if split_x <= en_front_x2 + split_margin // 2 or split_x >= ar_front_x1:
            continue
        gap_norm = gap / float(median_h)
        score = gap_norm
        if gap >= sep_thresh:
            score += 1.2
        elif gap >= sep_thresh * 0.85:
            score += 0.5
        dbg.gap_score_table.append(
            {
                "gap_index": gi,
                "x_left": g1[2],
                "x_right": g2[0],
                "gap_px": gap,
                "gap_over_median_h": round(gap_norm, 3),
                "between_fronts": True,
                "projection_valley": False,
                "candidate_score": round(score, 3),
                "selected": False,
            }
        )
        gap_candidates.append((split_x, score, gi))
        gi += 1

    proj_x: Optional[int] = None
    proj_depth = 0.0
    valley = _projection_valley_interval(
        text_mask, en_front_x2, ar_front_x1, text_y1, text_y2, median_h
    )
    if valley is not None:
        proj_x, proj_depth = valley

    best_gap_x: Optional[int] = None
    best_gap_score = -1.0
    best_gi = -1
    for split_x, score, gidx in gap_candidates:
        if score > best_gap_score:
            best_gap_score = score
            best_gap_x = split_x
            best_gi = gidx

    split_x: Optional[int] = None
    support = Type2SupportMode.INSUFFICIENT
    agree: Optional[bool] = None
    tol = max(5, int(round(median_h * 0.55)))

    if best_gap_x is not None and proj_x is not None:
        if abs(proj_x - best_gap_x) <= tol:
            agree = True
            support = Type2SupportMode.BOTH_AGREE
            split_x = int(round((proj_x + best_gap_x) / 2))
        elif best_gap_score >= 1.4:
            agree = False
            support = Type2SupportMode.COMPONENT_GAP_STRONG
            split_x = best_gap_x
        elif proj_depth >= 0.35:
            agree = False
            support = Type2SupportMode.PROJECTION_ONLY_STRONG
            split_x = proj_x
        else:
            agree = False
            support = Type2SupportMode.CONFLICT
    elif best_gap_x is not None and best_gap_score >= 1.15:
        support = Type2SupportMode.COMPONENT_GAP_STRONG
        split_x = best_gap_x
    elif proj_x is not None and proj_depth >= 0.42:
        support = Type2SupportMode.PROJECTION_ONLY_STRONG
        split_x = proj_x

    if best_gi >= 0 and split_x is not None:
        for row in dbg.gap_score_table:
            if row["gap_index"] == best_gi:
                row["selected"] = True

    min_en = max(10, int(internal_w * 0.06))
    status = BoundaryStatus.NOT_FOUND
    left_conf = 0.0
    raw = 0.2
    norm_conf = 0.0

    if split_x is not None:
        if split_x < en_front_x2 + split_margin:
            dbg.failure_code = "TYPE2_ENGLISH_VALUE_CLIPPED"
        elif split_x - internal_x1 < min_en:
            dbg.failure_code = "TYPE2_ENGLISH_VALUE_CLIPPED"
        elif en_phrase_w < min_en_w:
            dbg.failure_code = "TYPE2_ENGLISH_PHRASE_TOO_NARROW"
        else:
            status = BoundaryStatus.FOUND
            left_conf = 0.72
            if support == Type2SupportMode.BOTH_AGREE:
                left_conf = 0.92
                raw = 0.95
            elif support == Type2SupportMode.COMPONENT_GAP_STRONG:
                left_conf = 0.82
                raw = 0.78 + 0.15 * min(1.0, best_gap_score / 2.0)
            elif support == Type2SupportMode.PROJECTION_ONLY_STRONG:
                left_conf = 0.75
                raw = 0.65 + 0.2 * proj_depth
            norm_conf = float(min(1.0, raw))

    if status != BoundaryStatus.FOUND:
        support = Type2SupportMode.INSUFFICIENT
        split_x = split_x if dbg.failure_code else None
        norm_conf = 0.0

    phrase_status = ArValueGroupStatus.COMPLETE
    if status != BoundaryStatus.FOUND:
        phrase_status = ArValueGroupStatus.UNCERTAIN
    elif ar_union[2] - ar_union[0] < int(0.35 * median_h):
        phrase_status = ArValueGroupStatus.PARTIAL

    result = Type2SplitResult(
        internal_x1=internal_x1,
        internal_x2=internal_x2,
        arabic_value_full_bbox=ar_union,
        arabic_value_left_edge=ar_front_x1,
        arabic_value_left_edge_confidence=left_conf,
        arabic_phrase_status=phrase_status,
        arabic_component_count=len(ar_boxes),
        arabic_islands=ar_boxes,
        projection_split_x=proj_x,
        translation_split_x=split_x,
        split_raw_score=raw,
        normalized_confidence=norm_conf,
        split_status=status,
        support_mode=support,
        estimates_agree=agree,
        text_mask=text_mask,
        english_value_full_bbox=en_union,
        english_islands=en_boxes,
        two_front_debug=dbg,
    )
    return result, dbg


def _fail(
    internal_x1: int,
    internal_x2: int,
    text_mask: np.ndarray,
    dbg: TwoFrontDebug,
    code: Optional[str],
) -> Type2SplitResult:
    dbg.failure_code = code
    return Type2SplitResult(
        internal_x1=internal_x1,
        internal_x2=internal_x2,
        arabic_value_full_bbox=dbg.arabic_phrase_bbox,
        arabic_value_left_edge=dbg.arabic_front_x1,
        arabic_value_left_edge_confidence=0.0,
        arabic_phrase_status=ArValueGroupStatus.UNCERTAIN,
        arabic_component_count=len(dbg.arabic_islands),
        arabic_islands=dbg.arabic_islands,
        split_status=BoundaryStatus.NOT_FOUND,
        support_mode=Type2SupportMode.INSUFFICIENT,
        normalized_confidence=0.0,
        estimates_agree=None,
        text_mask=text_mask,
        english_value_full_bbox=dbg.english_phrase_bbox,
        english_islands=dbg.english_islands,
        two_front_debug=dbg,
    )
