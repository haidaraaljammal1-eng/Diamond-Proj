"""Text-band row fallback when physical 9-boundary selection fails."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from src.detect_table import MergedCandidate, StructureMode, _search_region
from src.value_crop.preprocess import prepare_ink_mask, suppress_table_lines


@dataclass
class TextBand:
    y1: int
    y2: int
    center_y: float
    height: int
    ink_density: float
    horizontal_coverage: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "y1": self.y1,
            "y2": self.y2,
            "center_y": round(self.center_y, 2),
            "height": self.height,
            "ink_density": round(self.ink_density, 4),
            "horizontal_coverage": round(self.horizontal_coverage, 4),
        }


@dataclass
class TextBandFallbackResult:
    ok: bool
    boundaries: List[int] = field(default_factory=list)
    structure_score: float = 0.0
    row_height_cv: float = 0.0
    bands: List[TextBand] = field(default_factory=list)
    raw_candidate_count: int = 0
    center_distances: List[float] = field(default_factory=list)
    median_pitch: float = 0.0
    pitch_cv: float = 0.0
    boundary_sources: List[str] = field(default_factory=list)
    snapped_to_physical: List[bool] = field(default_factory=list)
    text_mask: Optional[np.ndarray] = None
    projection: Optional[np.ndarray] = None
    message: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "ok": self.ok,
            "boundaries": self.boundaries,
            "structure_score": round(self.structure_score, 4),
            "row_height_cv": round(self.row_height_cv, 4),
            "bands": [b.to_dict() for b in self.bands],
            "raw_candidate_count": self.raw_candidate_count,
            "center_distances": [round(d, 2) for d in self.center_distances],
            "median_pitch": round(self.median_pitch, 2),
            "pitch_cv": round(self.pitch_cv, 4),
            "boundary_sources": self.boundary_sources,
            "snapped_to_physical": self.snapped_to_physical,
            "message": self.message,
        }


def table_region_plausible(
    gray_full: np.ndarray,
    search_region: Tuple[int, int, int, int],
    tcfg: Dict[str, Any],
) -> bool:
    sx1, sy1, sx2, sy2 = search_region
    roi = gray_full[sy1:sy2, sx1:sx2]
    if roi.size == 0:
        return False
    proc = suppress_table_lines(roi)
    ink = prepare_ink_mask(proc)
    h, w = ink.shape[:2]
    x_lo = int(w * 0.08)
    x_hi = int(w * 0.98)
    band_ink = ink[:, x_lo:x_hi]
    row_energy = np.sum(band_ink > 0, axis=1).astype(np.float32)
    if row_energy.max() < 8:
        return False
    active_rows = int(np.sum(row_energy > max(3.0, 0.12 * float(row_energy.max()))))
    min_active = max(12, int(h * float(tcfg.get("text_band_min_active_rows_frac", 0.22))))
    return active_rows >= min_active


def _build_text_mask_roi(gray_roi: np.ndarray) -> np.ndarray:
    proc = suppress_table_lines(gray_roi)
    ink = prepare_ink_mask(proc)
    h, w = ink.shape[:2]
    horiz_k = cv2.getStructuringElement(cv2.MORPH_RECT, (max(18, w // 5), 1))
    vert_k = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(3, h // 6)))
    horiz = cv2.morphologyEx(ink, cv2.MORPH_OPEN, horiz_k)
    vert = cv2.morphologyEx(ink, cv2.MORPH_OPEN, vert_k)
    lines = cv2.bitwise_or(horiz, vert)
    cleaned = ink.copy()
    cleaned[lines > 0] = 0
    num, _, stats, _ = cv2.connectedComponentsWithStats(cleaned, connectivity=8)
    for i in range(1, num):
        _, _, bw, bh, area = stats[i]
        if area < 8 or bh < 4:
            cleaned[stats[i, 1] : stats[i, 1] + bh, stats[i, 0] : stats[i, 0] + bw] = 0
        if bh <= 2 and bw > int(0.45 * w):
            cleaned[stats[i, 1] : stats[i, 1] + bh, stats[i, 0] : stats[i, 0] + bw] = 0
    return cleaned


def _cluster_projection_peaks(
    proj: np.ndarray,
    y_offset: int,
    min_band_h: int,
    merge_px: int,
) -> List[TextBand]:
    h = proj.shape[0]
    if h < 10:
        return []
    k = max(3, min_band_h // 2)
    smooth = np.convolve(proj, np.ones(k) / float(k), mode="same")
    thresh = max(4.0, 0.22 * float(np.max(smooth)))
    active = smooth >= thresh
    segments: List[Tuple[int, int]] = []
    i = 0
    while i < h:
        if not active[i]:
            i += 1
            continue
        j = i
        while j + 1 < h and active[j + 1]:
            j += 1
        if j - i + 1 >= max(4, min_band_h // 2):
            segments.append((i, j))
        i = j + 1

    bands: List[TextBand] = []
    for y1_l, y2_l in segments:
        cy = (y1_l + y2_l) / 2.0 + y_offset
        seg = smooth[y1_l : y2_l + 1]
        bands.append(
            TextBand(
                y1=y1_l + y_offset,
                y2=y2_l + y_offset,
                center_y=cy,
                height=y2_l - y1_l + 1,
                ink_density=float(np.mean(seg)),
                horizontal_coverage=0.0,
            )
        )

    if not bands:
        return []

    bands.sort(key=lambda b: b.center_y)
    merged: List[TextBand] = [bands[0]]
    for b in bands[1:]:
        prev = merged[-1]
        if b.center_y - prev.center_y <= merge_px:
            y1 = min(prev.y1, b.y1)
            y2 = max(prev.y2, b.y2)
            cy = (y1 + y2) / 2.0
            merged[-1] = TextBand(
                y1=y1,
                y2=y2,
                center_y=cy,
                height=y2 - y1 + 1,
                ink_density=max(prev.ink_density, b.ink_density),
                horizontal_coverage=0.0,
            )
        else:
            merged.append(b)
    return merged


def _coverage_at_band(mask: np.ndarray, band: TextBand, y_offset: int) -> float:
    h, w = mask.shape[:2]
    y1 = max(0, band.y1 - y_offset)
    y2 = min(h - 1, band.y2 - y_offset)
    if y2 < y1:
        return 0.0
    strip = mask[y1 : y2 + 1, :]
    col = np.sum(strip > 0, axis=0) > 0
    if not np.any(col):
        return 0.0
    xs = np.where(col)[0]
    return float(xs[-1] - xs[0] + 1) / float(max(1, w))


def _select_eight_bands(
    candidates: List[TextBand],
    img_h: int,
    tcfg: Dict[str, Any],
) -> Optional[List[TextBand]]:
    if len(candidates) < 8:
        return None
    min_cov = float(tcfg.get("text_band_min_coverage_frac", 0.18))
    y_lo = int(img_h * float(tcfg.get("text_band_y_lo_frac", 0.20)))
    y_hi = int(img_h * float(tcfg.get("text_band_y_hi_frac", 0.94)))
    filtered = [
        b
        for b in candidates
        if b.horizontal_coverage >= min_cov and y_lo <= b.center_y <= y_hi
    ]
    if len(filtered) < 8:
        filtered = [b for b in candidates if y_lo <= b.center_y <= y_hi]
    if len(filtered) < 8:
        return None

    best: Optional[Tuple[float, List[TextBand]]] = None
    for start in range(0, len(filtered) - 7):
        chunk = filtered[start : start + 8]
        centers = [b.center_y for b in chunk]
        dists = [centers[i + 1] - centers[i] for i in range(7)]
        if any(d < 8 for d in dists):
            continue
        med = float(np.median(dists))
        cv = float(np.std(dists) / (med + 1e-6))
        cov_mean = float(np.mean([b.horizontal_coverage for b in chunk]))
        top_pen = 0.0
        if centers[0] < img_h * float(tcfg.get("text_band_first_center_min_frac", 0.30)):
            top_pen = 0.8
        score = cov_mean * 2.0 - cv * 1.5 - top_pen
        if best is None or score > best[0]:
            best = (score, chunk)

    if best is None:
        return None
    return best[1]


def _snap_boundary(
    y: int,
    merged: List[MergedCandidate],
    snap_px: int,
    min_span_frac: float,
    img_w: int,
) -> Tuple[int, bool]:
    min_span = int(img_w * min_span_frac)
    best_y = y
    best_score = -1.0
    for c in merged:
        if abs(c.y - y) <= snap_px and c.horizontal_span >= min_span:
            score = c.horizontal_span + c.support_count * 8.0
            if score > best_score:
                best_score = score
                best_y = c.y
    return best_y, best_y != y


def _robust_band_pitch(centers: List[float]) -> float:
    if len(centers) < 2:
        return 24.0
    dists = [centers[i + 1] - centers[i] for i in range(len(centers) - 1)]
    stable = [d for d in dists if d >= 14.0]
    if stable:
        return float(np.median(stable))
    return float(np.median(dists))


def _boundaries_uniform_pitch(
    selected: List[TextBand],
    sy1: int,
    sy2: int,
    img_h: int,
    tcfg: Dict[str, Any],
) -> List[int]:
    centers = [b.center_y for b in selected]
    pitch = _robust_band_pitch(centers)
    top = int(round(centers[0] - pitch * 0.55))
    top = max(sy1 + 2, min(top, int(centers[0] - 4)))
    bot = int(round(top + pitch * 8.0))
    bot = min(sy2 - 2, max(bot, int(centers[-1] + 4)))
    boundaries = [top]
    for k in range(1, 8):
        boundaries.append(int(round(top + k * pitch)))
    boundaries.append(bot)
    for i in range(1, len(boundaries)):
        if boundaries[i] <= boundaries[i - 1]:
            boundaries[i] = boundaries[i - 1] + max(12, int(pitch * 0.85))
    if boundaries[-1] > sy2 - 2:
        shift = boundaries[-1] - (sy2 - 2)
        boundaries = [b - shift for b in boundaries]
    return boundaries


def _min_row_height_px(img_h: int, tcfg: Dict[str, Any]) -> int:
    return max(14, int(img_h * float(tcfg.get("min_row_height_frac", 0.045)) * 0.65))


def _ensure_min_tail_row_height(
    boundaries: List[int], img_h: int, tcfg: Dict[str, Any]
) -> List[int]:
    """Bottom table row (place_of_issue) must fit label templates."""
    if len(boundaries) < 3:
        return boundaries
    min_rh = _min_row_height_px(img_h, tcfg)
    if boundaries[-1] - boundaries[-2] >= min_rh:
        return boundaries
    out = list(boundaries)
    out[-2] = max(out[-3] + min_rh, out[-1] - min_rh)
    return out


def _row_heights_ok(boundaries: List[int], img_h: int, tcfg: Dict[str, Any]) -> Tuple[bool, List[int]]:
    row_heights = [boundaries[i + 1] - boundaries[i] for i in range(8)]
    min_rh = max(14, int(img_h * float(tcfg.get("min_row_height_frac", 0.045)) * 0.65))
    max_rh = int(img_h * float(tcfg.get("text_band_max_row_height_frac", 0.16)))
    if any(rh < min_rh or rh > max_rh for rh in row_heights):
        return False, row_heights
    mean_h = float(np.mean(row_heights))
    row_cv = float(np.std(row_heights) / (mean_h + 1e-6))
    row_cv_max = float(tcfg.get("text_band_row_height_cv_max", 0.48))
    if row_cv > row_cv_max:
        return False, row_heights
    return True, row_heights


def try_text_band_row_fallback(
    image_bgr: np.ndarray,
    search_region: Tuple[int, int, int, int],
    merged_candidates: List[MergedCandidate],
    tcfg: Dict[str, Any],
) -> TextBandFallbackResult:
    h, w = image_bgr.shape[:2]
    sx1, sy1, sx2, sy2 = search_region
    out = TextBandFallbackResult(ok=False)

    if not table_region_plausible(
        cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY), search_region, tcfg
    ):
        out.message = "TABLE_REGION_CANDIDATE_NOT_FOUND"
        return out

    gray_roi = cv2.cvtColor(image_bgr[sy1:sy2, sx1:sx2], cv2.COLOR_BGR2GRAY)
    mask = _build_text_mask_roi(gray_roi)
    x_lo = int(mask.shape[1] * 0.06)
    x_hi = mask.shape[1]
    proj = np.sum(mask[:, x_lo:x_hi] > 0, axis=1).astype(np.float32)

    min_band_h = max(8, int((sy2 - sy1) * float(tcfg.get("text_band_min_height_frac", 0.028))))
    merge_px = max(6, int((sy2 - sy1) * float(tcfg.get("text_band_merge_frac", 0.04))))
    raw_bands = _cluster_projection_peaks(proj, sy1, min_band_h, merge_px)
    for attempt_merge in range(merge_px - 1, 3, -1):
        if len(raw_bands) >= 8:
            break
        trial = _cluster_projection_peaks(proj, sy1, min_band_h, attempt_merge)
        if len(trial) > len(raw_bands):
            raw_bands = trial
    out.raw_candidate_count = len(raw_bands)

    for b in raw_bands:
        b.horizontal_coverage = _coverage_at_band(mask, b, sy1)

    selected = _select_eight_bands(raw_bands, h, tcfg)
    if selected is None:
        out.message = "Could not select 8 coherent text bands."
        out.text_mask = mask
        out.projection = proj
        return out

    centers = [b.center_y for b in selected]
    out.bands = selected
    out.center_distances = [centers[i + 1] - centers[i] for i in range(7)]
    out.median_pitch = float(np.median(out.center_distances))
    out.pitch_cv = float(np.std(out.center_distances) / (out.median_pitch + 1e-6))

    pitch_cv_max = float(tcfg.get("text_band_pitch_cv_max", 0.42))
    if out.pitch_cv > pitch_cv_max:
        out.message = f"Text-band pitch CV {out.pitch_cv:.3f} too high."
        out.text_mask = mask
        out.projection = proj
        return out

    internal: List[int] = []
    for i in range(7):
        internal.append(int(round((centers[i] + centers[i + 1]) / 2.0)))

    pitch = out.median_pitch
    top_inf = int(round(centers[0] - pitch * 0.52))
    bot_inf = int(round(centers[7] + pitch * 0.52))
    top_inf = max(sy1 + 2, min(top_inf, int(centers[0] - 4)))
    bot_inf = min(sy2 - 2, max(bot_inf, int(centers[7] + 4)))

    boundaries = [top_inf] + internal + [bot_inf]
    layout_mode = "TEXT_MIDPOINT"

    snap_px = int(tcfg.get("text_band_snap_px", 10))
    min_span_frac = float(tcfg.get("text_band_snap_min_span_frac", 0.12))

    def _apply_snap(
        bounds: List[int], snap_internal: bool = True
    ) -> Tuple[List[int], List[str], List[bool]]:
        sources_l: List[str] = []
        snapped_l: List[bool] = []
        out_b = list(bounds)
        for i, y in enumerate(out_b):
            if not snap_internal and 0 < i < len(out_b) - 1:
                snapped_l.append(False)
                sources_l.append("TEXT_MIDPOINT")
                continue
            ny, did = _snap_boundary(y, merged_candidates, snap_px, min_span_frac, w)
            out_b[i] = ny
            snapped_l.append(did)
            if i == 0:
                sources_l.append("PHYSICAL" if did else "INFERRED")
            elif i == len(out_b) - 1:
                sources_l.append("PHYSICAL" if did else "INFERRED")
            else:
                sources_l.append("PHYSICAL" if did else "TEXT_MIDPOINT")
        return out_b, sources_l, snapped_l

    boundaries, sources, snapped = _apply_snap(boundaries)
    boundaries = _ensure_min_tail_row_height(boundaries, h, tcfg)

    for i in range(1, len(boundaries)):
        if boundaries[i] <= boundaries[i - 1]:
            out.message = "Non-monotonic boundaries after snap."
            return out

    ok_rh, row_heights = _row_heights_ok(boundaries, h, tcfg)
    if not ok_rh:
        boundaries = _boundaries_uniform_pitch(selected, sy1, sy2, h, tcfg)
        layout_mode = "UNIFORM_PITCH"
        boundaries, sources, snapped = _apply_snap(boundaries, snap_internal=False)
        boundaries = _ensure_min_tail_row_height(boundaries, h, tcfg)
        for i in range(1, len(boundaries)):
            if boundaries[i] <= boundaries[i - 1]:
                out.message = "Non-monotonic boundaries after uniform layout."
                return out
        ok_rh, row_heights = _row_heights_ok(boundaries, h, tcfg)
        if not ok_rh:
            out.message = f"Row heights out of range: {row_heights}"
            return out

    mean_h = float(np.mean(row_heights))
    row_cv = float(np.std(row_heights) / (mean_h + 1e-6))

    out.ok = True
    out.boundaries = boundaries
    out.boundary_sources = sources
    out.snapped_to_physical = snapped
    out.row_height_cv = row_cv
    out.structure_score = float(1.6 - out.pitch_cv - row_cv * 0.5)
    out.text_mask = mask
    out.projection = proj
    out.message = (
        "TEXT_BAND_ROW_FALLBACK accepted."
        if layout_mode == "TEXT_MIDPOINT"
        else "TEXT_BAND_ROW_FALLBACK accepted (uniform pitch)."
    )
    return out
