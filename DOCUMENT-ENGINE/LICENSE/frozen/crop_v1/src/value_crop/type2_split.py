"""TYPE 2: English value vs Arabic translated value (right-anchored split)."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, List, Optional, Tuple

import cv2
import numpy as np

from src.value_crop.models import BoundaryStatus


class ArValueGroupStatus(str, Enum):
    COMPLETE = "AR_VALUE_GROUP_COMPLETE"
    PARTIAL = "AR_VALUE_GROUP_PARTIAL"
    UNCERTAIN = "AR_VALUE_GROUP_UNCERTAIN"


class Type2SupportMode(str, Enum):
    BOTH_AGREE = "BOTH_AGREE"
    COMPONENT_ONLY_STRONG = "COMPONENT_ONLY_STRONG"
    COMPONENT_GAP_STRONG = "COMPONENT_GAP_STRONG"
    PROJECTION_ONLY_STRONG = "PROJECTION_ONLY_STRONG"
    CONFLICT = "CONFLICT"
    INSUFFICIENT = "INSUFFICIENT"


@dataclass
class Type2SplitResult:
    internal_x1: int
    internal_x2: int
    arabic_value_full_bbox: Tuple[int, int, int, int]
    arabic_value_left_edge: int
    arabic_value_left_edge_confidence: float
    arabic_phrase_status: ArValueGroupStatus
    arabic_component_count: int
    arabic_islands: List[Tuple[int, int, int, int]] = field(default_factory=list)
    projection_split_x: Optional[int] = None
    translation_split_x: Optional[int] = None
    split_raw_score: float = 0.0
    normalized_confidence: float = 0.0
    split_status: BoundaryStatus = BoundaryStatus.NOT_FOUND
    support_mode: Type2SupportMode = Type2SupportMode.INSUFFICIENT
    estimates_agree: Optional[bool] = None
    text_mask: Optional[np.ndarray] = None
    english_value_full_bbox: Tuple[int, int, int, int] = (0, 0, 0, 0)
    english_islands: List[Tuple[int, int, int, int]] = field(default_factory=list)
    two_front_debug: Any = None

    @property
    def arabic_value_bbox(self) -> Tuple[int, int, int, int]:
        """Alias: full phrase bbox when complete, else best-effort union."""
        return self.arabic_value_full_bbox


def build_type2_text_mask(
    gray: np.ndarray,
    internal_x1: int,
    internal_x2: int,
    text_y1: int,
    text_y2: int,
) -> np.ndarray:
    from src.value_crop.preprocess import prepare_ink_mask, suppress_table_lines

    proc = suppress_table_lines(gray)
    ink = prepare_ink_mask(proc)
    h, w = gray.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)
    x1 = max(0, internal_x1)
    x2 = min(w, internal_x2)
    y1 = max(0, text_y1)
    y2 = min(h, text_y2)
    band = ink[y1:y2, x1:x2].copy()
    bh = max(1, y2 - y1)
    bw = max(1, x2 - x1)
    num, _, stats, _ = cv2.connectedComponentsWithStats(band, connectivity=8)
    for i in range(1, num):
        bx, by, comp_w, comp_h, area = stats[i]
        if area < 8:
            band[by : by + comp_h, bx : bx + comp_w] = 0
            continue
        thin_rule_h = max(3, min(10, int(0.12 * bh)))
        if comp_h <= thin_rule_h and comp_w > int(0.38 * bw):
            band[by : by + comp_h, bx : bx + comp_w] = 0
        if comp_w <= 2 and comp_h > int(0.5 * bh):
            band[by : by + comp_h, bx : bx + comp_w] = 0
    mask[y1:y2, x1:x2] = band
    return mask


def extract_text_islands(
    mask: np.ndarray,
    x1: int,
    x2: int,
    y1: int,
    y2: int,
) -> List[Tuple[int, int, int, int]]:
    roi = mask[y1:y2, x1:x2]
    num, _, stats, _ = cv2.connectedComponentsWithStats(roi, connectivity=8)
    boxes: List[Tuple[int, int, int, int]] = []
    for i in range(1, num):
        bx, by, bw, bh, area = stats[i]
        if area < 8 or bh < 4:
            continue
        boxes.append((x1 + bx, y1 + by, x1 + bx + bw, y1 + by + bh))
    return boxes


def _union_boxes(boxes: List[Tuple[int, int, int, int]]) -> Tuple[int, int, int, int]:
    if not boxes:
        return (0, 0, 0, 0)
    return (
        min(b[0] for b in boxes),
        min(b[1] for b in boxes),
        max(b[2] for b in boxes),
        max(b[3] for b in boxes),
    )


def _baseline_compatible(a: Tuple[int, int, int, int], b: Tuple[int, int, int, int], tol: int) -> bool:
    cy_a = (a[1] + a[3]) // 2
    cy_b = (b[1] + b[3]) // 2
    ha = a[3] - a[1]
    hb = b[3] - b[1]
    return abs(cy_a - cy_b) <= tol and abs(ha - hb) <= max(4, ha // 2 + 2)


def _merge_phrase_groups(
    islands: List[Tuple[int, int, int, int]],
    gap_px: int,
    band_tol: int,
) -> List[Tuple[int, int, int, int]]:
    if not islands:
        return []
    islands = sorted(islands, key=lambda b: b[0])
    merged: List[Tuple[int, int, int, int]] = [islands[0]]
    for box in islands[1:]:
        prev = merged[-1]
        if box[0] - prev[2] <= gap_px and _baseline_compatible(prev, box, band_tol):
            merged[-1] = (
                prev[0],
                min(prev[1], box[1]),
                max(prev[2], box[2]),
                max(prev[3], box[3]),
            )
        else:
            merged.append(box)
    return merged


def _assemble_arabic_phrase(
    islands: List[Tuple[int, int, int, int]],
    groups: List[Tuple[int, int, int, int]],
    internal_x1: int,
    internal_x2: int,
    median_h: int,
    gap_px: int,
    band_tol: int,
) -> Tuple[List[Tuple[int, int, int, int]], ArValueGroupStatus]:
    if not groups:
        return [], ArValueGroupStatus.UNCERTAIN

    internal_w = max(1, internal_x2 - internal_x1)
    mid = internal_x1 + int(0.42 * internal_w)
    right_groups = [g for g in groups if g[0] >= mid - int(median_h * 0.5)]
    if not right_groups:
        right_groups = [max(groups, key=lambda g: g[2])]

    seed = max(right_groups, key=lambda g: g[2])
    phrase: List[Tuple[int, int, int, int]] = [seed]
    phrase_set = {seed}

    changed = True
    while changed:
        changed = False
        pu = _union_boxes(phrase)
        for g in groups:
            if g in phrase_set:
                continue
            if g[2] <= pu[0] + 2 and pu[0] - g[2] <= gap_px * 2:
                if _baseline_compatible(pu, g, band_tol):
                    phrase_set.add(g)
                    phrase.append(g)
                    changed = True
        for isl in islands:
            if isl in phrase_set:
                continue
            ih = isl[3] - isl[1]
            if ih <= max(4, median_h // 2 + 2):
                if isl[0] >= pu[0] - 3 and isl[2] <= pu[2] + 6:
                    if isl[1] <= pu[3] + 4 and isl[3] >= pu[1] - 4:
                        phrase_set.add(isl)
                        phrase.append(isl)
                        changed = True

    full = _union_boxes(phrase)
    width = full[2] - full[0]
    min_char_w = max(5, int(0.35 * median_h))
    min_word_w = max(int(0.55 * median_h), min_char_w * 2)

    if width < min_char_w and len(phrase) <= 1:
        status = ArValueGroupStatus.PARTIAL
    elif width >= min_word_w or (width >= min_char_w and len(phrase) >= 2):
        status = ArValueGroupStatus.COMPLETE
    elif width >= min_char_w:
        status = ArValueGroupStatus.PARTIAL
    else:
        status = ArValueGroupStatus.UNCERTAIN

    return phrase, status


def _body_left_edge(
    phrase: List[Tuple[int, int, int, int]],
    median_h: int,
) -> int:
    bodies = [b for b in phrase if (b[3] - b[1]) >= max(5, median_h // 3)]
    if not bodies:
        bodies = phrase
    return min(b[0] for b in bodies)


def _english_value_right_edge(
    groups: List[Tuple[int, int, int, int]],
    internal_x1: int,
    internal_w: int,
) -> int:
    cutoff = internal_x1 + int(0.52 * internal_w)
    left_groups = [g for g in groups if g[2] <= cutoff]
    if not left_groups:
        return internal_x1
    return max(g[2] for g in left_groups)


def _scan_arabic_onset_from_right(
    mask: np.ndarray,
    internal_x1: int,
    internal_x2: int,
    text_y1: int,
    text_y2: int,
    median_h: int,
) -> Optional[int]:
    """First sustained ink column when scanning right-to-left inside internal window."""
    band = mask[text_y1:text_y2, internal_x1:internal_x2].copy()
    bh, bw = band.shape[:2]
    for y in range(bh):
        cols = np.where(band[y] > 0)[0]
        if cols.size > 0 and (cols[-1] - cols[0] + 1) > int(0.55 * bw):
            band[y, :] = 0
    proj = np.sum(band > 0, axis=0)
    if proj.size < 3:
        return None
    need = max(2, median_h // 5)
    run = 0
    onset_rel: Optional[int] = None
    for i in range(proj.size - 1, -1, -1):
        if proj[i] >= 1:
            run += 1
            if run >= need:
                onset_rel = i - run + 1
        else:
            if run >= need:
                break
            run = 0
    if onset_rel is None:
        return None
    return internal_x1 + int(onset_rel)


def _valley_between_en_and_ar(
    mask: np.ndarray,
    internal_x1: int,
    internal_x2: int,
    text_y1: int,
    text_y2: int,
    en_right: int,
    ar_onset: int,
    median_h: int,
) -> Optional[int]:
    if ar_onset <= en_right + max(8, median_h // 2):
        return None
    band = mask[text_y1:text_y2, internal_x1:internal_x2]
    proj = np.sum(band > 0, axis=0).astype(np.float32)
    if proj.size < 8:
        return None
    k = max(3, median_h // 3)
    proj_s = np.convolve(proj, np.ones(k) / float(k), mode="same")
    lo = max(0, en_right - internal_x1 + max(4, median_h // 4))
    hi = max(lo + 3, ar_onset - internal_x1 - max(2, median_h // 6))
    if hi >= proj_s.size:
        hi = proj_s.size - 1
    if hi <= lo + 2:
        return None
    segment = proj_s[lo:hi]
    if segment.size < 3:
        return None
    valley_idx = int(np.argmin(segment)) + lo
    valley_val = float(proj_s[valley_idx])
    left_m = float(np.mean(proj_s[lo : valley_idx + 1]))
    right_m = float(np.mean(proj_s[valley_idx:hi]))
    peak = max(left_m, right_m, 1.0)
    if left_m < 1.0 or right_m < 0.6:
        return None
    if valley_val > 0.6 * peak:
        return None
    return internal_x1 + valley_idx


def _local_projection_valley(
    mask: np.ndarray,
    internal_x1: int,
    internal_x2: int,
    text_y1: int,
    text_y2: int,
    ar_left: int,
    median_h: int,
) -> Optional[int]:
    band = mask[text_y1:text_y2, internal_x1:internal_x2]
    proj = np.sum(band > 0, axis=0).astype(np.float32)
    if proj.size < 8:
        return None
    k = max(3, median_h // 3)
    kernel = np.ones(k) / float(k)
    proj_s = np.convolve(proj, kernel, mode="same")

    rel_ar = ar_left - internal_x1
    search_hi = max(3, rel_ar - 1)
    search_lo = max(2, rel_ar - max(median_h * 4, int(0.22 * (internal_x2 - internal_x1))))
    if search_hi <= search_lo + 2:
        return None
    segment = proj_s[search_lo:search_hi]
    if segment.size < 3:
        return None
    valley_idx = int(np.argmin(segment)) + search_lo
    valley_val = float(proj_s[valley_idx])
    lw = max(2, median_h // 2)
    left_m = float(np.mean(proj_s[max(0, valley_idx - lw) : valley_idx + 1]))
    right_m = float(np.mean(proj_s[valley_idx : min(len(proj_s), valley_idx + lw)]))
    peak = max(left_m, right_m, 1.0)
    if left_m < 1.0 or right_m < 0.8:
        return None
    if valley_val > 0.55 * peak:
        return None
    return internal_x1 + valley_idx


def _left_edge_confidence(
    phrase_status: ArValueGroupStatus,
    phrase: List[Tuple[int, int, int, int]],
    full_bbox: Tuple[int, int, int, int],
    median_h: int,
    proj_x: Optional[int],
    comp_left: int,
) -> float:
    width = full_bbox[2] - full_bbox[0]
    score = 0.35
    if phrase_status == ArValueGroupStatus.COMPLETE:
        score += 0.35
    elif phrase_status == ArValueGroupStatus.PARTIAL:
        score += 0.12
    if len(phrase) >= 2:
        score += 0.15
    if width >= int(0.55 * median_h):
        score += 0.15
    elif width >= int(0.35 * median_h):
        score += 0.08
    if proj_x is not None and abs(proj_x - comp_left) <= max(5, median_h // 2):
        score += 0.2
    return float(min(1.0, score))


def _empty_result(
    internal_x1: int,
    internal_x2: int,
    text_mask: np.ndarray,
) -> Type2SplitResult:
    return Type2SplitResult(
        internal_x1=internal_x1,
        internal_x2=internal_x2,
        arabic_value_full_bbox=(0, 0, 0, 0),
        arabic_value_left_edge=0,
        arabic_value_left_edge_confidence=0.0,
        arabic_phrase_status=ArValueGroupStatus.UNCERTAIN,
        arabic_component_count=0,
        split_status=BoundaryStatus.NOT_FOUND,
        support_mode=Type2SupportMode.INSUFFICIENT,
        estimates_agree=None,
        text_mask=text_mask,
    )


def analyze_type2_split(
    gray: np.ndarray,
    text_mask: np.ndarray,
    internal_x1: int,
    internal_x2: int,
    text_y1: int,
    text_y2: int,
    ink: Optional[np.ndarray] = None,
    arabic_field_label_left: Optional[int] = None,
) -> Type2SplitResult:
    from src.value_crop.type2_two_front import analyze_type2_two_front

    result, _ = analyze_type2_two_front(
        text_mask,
        internal_x1,
        internal_x2,
        text_y1,
        text_y2,
        ink=ink,
        arabic_field_label_left=arabic_field_label_left,
    )
    return result


def _analyze_type2_split_legacy(
    gray: np.ndarray,
    text_mask: np.ndarray,
    internal_x1: int,
    internal_x2: int,
    text_y1: int,
    text_y2: int,
) -> Type2SplitResult:
    internal_w = max(1, internal_x2 - internal_x1)
    islands = extract_text_islands(text_mask, internal_x1, internal_x2, text_y1, text_y2)
    if not islands:
        return _empty_result(internal_x1, internal_x2, text_mask)

    heights = [b[3] - b[1] for b in islands]
    median_h = max(8, int(np.median(heights)))
    gap_px = max(6, int(round(median_h * 0.95)))
    band_tol = max(4, median_h // 2)
    groups = _merge_phrase_groups(islands, gap_px, band_tol)
    if not groups:
        return _empty_result(internal_x1, internal_x2, text_mask)

    phrase, phrase_status = _assemble_arabic_phrase(
        islands, groups, internal_x1, internal_x2, median_h, gap_px, band_tol
    )
    full_bbox = _union_boxes(phrase)
    comp_left = _body_left_edge(phrase, median_h)
    en_right = _english_value_right_edge(groups, internal_x1, internal_w)
    ar_onset = _scan_arabic_onset_from_right(
        text_mask, internal_x1, internal_x2, text_y1, text_y2, median_h
    )
    right_half = internal_x1 + int(0.45 * internal_w)
    if (
        phrase_status == ArValueGroupStatus.PARTIAL
        and ar_onset is not None
        and ar_onset >= right_half
    ):
        comp_left = min(comp_left, ar_onset)
        phrase_w = full_bbox[2] - full_bbox[0]
        if phrase_w < int(0.45 * median_h):
            full_bbox = (
                comp_left,
                full_bbox[1],
                max(full_bbox[2], comp_left + max(phrase_w, int(0.35 * median_h))),
                full_bbox[3],
            )

    proj_x = _valley_between_en_and_ar(
        text_mask, internal_x1, internal_x2, text_y1, text_y2, en_right, comp_left, median_h
    )
    if proj_x is None:
        proj_x = _local_projection_valley(
            text_mask, internal_x1, internal_x2, text_y1, text_y2, comp_left, median_h
        )

    tol = max(5, int(round(median_h * 0.65)))
    gap_en_ar = comp_left - en_right
    clear_gap = gap_en_ar >= max(20, int(median_h * 1.2))
    agree: Optional[bool] = None
    support = Type2SupportMode.INSUFFICIENT
    split_x: Optional[int] = None
    left_conf = _left_edge_confidence(phrase_status, phrase, full_bbox, median_h, proj_x, comp_left)

    strong_partial = (
        phrase_status == ArValueGroupStatus.PARTIAL
        and clear_gap
        and ar_onset is not None
        and left_conf >= 0.58
    )

    if proj_x is not None:
        if abs(proj_x - comp_left) <= tol:
            agree = True
            support = Type2SupportMode.BOTH_AGREE
            split_x = int(round((proj_x + comp_left) / 2))
        elif phrase_status == ArValueGroupStatus.COMPLETE and left_conf >= 0.68:
            agree = None
            support = Type2SupportMode.COMPONENT_ONLY_STRONG
            split_x = comp_left
        elif strong_partial:
            agree = None
            support = Type2SupportMode.COMPONENT_ONLY_STRONG
            split_x = comp_left
            left_conf = min(1.0, left_conf + 0.1)
        else:
            agree = False
            support = Type2SupportMode.CONFLICT
            split_x = None
    else:
        agree = None
        if phrase_status == ArValueGroupStatus.COMPLETE and left_conf >= 0.68:
            support = Type2SupportMode.COMPONENT_ONLY_STRONG
            split_x = comp_left
        elif strong_partial:
            support = Type2SupportMode.COMPONENT_ONLY_STRONG
            split_x = comp_left
            left_conf = min(1.0, left_conf + 0.12)
        else:
            support = Type2SupportMode.INSUFFICIENT

    left_conf = _left_edge_confidence(phrase_status, phrase, full_bbox, median_h, proj_x, comp_left)
    if support == Type2SupportMode.COMPONENT_ONLY_STRONG and strong_partial:
        left_conf = min(1.0, left_conf + 0.08)

    raw = 0.25
    if support == Type2SupportMode.BOTH_AGREE:
        raw += 0.55
    elif support == Type2SupportMode.COMPONENT_ONLY_STRONG:
        raw += 0.35 + 0.25 * left_conf
    elif support == Type2SupportMode.CONFLICT:
        raw += 0.1
    if phrase_status == ArValueGroupStatus.COMPLETE:
        raw += 0.15
    min_en = max(14, int(internal_w * 0.08))
    if split_x is not None and split_x - internal_x1 >= min_en:
        raw += 0.1

    norm_conf = float(min(1.0, raw / 1.05))

    status = BoundaryStatus.NOT_FOUND
    if support in (Type2SupportMode.BOTH_AGREE, Type2SupportMode.COMPONENT_ONLY_STRONG):
        if split_x is not None and split_x > internal_x1 + 6:
            status = BoundaryStatus.FOUND
        else:
            status = BoundaryStatus.NOT_FOUND
            support = Type2SupportMode.INSUFFICIENT
    elif support == Type2SupportMode.CONFLICT:
        status = BoundaryStatus.AMBIGUOUS

    return Type2SplitResult(
        internal_x1=internal_x1,
        internal_x2=internal_x2,
        arabic_value_full_bbox=full_bbox,
        arabic_value_left_edge=comp_left,
        arabic_value_left_edge_confidence=left_conf,
        arabic_phrase_status=phrase_status,
        arabic_component_count=len(phrase),
        arabic_islands=list(phrase),
        projection_split_x=proj_x,
        translation_split_x=split_x,
        split_raw_score=float(raw),
        normalized_confidence=norm_conf,
        split_status=status,
        support_mode=support,
        estimates_agree=agree,
        text_mask=text_mask,
    )


def expanded_arabic_bleed_rect(
    phrase_islands: List[Tuple[int, int, int, int]],
    pad: int = 2,
) -> Tuple[int, int, int, int]:
    if not phrase_islands:
        return (0, 0, 0, 0)
    u = _union_boxes(phrase_islands)
    return (u[0] - pad, u[1] - pad, u[2] + pad, u[3] + pad)
