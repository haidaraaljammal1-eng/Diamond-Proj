"""Detect main data table and horizontal row boundaries (multi-detector, real-licence robust)."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from itertools import combinations
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np


class TableStatus(str, Enum):
    TABLE_OK = "TABLE_OK"
    TABLE_DETECTION_FAILED = "TABLE_DETECTION_FAILED"


class StructureMode(str, Enum):
    DIRECT_STRUCTURE = "DIRECT_STRUCTURE"
    ONE_SEPARATOR_INFERRED = "ONE_SEPARATOR_INFERRED"
    TEXT_BAND_ROW_FALLBACK = "TEXT_BAND_ROW_FALLBACK"
    ROW_STRUCTURE_FAILED = "ROW_STRUCTURE_FAILED"


@dataclass
class MergedCandidate:
    y: int
    support_count: int
    methods: List[str]
    horizontal_span: int
    strength: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "y": self.y,
            "support_count": self.support_count,
            "methods": self.methods,
            "horizontal_span": self.horizontal_span,
            "strength": round(self.strength, 4),
        }


@dataclass
class InferredBoundary:
    y: int
    reason: str
    neighbor_spacings: List[int]
    confidence: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "y": self.y,
            "reason": self.reason,
            "neighbor_spacings": self.neighbor_spacings,
            "confidence": round(self.confidence, 4),
        }


@dataclass
class TableDebugInfo:
    search_region: Tuple[int, int, int, int]
    raw_by_method: Dict[str, List[int]]
    merged_candidates: List[MergedCandidate]
    selected_boundaries: List[int]
    inferred_boundary: Optional[InferredBoundary]
    rejected_nearby: List[int]
    structure_mode: str
    structure_score: float
    row_heights: List[int] = field(default_factory=list)
    row_height_cv: float = 0.0
    x_refinement: Optional[Dict[str, Any]] = None
    candidate_quality: List[Dict[str, Any]] = field(default_factory=list)
    sequence_comparison: Optional[Dict[str, Any]] = None
    bottom_role_meta: Optional[Dict[str, Any]] = None
    text_band_fallback: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        payload = {
            "search_region": list(self.search_region),
            "raw_by_method": self.raw_by_method,
            "merged_candidates": [c.to_dict() for c in self.merged_candidates],
            "selected_boundaries": self.selected_boundaries,
            "inferred_boundary": (
                self.inferred_boundary.to_dict() if self.inferred_boundary else None
            ),
            "rejected_nearby": self.rejected_nearby,
            "structure_mode": self.structure_mode,
            "structure_score": round(self.structure_score, 4),
            "row_heights": self.row_heights,
            "row_height_cv": round(self.row_height_cv, 4),
            "candidate_quality": self.candidate_quality,
            "sequence_comparison": self.sequence_comparison,
            "bottom_role_meta": self.bottom_role_meta,
        }
        if self.x_refinement is not None:
            payload["x_refinement"] = self.x_refinement
        if self.text_band_fallback is not None:
            payload["text_band_fallback"] = self.text_band_fallback
        return payload


@dataclass
class TableDetectionResult:
    status: TableStatus
    x1: int = 0
    y1: int = 0
    x2: int = 0
    y2: int = 0
    confidence: float = 0.0
    method: str = ""
    horizontal_line_ys: List[int] = None
    message: str = ""
    structure_mode: str = ""
    structure_score: float = 0.0
    debug: Optional[TableDebugInfo] = None

    def bbox(self) -> Tuple[int, int, int, int]:
        return self.x1, self.y1, self.x2, self.y2

    def to_dict(self) -> Dict[str, Any]:
        payload = {
            "status": self.status.value,
            "table_bbox": [self.x1, self.y1, self.x2, self.y2],
            "confidence": round(self.confidence, 4),
            "method": self.method,
            "horizontal_line_ys": self.horizontal_line_ys or [],
            "structure_mode": self.structure_mode,
            "structure_score": round(self.structure_score, 4),
            "message": self.message,
        }
        if self.debug is not None:
            payload["debug"] = self.debug.to_dict()
        return payload


# --- Shared morphology helpers (also used by legacy row refinement) ---


def _merge_close_values(values: List[int], merge_px: int) -> List[int]:
    if not values:
        return []
    sorted_vals = sorted(values)
    clusters: List[List[int]] = [[sorted_vals[0]]]
    for v in sorted_vals[1:]:
        if v - clusters[-1][-1] <= merge_px:
            clusters[-1].append(v)
        else:
            clusters.append([v])
    return [int(round(float(np.mean(c)))) for c in clusters]


def _horizontal_line_mask(gray: np.ndarray, tcfg: Dict[str, Any]) -> np.ndarray:
    h, w = gray.shape[:2]
    kw = max(25, int(w * float(tcfg.get("horizontal_kernel_width_frac", 0.04))))
    kh = max(1, min(3, int(h * float(tcfg.get("vertical_kernel_height_frac", 0.02)))))
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kw, kh))
    block = int(tcfg.get("adaptive_block_size", 31))
    if block % 2 == 0:
        block += 1
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    binary = cv2.adaptiveThreshold(
        blur,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        block,
        int(tcfg.get("adaptive_c", 12)),
    )
    eroded = cv2.erode(binary, kernel, iterations=1)
    return cv2.dilate(eroded, kernel, iterations=1)


def _find_horizontal_line_ys(horiz: np.ndarray, merge_px: int) -> List[int]:
    h, w = horiz.shape[:2]
    projection = np.sum(horiz > 0, axis=1).astype(np.float32)
    thresh = max(8.0, 0.12 * w)
    candidates = [y for y in range(h) if projection[y] >= thresh]
    if not candidates:
        return []

    segments: List[Tuple[int, int]] = []
    start = candidates[0]
    prev = candidates[0]
    for y in candidates[1:]:
        if y - prev > 1:
            segments.append((start, prev))
            start = y
        prev = y
    segments.append((start, prev))
    centers = [int(round((a + b) / 2)) for a, b in segments]
    return _merge_close_values(centers, merge_px)


def _line_span_at_row(mask: np.ndarray, y: int) -> int:
    h, w = mask.shape[:2]
    y0 = max(0, y - 1)
    y1 = min(h, y + 2)
    band = mask[y0:y1, :]
    if band.size == 0:
        return 0
    col = np.sum(band > 0, axis=0) > 0
    if not np.any(col):
        return 0
    xs = np.where(col)[0]
    return int(xs[-1] - xs[0] + 1)


def _search_region(
    h: int, w: int, tcfg: Dict[str, Any]
) -> Tuple[int, int, int, int]:
    x1 = int(w * float(tcfg.get("search_x_min_frac", 0.22)))
    x2 = int(w * float(tcfg.get("search_x_max_frac", 0.98)))
    y1 = int(h * float(tcfg.get("search_y_min_frac", 0.18)))
    y2 = int(h * float(tcfg.get("search_y_max_frac", 0.96)))
    return x1, y1, x2, y2


def _detector_morph(
    gray: np.ndarray, tcfg: Dict[str, Any], use_clahe: bool
) -> Tuple[List[int], np.ndarray]:
    roi = gray
    if use_clahe:
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        roi = clahe.apply(gray)
    horiz = _horizontal_line_mask(roi, tcfg)
    merge_px = int(tcfg.get("candidate_merge_px", 6))
    ys = _find_horizontal_line_ys(horiz, merge_px)
    return ys, horiz


def _detector_hough(gray: np.ndarray, tcfg: Dict[str, Any]) -> List[int]:
    h, w = gray.shape[:2]
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    edges = cv2.Canny(blur, 40, 120)
    min_len = max(20, int(w * 0.12))
    lines = cv2.HoughLinesP(
        edges,
        1,
        np.pi / 180,
        threshold=int(tcfg.get("hough_threshold", 50)),
        minLineLength=min_len,
        maxLineGap=int(tcfg.get("hough_max_line_gap", 12)),
    )
    if lines is None:
        return []
    ys: List[int] = []
    for x1, y1, x2, y2 in lines[:, 0]:
        if abs(x2 - x1) < 15:
            continue
        angle = abs(np.degrees(np.arctan2(y2 - y1, x2 - x1)))
        if angle > 8.0:
            continue
        ys.append(int(round((y1 + y2) / 2)))
    return _merge_close_values(ys, int(tcfg.get("candidate_merge_px", 6)))


def _detector_projection(horiz: np.ndarray, merge_px: int) -> List[int]:
    return _find_horizontal_line_ys(horiz, merge_px)


def _detector_dark_energy(gray: np.ndarray, tcfg: Dict[str, Any]) -> List[int]:
    h, w = gray.shape[:2]
    dark = 255 - gray
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(15, w // 8), 1))
    smoothed = cv2.blur(dark, (5, 3))
    row_energy = np.sum(smoothed, axis=1).astype(np.float32)
    med = float(np.median(row_energy))
    thresh = med + 0.35 * float(np.std(row_energy))
    peaks: List[int] = []
    for y in range(1, h - 1):
        if row_energy[y] >= thresh and row_energy[y] >= row_energy[y - 1] and row_energy[y] >= row_energy[y + 1]:
            peaks.append(y)
    return _merge_close_values(peaks, int(tcfg.get("candidate_merge_px", 6)))


@dataclass
class _RawHit:
    y: int
    method: str
    strength: float
    span: int


def _collect_raw_hits(
    gray: np.ndarray,
    tcfg: Dict[str, Any],
    y_offset: int,
) -> Tuple[Dict[str, List[int]], List[_RawHit], np.ndarray]:
    raw: Dict[str, List[int]] = {}
    hits: List[_RawHit] = []

    ys_a, horiz_a = _detector_morph(gray, tcfg, use_clahe=False)
    raw["morph_adaptive"] = [y + y_offset for y in ys_a]

    ys_b, horiz_b = _detector_morph(gray, tcfg, use_clahe=True)
    raw["morph_clahe"] = [y + y_offset for y in ys_b]

    ys_c = _detector_hough(gray, tcfg)
    raw["hough"] = [y + y_offset for y in ys_c]

    horiz_combined = cv2.max(horiz_a, horiz_b)
    ys_d = _detector_projection(horiz_combined, int(tcfg.get("candidate_merge_px", 6)))
    raw["projection"] = [y + y_offset for y in ys_d]

    ys_e = _detector_dark_energy(gray, tcfg)
    raw["dark_energy"] = [y + y_offset for y in ys_e]

    for method, ys in raw.items():
        local_mask = horiz_combined if method != "hough" else horiz_a
        for y_local in [y - y_offset for y in ys]:
            if y_local < 0 or y_local >= gray.shape[0]:
                continue
            span = _line_span_at_row(local_mask, y_local)
            strength = span / max(1, gray.shape[1])
            hits.append(
                _RawHit(
                    y=y_local + y_offset,
                    method=method,
                    strength=float(strength),
                    span=span,
                )
            )

    return raw, hits, horiz_combined


def _merge_hits(hits: List[_RawHit], merge_px: int) -> List[MergedCandidate]:
    if not hits:
        return []
    hits_sorted = sorted(hits, key=lambda h: h.y)
    clusters: List[List[_RawHit]] = [[hits_sorted[0]]]
    for hit in hits_sorted[1:]:
        if hit.y - clusters[-1][-1].y <= merge_px:
            clusters[-1].append(hit)
        else:
            clusters.append([hit])

    merged: List[MergedCandidate] = []
    for cluster in clusters:
        y = int(round(float(np.mean([c.y for c in cluster]))))
        methods = sorted({c.method for c in cluster})
        span = int(max(c.span for c in cluster))
        strength = float(sum(c.strength for c in cluster) + 0.15 * len(cluster))
        merged.append(
            MergedCandidate(
                y=y,
                support_count=len(cluster),
                methods=methods,
                horizontal_span=span,
                strength=strength,
            )
        )
    return merged


def _resolve_duplicates(
    merged: List[MergedCandidate],
    min_spacing: float,
    duplicate_ratio: float,
) -> Tuple[List[MergedCandidate], List[int]]:
    if not merged:
        return [], []
    rejected: List[int] = []
    kept: List[MergedCandidate] = [merged[0]]
    for cand in merged[1:]:
        prev = kept[-1]
        gap = cand.y - prev.y
        if gap < duplicate_ratio * min_spacing:
            if cand.strength > prev.strength:
                rejected.append(prev.y)
                kept[-1] = cand
            else:
                rejected.append(cand.y)
            continue
        kept.append(cand)
    return kept, rejected


_MORPH_METHODS = frozenset({"morph_adaptive", "morph_clahe"})
_STRUCT_METHODS = frozenset({"projection", "dark_energy"})


def _method_family_count(methods: List[str]) -> int:
    families = set()
    for m in methods:
        if m in _MORPH_METHODS:
            families.add("morph")
        elif m == "hough":
            families.add("hough")
        else:
            families.add(m)
    return len(families)


def _has_structural_support(methods: List[str]) -> bool:
    return any(m in _MORPH_METHODS or m in _STRUCT_METHODS for m in methods)


def _is_hough_only(methods: List[str]) -> bool:
    return len(methods) == 1 and methods[0] == "hough"


def _candidate_quality(c: MergedCandidate, img_w: int, tcfg: Dict[str, Any]) -> float:
    span_frac = c.horizontal_span / max(1, img_w)
    families = _method_family_count(c.methods)
    q = span_frac * 2.2 + 0.22 * families + min(1.2, c.strength) * 0.25
    if _has_structural_support(c.methods):
        q += 0.18
    if _is_hough_only(c.methods) and span_frac < float(
        tcfg.get("weak_hough_span_frac", 0.10)
    ):
        q *= 0.12
    if span_frac < float(tcfg.get("min_span_frac_hard_reject", 0.06)):
        q *= 0.08
    return float(q)


def _candidate_eligible(c: MergedCandidate, img_w: int, tcfg: Dict[str, Any]) -> bool:
    span_frac = c.horizontal_span / max(1, img_w)
    if span_frac < float(tcfg.get("min_span_frac_hard_reject", 0.06)):
        return False
    if _is_hough_only(c.methods) and span_frac < float(
        tcfg.get("weak_hough_span_frac", 0.10)
    ):
        return False
    min_span = float(tcfg.get("min_boundary_span_frac", 0.27))
    if span_frac >= min_span:
        return True
    if len(c.methods) >= 3 and span_frac >= float(
        tcfg.get("min_boundary_span_frac_multi3", 0.12)
    ):
        return True
    if len(c.methods) >= 2 and span_frac >= float(
        tcfg.get("min_boundary_span_frac_multi2", 0.18)
    ):
        return True
    return False


def _match_boundary_candidate(
    y: int, cands: List[MergedCandidate], tol: int
) -> Optional[MergedCandidate]:
    matches = [c for c in cands if abs(c.y - y) <= tol]
    if not matches:
        return None
    strong = [c for c in matches if c.horizontal_span > 0]
    if strong:
        return max(strong, key=lambda c: (c.horizontal_span, c.strength))
    return max(matches, key=lambda c: c.strength)


def _build_candidate_quality_meta(
    merged: List[MergedCandidate], img_w: int, tcfg: Dict[str, Any]
) -> List[Dict[str, Any]]:
    meta: List[Dict[str, Any]] = []
    for c in merged:
        meta.append(
            {
                "y": c.y,
                "horizontal_span": c.horizontal_span,
                "support_count": c.support_count,
                "methods": c.methods,
                "quality_score": round(_candidate_quality(c, img_w, tcfg), 4),
                "eligible": _candidate_eligible(c, img_w, tcfg),
            }
        )
    return meta


def _score_sequence_legacy(
    boundaries: List[int],
    cands: List[MergedCandidate],
    img_h: int,
    img_w: int,
    tcfg: Dict[str, Any],
    inferred: bool,
) -> Optional[Tuple[float, float]]:
    if len(boundaries) != 9 or boundaries != sorted(boundaries):
        return None
    sp = np.diff(boundaries)
    min_h = img_h * float(tcfg.get("min_row_height_frac", 0.045))
    max_h = img_h * float(tcfg.get("max_row_height_frac", 0.22))
    if np.any(sp < min_h) or np.any(sp > max_h):
        return None
    table_h = boundaries[-1] - boundaries[0]
    min_th = img_h * float(tcfg.get("min_table_height_frac", 0.25))
    max_th = img_h * float(tcfg.get("max_table_height_frac", 0.85))
    if table_h < min_th or table_h > max_th:
        return None
    cv = float(np.std(sp) / (np.mean(sp) + 1e-6))
    if cv > float(tcfg.get("sequence_row_cv_max", 0.55)):
        return None
    tol = int(tcfg.get("boundary_snap_tol_px", 10))
    evidence = sum(
        max((c.strength for c in cands if abs(c.y - y) <= tol), default=0.0)
        for y in boundaries
    )
    if inferred:
        evidence *= 0.92
    mid_y = (boundaries[0] + boundaries[-1]) / 2.0
    y_prior = 1.0 - min(1.0, abs(mid_y - 0.58 * img_h) / (0.58 * img_h))
    span_prior = np.mean([c.horizontal_span for c in cands]) / max(1, img_w)
    score = evidence * 0.55 + (1.0 - cv) * 0.25 + y_prior * 0.12 + span_prior * 0.08
    return score, cv


def _early_row_pattern_penalty(
    boundaries: List[int],
    matched: List[MergedCandidate],
    img_w: int,
    tcfg: Dict[str, Any],
) -> float:
    sp = np.diff(boundaries)
    if len(sp) < 4:
        return 1.0
    med = float(np.median(sp))
    tiny = sum(1 for h in sp[:3] if h < 0.82 * med)
    if tiny < 2:
        return 1.0
    weak_internal = 0
    for i in range(1, 4):
        span_frac = matched[i].horizontal_span / max(1, img_w)
        if span_frac < float(tcfg.get("internal_weak_span_frac", 0.22)):
            weak_internal += 1
    if weak_internal >= 2:
        return 0.55
    return 0.75


def _score_sequence(
    boundaries: List[int],
    cands: List[MergedCandidate],
    img_h: int,
    img_w: int,
    tcfg: Dict[str, Any],
    inferred: bool,
    bottom_inferred: bool = False,
) -> Optional[Tuple[float, float]]:
    if len(boundaries) != 9 or boundaries != sorted(boundaries):
        return None
    sp = np.diff(boundaries)
    min_h = img_h * float(tcfg.get("min_row_height_frac", 0.045))
    max_h = img_h * float(tcfg.get("max_row_height_frac", 0.22))
    if np.any(sp < min_h) or np.any(sp > max_h):
        return None

    table_h = boundaries[-1] - boundaries[0]
    min_th = img_h * float(tcfg.get("min_table_height_frac", 0.25))
    max_th = img_h * float(tcfg.get("max_table_height_frac", 0.85))
    if table_h < min_th or table_h > max_th:
        return None

    cv = float(np.std(sp) / (np.mean(sp) + 1e-6))
    cv_max = float(tcfg.get("sequence_row_cv_max", 0.55))
    if cv > cv_max:
        return None

    min_first_y = img_h * float(tcfg.get("min_first_boundary_frac", 0.32))
    hard_top_y = img_h * float(tcfg.get("hard_min_first_boundary_frac", 0.25))
    if boundaries[0] < hard_top_y:
        return None
    first_y_penalty = 1.0
    if boundaries[0] < min_first_y:
        first_y_penalty = max(
            0.5,
            1.0 - (min_first_y - boundaries[0]) / max(1.0, img_h * 0.12),
        )

    tol = int(tcfg.get("boundary_snap_tol_px", 10))
    matched: List[MergedCandidate] = []
    qualities: List[float] = []
    for i, y in enumerate(boundaries):
        if bottom_inferred and i == len(boundaries) - 1:
            qualities.append(0.42)
            matched.append(
                MergedCandidate(
                    y=y,
                    support_count=0,
                    methods=["inferred_bottom"],
                    horizontal_span=int(0.45 * img_w),
                    strength=0.42,
                )
            )
            continue
        m = _match_boundary_candidate(y, cands, tol)
        if m is None:
            return None
        q = _candidate_quality(m, img_w, tcfg)
        span_frac = m.horizontal_span / max(1, img_w)
        if 0 < i < 8 and span_frac < float(tcfg.get("internal_weak_span_frac", 0.22)):
            q *= 0.45
        if m.horizontal_span == 0 and 0 < i < 8:
            q = 0.22
        elif _is_hough_only(m.methods) and span_frac < float(
            tcfg.get("weak_hough_span_frac", 0.10)
        ):
            if span_frac < 0.03:
                return None
            q *= 0.35
        if (
            not _has_structural_support(m.methods)
            and span_frac < float(tcfg.get("min_boundary_span_frac_multi2", 0.18))
            and span_frac < 0.08
        ):
            return None
        qualities.append(q)
        matched.append(m)

    if min(qualities) < float(tcfg.get("min_boundary_quality", 0.05)):
        return None

    quality_term = float(np.mean(qualities))
    if inferred and not bottom_inferred:
        quality_term *= 0.94
    if bottom_inferred:
        quality_term *= 0.97

    edge_spans = [m.horizontal_span for m in [matched[0], matched[-1]]]
    max_span = max((c.horizontal_span for c in cands), default=1)
    min_edge_frac = float(tcfg.get("min_edge_line_span_frac", 0.28))
    edge_penalty = 1.0
    if max_span > 0:
        if edge_spans[0] < min_edge_frac * max_span:
            edge_penalty *= 0.5
        if edge_spans[-1] < min_edge_frac * max_span and not bottom_inferred:
            edge_penalty *= 0.65

    search_bot = img_h * float(tcfg.get("search_y_max_frac", 0.96))
    bottom_complete = boundaries[-1] / max(1.0, search_bot)
    strong_lower = [
        c.y
        for c in cands
        if c.horizontal_span >= img_w * float(tcfg.get("min_boundary_span_frac", 0.27))
    ]
    if strong_lower:
        target_low = max(strong_lower) - int(tcfg.get("bottom_gap_slack_px", 28))
        if boundaries[-1] < target_low and not bottom_inferred:
            edge_penalty *= 0.55

    mid_y = (boundaries[0] + boundaries[-1]) / 2.0
    y_prior = 1.0 - min(1.0, abs(mid_y - 0.58 * img_h) / (0.58 * img_h))
    early_penalty = _early_row_pattern_penalty(boundaries, matched, img_w, tcfg)

    score = (
        quality_term * 0.50
        + (1.0 - cv) * 0.12
        + bottom_complete * 0.22
        + y_prior * 0.08
        + float(np.mean([m.horizontal_span for m in matched])) / max(1, img_w) * 0.08
    ) * edge_penalty * early_penalty * first_y_penalty
    return score, cv


def _try_infer_bottom(
    ys8: List[int],
    cands: List[MergedCandidate],
    img_h: int,
    img_w: int,
    tcfg: Dict[str, Any],
) -> Optional[Tuple[List[int], InferredBoundary]]:
    if len(ys8) != 8 or ys8 != sorted(ys8):
        return None
    gaps = list(np.diff(ys8))
    med = float(np.median(gaps))
    min_h = img_h * float(tcfg.get("min_row_height_frac", 0.045))
    max_y = int(img_h * float(tcfg.get("search_y_max_frac", 0.96)))
    bottom = int(round(ys8[-1] + med))
    below = [
        c
        for c in cands
        if c.y > ys8[-1] + min_h * 0.75
        and c.y < max_y
        and _candidate_eligible(c, img_w, tcfg)
    ]
    if below:
        pick = max(below, key=lambda c: (c.horizontal_span, c.y))
        bottom = pick.y
        reason = f"BOTTOM_BOUNDARY_INFERRED from strong lower candidate y={pick.y}."
    else:
        reason = (
            f"BOTTOM_BOUNDARY_INFERRED from median spacing ({med:.0f}px) below y={ys8[-1]}."
        )
    if bottom - ys8[-1] < min_h * 0.85:
        return None
    bottom = min(bottom, max_y)
    full = ys8 + [bottom]
    inf = InferredBoundary(
        y=bottom,
        reason=reason,
        neighbor_spacings=[bottom - ys8[-1]],
        confidence=0.72,
    )
    return full, inf


def _try_infer_one(
    eight: List[int],
    cands: List[MergedCandidate],
    img_h: int,
    img_w: int,
    tcfg: Dict[str, Any],
) -> Optional[Tuple[List[int], InferredBoundary]]:
    ys = sorted(eight)
    gaps = list(np.diff(ys))
    if not gaps:
        return None
    med = float(np.median(gaps))
    gap_ratio_min = float(tcfg.get("infer_gap_ratio_min", 1.45))
    best: Optional[Tuple[float, List[int], InferredBoundary]] = None

    for idx, gap in enumerate(gaps):
        if gap < med * gap_ratio_min:
            continue
        inferred_y = int(round(ys[idx] + gap / 2.0))
        full = ys[: idx + 1] + [inferred_y] + ys[idx + 1 :]
        if len(full) != 9:
            continue
        min_h = img_h * float(tcfg.get("min_row_height_frac", 0.045))
        infer_min_h = max(
            min_h,
            img_h * float(tcfg.get("infer_min_row_height_frac", 0.05)),
        )
        if np.any(np.diff(full) < infer_min_h):
            continue
        scored = _score_sequence(full, cands, img_h, img_w, tcfg, inferred=True)
        if scored is None:
            continue
        score, cv = scored
        before = [ys[idx + 1] - ys[idx]]
        after = [inferred_y - ys[idx], ys[idx + 1] - inferred_y]
        inf = InferredBoundary(
            y=inferred_y,
            reason=f"Inserted at oversized gap index {idx} (gap {gap:.0f}px vs median {med:.0f}px).",
            neighbor_spacings=before + after,
            confidence=float(min(0.95, score / 3.0)),
        )
        if best is None or score > best[0]:
            best = (score, full, inf)

    if best is None:
        return None
    return best[1], best[2]


def _select_nine_boundaries(
    merged: List[MergedCandidate],
    img_h: int,
    img_w: int,
    tcfg: Dict[str, Any],
) -> Optional[
    Tuple[
        List[int],
        str,
        float,
        Optional[InferredBoundary],
        float,
        Optional[Dict[str, Any]],
        Optional[Dict[str, Any]],
    ]
]:
    if len(merged) < 7:
        return None

    def _ineligible_count(combo: Tuple[MergedCandidate, ...]) -> int:
        return sum(1 for c in combo if not _candidate_eligible(c, img_w, tcfg))

    max_weak = int(tcfg.get("max_weak_boundaries_per_sequence", 1))
    pool = merged

    best_direct: Optional[Tuple[float, List[int], float]] = None
    best_legacy: Optional[Tuple[float, List[int]]] = None
    if len(pool) >= 9:
        for combo in combinations(pool, 9):
            if _ineligible_count(combo) > max_weak:
                continue
            ys = sorted(c.y for c in combo)
            scored = _score_sequence(ys, merged, img_h, img_w, tcfg, inferred=False)
            if scored is None:
                continue
            score, cv = scored
            if best_direct is None or score > best_direct[0]:
                best_direct = (score, ys, cv)
            leg = _score_sequence_legacy(ys, merged, img_h, img_w, tcfg, inferred=False)
            if leg is not None:
                ls, _ = leg
                if best_legacy is None or ls > best_legacy[0]:
                    best_legacy = (ls, ys)

    best_infer: Optional[Tuple[float, List[int], InferredBoundary, float]] = None
    if len(pool) >= 8:
        for combo in combinations(pool, 8):
            if _ineligible_count(combo) > max_weak:
                continue
            ys8 = sorted(c.y for c in combo)
            bottom = _try_infer_bottom(ys8, merged, img_h, img_w, tcfg)
            if bottom is not None:
                ys9, inf_b = bottom
                scored = _score_sequence(
                    ys9,
                    merged,
                    img_h,
                    img_w,
                    tcfg,
                    inferred=True,
                    bottom_inferred="BOTTOM_BOUNDARY_INFERRED" in inf_b.reason,
                )
                if scored is not None:
                    score, cv = scored
                    if best_infer is None or score > best_infer[0]:
                        best_infer = (score, ys9, inf_b, cv)
            inferred = _try_infer_one(ys8, merged, img_h, img_w, tcfg)
            if inferred is None:
                continue
            ys9, inf = inferred
            scored = _score_sequence(ys9, merged, img_h, img_w, tcfg, inferred=True)
            if scored is None:
                continue
            score, cv = scored
            if best_infer is None or score > best_infer[0]:
                best_infer = (score, ys9, inf, cv)

    if best_direct is None and best_infer is None:
        return None

    comparison: Optional[Dict[str, Any]] = None
    if best_legacy is not None:
        comparison = {
            "legacy_boundaries": best_legacy[1],
            "legacy_score": round(best_legacy[0], 4),
        }

    bottom_meta: Dict[str, Any] = {
        "candidate_ys": [c.y for c in merged if c.y > img_h * 0.55],
        "strong_lower_ys": [
            c.y
            for c in merged
            if c.horizontal_span >= img_w * float(tcfg.get("min_boundary_span_frac", 0.27))
        ],
        "inferred_bottom_y": None,
    }

    if best_direct is not None and (
        best_infer is None or best_direct[0] >= best_infer[0] * 1.02
    ):
        score, ys, cv = best_direct
        return ys, StructureMode.DIRECT_STRUCTURE.value, score, None, cv, comparison, bottom_meta

    if best_infer is not None:
        score, ys, inf, cv = best_infer
        bottom_meta["inferred_bottom_y"] = inf.y
        mode = StructureMode.ONE_SEPARATOR_INFERRED.value
        if "BOTTOM_BOUNDARY_INFERRED" in inf.reason:
            mode = "BOTTOM_BOUNDARY_INFERRED"
        return ys, mode, score, inf, cv, comparison, bottom_meta

    return None


def _estimate_table_x(
    gray: np.ndarray,
    boundaries: List[int],
    search_x1: int,
    search_x2: int,
    horiz_mask: np.ndarray,
    y_offset: int,
    tcfg: Dict[str, Any],
) -> Tuple[int, int]:
    lefts: List[int] = []
    rights: List[int] = []
    for y_g in boundaries:
        y_l = y_g - y_offset
        if y_l < 0 or y_l >= horiz_mask.shape[0]:
            continue
        span_mask = horiz_mask[y_l : y_l + 1, :]
        cols = np.where(span_mask[0] > 0)[0]
        if cols.size < 5:
            row = gray[y_l, search_x1:search_x2]
            gx = cv2.Sobel(row.reshape(1, -1), cv2.CV_32F, 1, 0, ksize=3)[0]
            cols = np.where(np.abs(gx) > np.percentile(np.abs(gx), 85))[0] + search_x1
        if cols.size < 2:
            continue
        lefts.append(int(cols[0]))
        rights.append(int(cols[-1]))

    if not lefts:
        return search_x1, search_x2

    x1 = int(np.percentile(lefts, 15))
    x2 = int(np.percentile(rights, 85))
    x1 = max(search_x1, x1)
    x2 = min(search_x2, x2)
    min_w = int(gray.shape[1] * float(tcfg.get("min_table_width_frac", 0.35)))
    if x2 - x1 < min_w:
        x1, x2 = search_x1, search_x2
    return max(0, x1), min(gray.shape[1] - 1, x2)


def detect_table(
    image_bgr: np.ndarray,
    config: Dict[str, Any],
) -> TableDetectionResult:
    tcfg = config.get("table", {})
    h, w = image_bgr.shape[:2]
    gray_full = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)

    sx1, sy1, sx2, sy2 = _search_region(h, w, tcfg)
    roi = gray_full[sy1:sy2, sx1:sx2]
    merge_px = int(tcfg.get("candidate_merge_px", 6))

    raw_by_method, hits, horiz_roi = _collect_raw_hits(roi, tcfg, y_offset=sy1)
    merged = _merge_hits(hits, merge_px)

    min_spacing = max(14.0, h * float(tcfg.get("min_row_height_frac", 0.045)))
    duplicate_ratio = float(tcfg.get("duplicate_spacing_ratio", 0.38))
    merged, rejected = _resolve_duplicates(merged, min_spacing, duplicate_ratio)

    selection = _select_nine_boundaries(merged, h, w, tcfg)
    empty_debug = TableDebugInfo(
        search_region=(sx1, sy1, sx2, sy2),
        raw_by_method=raw_by_method,
        merged_candidates=merged,
        selected_boundaries=[],
        inferred_boundary=None,
        rejected_nearby=rejected,
        structure_mode=StructureMode.ROW_STRUCTURE_FAILED.value,
        structure_score=0.0,
    )

    if selection is None:
        from src.text_band_fallback import try_text_band_row_fallback

        fb = try_text_band_row_fallback(image_bgr, (sx1, sy1, sx2, sy2), merged, tcfg)
        empty_debug.text_band_fallback = fb.to_dict()
        if not fb.ok:
            return TableDetectionResult(
                status=TableStatus.TABLE_DETECTION_FAILED,
                method="multi_detector_separator_search",
                message=fb.message or "Could not select a credible 9-boundary table sequence.",
                horizontal_line_ys=[c.y for c in merged],
                debug=empty_debug,
            )
        boundaries = fb.boundaries
        structure_mode = StructureMode.TEXT_BAND_ROW_FALLBACK.value
        structure_score = fb.structure_score
        inferred = None
        row_cv = fb.row_height_cv
        seq_cmp = None
        bottom_meta = {
            "role": "text_band_fallback",
            "median_pitch": fb.median_pitch,
            "pitch_cv": fb.pitch_cv,
        }
        row_heights = [boundaries[i + 1] - boundaries[i] for i in range(8)]
        quality_meta = _build_candidate_quality_meta(merged, w, tcfg)
        y_top, y_bot = boundaries[0], boundaries[-1]
        from src.table_x_bounds import refine_table_x_bounds

        x_refine = refine_table_x_bounds(
            image_bgr,
            boundaries,
            (sx1, sy1, sx2, sy2),
            horiz_roi,
            sy1,
            tcfg,
        )
        x1, x2 = x_refine.new_x1, x_refine.new_x2
        table_w = x2 - x1
        table_h = y_bot - y_top
        min_tw = int(w * float(tcfg.get("min_table_width_frac", 0.35)))
        max_tw = int(w * float(tcfg.get("max_table_width_frac", 0.98)))
        if table_w < min_tw or table_w > max_tw:
            return TableDetectionResult(
                status=TableStatus.TABLE_DETECTION_FAILED,
                method="text_band_row_fallback",
                message=f"Fallback table width {table_w}px outside [{min_tw}, {max_tw}].",
                horizontal_line_ys=boundaries,
                debug=empty_debug,
            )
        height_score = 1.0 - min(1.0, abs(table_h - 0.48 * h) / (0.48 * h))
        width_score = 1.0 - min(1.0, abs(table_w - 0.55 * w) / (0.55 * w))
        confidence = float(
            0.25 * height_score + 0.25 * width_score + 0.5 * min(1.0, structure_score / 2.0)
        )
        debug = TableDebugInfo(
            search_region=(sx1, sy1, sx2, sy2),
            raw_by_method=raw_by_method,
            merged_candidates=merged,
            selected_boundaries=boundaries,
            inferred_boundary=inferred,
            rejected_nearby=rejected,
            structure_mode=structure_mode,
            structure_score=structure_score,
            row_heights=row_heights,
            row_height_cv=row_cv,
            x_refinement=x_refine.to_dict(),
            candidate_quality=quality_meta,
            sequence_comparison=seq_cmp,
            bottom_role_meta=bottom_meta,
            text_band_fallback=fb.to_dict(),
        )
        return TableDetectionResult(
            status=TableStatus.TABLE_OK,
            x1=x1,
            y1=y_top,
            x2=x2,
            y2=y_bot,
            confidence=confidence,
            method="text_band_row_fallback",
            horizontal_line_ys=boundaries,
            structure_mode=structure_mode,
            structure_score=structure_score,
            message="Table geometry from text-band row fallback (hybrid snap).",
            debug=debug,
        )

    boundaries, structure_mode, structure_score, inferred, row_cv, seq_cmp, bottom_meta = (
        selection
    )
    row_heights = [boundaries[i + 1] - boundaries[i] for i in range(8)]
    quality_meta = _build_candidate_quality_meta(merged, w, tcfg)

    if structure_mode in (
        StructureMode.ONE_SEPARATOR_INFERRED.value,
        "BOTTOM_BOUNDARY_INFERRED",
    ) and inferred is None:
        return TableDetectionResult(
            status=TableStatus.TABLE_DETECTION_FAILED,
            method="multi_detector_separator_search",
            message="Inferred separator required but not produced.",
            debug=empty_debug,
        )

    y_top, y_bot = boundaries[0], boundaries[-1]
    from src.table_x_bounds import refine_table_x_bounds

    x_refine = refine_table_x_bounds(
        image_bgr,
        boundaries,
        (sx1, sy1, sx2, sy2),
        horiz_roi,
        sy1,
        tcfg,
    )
    x1, x2 = x_refine.new_x1, x_refine.new_x2

    table_w = x2 - x1
    table_h = y_bot - y_top
    min_tw = int(w * float(tcfg.get("min_table_width_frac", 0.35)))
    max_tw = int(w * float(tcfg.get("max_table_width_frac", 0.98)))
    if table_w < min_tw or table_w > max_tw:
        return TableDetectionResult(
            status=TableStatus.TABLE_DETECTION_FAILED,
            method="multi_detector_separator_search",
            message=f"Table width {table_w}px outside [{min_tw}, {max_tw}].",
            horizontal_line_ys=boundaries,
            debug=empty_debug,
        )

    line_count_score = 1.0
    height_score = 1.0 - min(1.0, abs(table_h - 0.48 * h) / (0.48 * h))
    width_score = 1.0 - min(1.0, abs(table_w - 0.55 * w) / (0.55 * w))
    confidence = float(
        0.35 * line_count_score
        + 0.2 * height_score
        + 0.2 * width_score
        + 0.25 * min(1.0, structure_score / 2.5)
    )

    debug = TableDebugInfo(
        search_region=(sx1, sy1, sx2, sy2),
        raw_by_method=raw_by_method,
        merged_candidates=merged,
        selected_boundaries=boundaries,
        inferred_boundary=inferred,
        rejected_nearby=rejected,
        structure_mode=structure_mode,
        structure_score=structure_score,
        row_heights=row_heights,
        row_height_cv=row_cv,
        x_refinement=x_refine.to_dict(),
        candidate_quality=quality_meta,
        sequence_comparison=seq_cmp,
        bottom_role_meta=bottom_meta,
    )

    return TableDetectionResult(
        status=TableStatus.TABLE_OK,
        x1=x1,
        y1=y_top,
        x2=x2,
        y2=y_bot,
        confidence=confidence,
        method="multi_detector_separator_search",
        horizontal_line_ys=boundaries,
        structure_mode=structure_mode,
        structure_score=structure_score,
        message="Table geometry from merged horizontal separator evidence.",
        debug=debug,
    )
