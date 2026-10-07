"""Detect eight logical rows inside the data table (geometry only)."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from src.detect_table import StructureMode, _find_horizontal_line_ys, _horizontal_line_mask


class RowStructureStatus(str, Enum):
    DIRECT_STRUCTURE = "DIRECT_STRUCTURE"
    ONE_SEPARATOR_INFERRED = "ONE_SEPARATOR_INFERRED"
    STRUCTURE_RECOVERED = "STRUCTURE_RECOVERED"
    ROW_STRUCTURE_FAILED = "ROW_STRUCTURE_FAILED"


@dataclass
class RowInfo:
    index: int
    semantic: str
    y1: int
    y2: int

    def to_dict(self) -> Dict[str, Any]:
        return {
            "index": self.index,
            "semantic": self.semantic,
            "y1": self.y1,
            "y2": self.y2,
        }


@dataclass
class RowDetectionResult:
    status: RowStructureStatus
    separator_ys: List[int]
    rows: List[RowInfo]
    message: str = ""
    structure_score: float = 0.0
    row_height_cv: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status.value,
            "separator_ys": self.separator_ys,
            "rows": [r.to_dict() for r in self.rows],
            "message": self.message,
            "structure_score": round(self.structure_score, 4),
            "row_height_cv": round(self.row_height_cv, 4),
        }


def _select_n_plus_one_separators(
    ys: List[int],
    expected_rows: int,
    y_min: int,
    y_max: int,
) -> Optional[List[int]]:
    need = expected_rows + 1
    if len(ys) < need:
        return None
    if len(ys) == need:
        return ys

    best: Optional[Tuple[float, List[int]]] = None
    for i in range(0, len(ys) - need + 1):
        chunk = ys[i : i + need]
        spacings = np.diff(chunk)
        if np.any(spacings <= 0):
            continue
        cv = float(np.std(spacings) / (np.mean(spacings) + 1e-6))
        if best is None or cv < best[0]:
            best = (cv, chunk)
    if best is not None:
        return best[1]

    uniform = [int(round(y_min + (y_max - y_min) * i / expected_rows)) for i in range(need)]
    return uniform


def _row_heights(separators: List[int], expected_rows: int) -> List[int]:
    return [separators[i + 1] - separators[i] for i in range(expected_rows)]


def _repair_row_separators(
    separators: List[int],
    expected_rows: int,
    min_rh: int,
    max_rh: int,
    max_iter: int = 64,
) -> Optional[List[int]]:
    """Nudge internal separators when text-band boundaries over-split rows (geometry only)."""
    if len(separators) != expected_rows + 1:
        return None
    sep = list(separators)
    n = expected_rows
    for _ in range(max_iter):
        heights = _row_heights(sep, n)
        if all(min_rh <= h <= max_rh for h in heights):
            return sep
        thin = [i for i, h in enumerate(heights) if h < min_rh]
        if thin:
            i = min(thin, key=lambda j: heights[j])
            deficit = min_rh - heights[i]
            if i > 0:
                slack = heights[i - 1] - min_rh
                take = min(deficit, max(0, slack))
                if take > 0:
                    sep[i] -= take
                    deficit -= take
            if deficit > 0 and i < n - 1:
                slack = heights[i + 1] - min_rh
                take = min(deficit, max(0, slack))
                if take > 0:
                    sep[i + 1] += take
                    deficit -= take
            if deficit > 0:
                return None
            continue
        thick = [i for i, h in enumerate(heights) if h > max_rh]
        if not thick:
            return None
        i = max(thick, key=lambda j: heights[j])
        excess = heights[i] - max_rh
        give = excess // 2
        if give <= 0:
            return None
        if i > 0:
            sep[i] -= give
            excess -= give
        if excess > 0 and i < n - 1:
            sep[i + 1] += excess
    return None


def _uniform_internal_separators(y0: int, y1: int, k: int) -> List[int]:
    """k rows between y0 and y1; return k-1 internal separator y-coordinates."""
    span = y1 - y0
    base, rem = divmod(span, k)
    internal: List[int] = []
    acc = y0
    for i in range(k - 1):
        acc += base + (1 if i < rem else 0)
        internal.append(acc)
    return internal


def _rebalance_thin_tail_separators(
    separators: List[int],
    expected_rows: int,
    min_vc: int,
    min_rh: int,
) -> List[int]:
    """
    When text-band fallback over-splits the table tail, expiry/place rows become too
    short for label-template value crops. Re-partition the thin cluster uniformly.

    Prefer the smallest tail chunk (thin rows + one stable row above) and borrow vertical
    slack from the donor row above by nudging its bottom boundary upward, instead of
    expanding the chunk upward and shifting issue/dob separators (live_test_007).
    """
    if len(separators) != expected_rows + 1:
        return separators
    sep = list(separators)
    n = expected_rows
    heights = _row_heights(sep, n)
    thin_tail = 0
    for h in reversed(heights):
        if h < min_vc:
            thin_tail += 1
        else:
            break
    if thin_tail < 2:
        return sep

    need_rows = thin_tail + 1
    best: Optional[Tuple[int, int, List[int]]] = None

    for k in range(need_rows, n + 1):
        start = n - k
        y1 = sep[-1]
        anchor = sep[start]
        need_span = k * min_vc
        slack = 0
        if start > 0:
            # Donor row must stay tall enough for label templates, not only min_rh.
            slack = max(0, sep[start] - sep[start - 1] - min_vc)
        y0_min = anchor - slack
        if y1 - y0_min >= need_span:
            y0 = y0_min
        elif y1 - anchor >= need_span:
            y0 = anchor
        else:
            continue
        borrow = anchor - y0
        internal = _uniform_internal_separators(y0, y1, k)
        trial = sep[: start + 1]
        if borrow > 0:
            trial[start] = y0
        trial.extend(internal)
        trial.append(y1)
        trial_h = _row_heights(trial, n)
        if any(h < min_rh for h in trial_h):
            continue
        if any(h < min_vc for h in trial_h[start:]):
            continue
        # Prefer smallest k, then tallest tail rows (max borrow from donor).
        cost = max(0, k - need_rows) * 1000 - borrow
        if best is None or cost < best[0]:
            best = (cost, borrow, trial)

    if best is None:
        return sep
    return best[2]


def _rows_from_separators(
    separators: List[int],
    semantics: List[str],
    expected_rows: int,
) -> List[RowInfo]:
    rows: List[RowInfo] = []
    for i in range(expected_rows):
        rows.append(
            RowInfo(
                index=i + 1,
                semantic=semantics[i],
                y1=separators[i],
                y2=separators[i + 1],
            )
        )
    return rows


def detect_rows(
    image_bgr: np.ndarray,
    table_bbox: Tuple[int, int, int, int],
    config: Dict[str, Any],
    table_line_ys: Optional[List[int]] = None,
    table_structure_mode: Optional[str] = None,
    table_structure_score: float = 0.0,
) -> RowDetectionResult:
    rcfg = config.get("rows", {})
    semantics: List[str] = list(config.get("semantic_row_order", []))
    expected_rows = int(rcfg.get("expected_logical_rows", 8))
    if len(semantics) != expected_rows:
        semantics = [
            "license_number",
            "name_ar",
            "name_en",
            "nationality",
            "date_of_birth",
            "issue_date",
            "expiry_date",
            "place_of_issue",
        ]

    x1, y1, x2, y2 = table_bbox
    need_sep = expected_rows + 1

    if table_line_ys and len(table_line_ys) == need_sep:
        separators = list(table_line_ys)
        if table_structure_mode in (
            StructureMode.ONE_SEPARATOR_INFERRED.value,
            "BOTTOM_BOUNDARY_INFERRED",
        ):
            structure_status = RowStructureStatus.ONE_SEPARATOR_INFERRED
        elif table_structure_mode == StructureMode.TEXT_BAND_ROW_FALLBACK.value:
            structure_status = RowStructureStatus.STRUCTURE_RECOVERED
        else:
            structure_status = RowStructureStatus.DIRECT_STRUCTURE
        structure_score = table_structure_score
    else:
        roi = image_bgr[y1:y2, x1:x2]
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        tcfg = config.get("table", {})
        horiz = _horizontal_line_mask(gray, tcfg)
        merge_px = int(rcfg.get("line_y_merge_px", 6))
        local_ys = _find_horizontal_line_ys(horiz, merge_px)
        global_ys = [y1 + y for y in local_ys]

        if table_line_ys:
            global_ys = sorted(set(global_ys + [y for y in table_line_ys if y1 <= y <= y2]))

        in_table = [y for y in global_ys if y1 <= y <= y2]
        structure_status = RowStructureStatus.DIRECT_STRUCTURE
        separators = _select_n_plus_one_separators(in_table, expected_rows, y1, y2)

        if separators is None or len(separators) != need_sep:
            sep_min = int(rcfg.get("expected_separator_count_min", 7))
            if len(in_table) >= sep_min:
                separators = _select_n_plus_one_separators(
                    in_table[: int(rcfg.get("expected_separator_count_max", 11))],
                    expected_rows,
                    y1,
                    y2,
                )
                structure_status = RowStructureStatus.STRUCTURE_RECOVERED
            else:
                return RowDetectionResult(
                    status=RowStructureStatus.ROW_STRUCTURE_FAILED,
                    separator_ys=in_table,
                    rows=[],
                    message=f"Insufficient separators ({len(in_table)}).",
                )

        if separators is None or len(separators) != need_sep:
            return RowDetectionResult(
                status=RowStructureStatus.ROW_STRUCTURE_FAILED,
                separator_ys=in_table,
                rows=[],
                message="Could not derive 9 separator boundaries for 8 rows.",
            )
        structure_score = 0.0

    min_rh = int(rcfg.get("min_row_height_px", 18))
    max_rh = int(rcfg.get("max_row_height_px", 180))
    row_heights = _row_heights(separators, expected_rows)
    if any(rh < min_rh or rh > max_rh for rh in row_heights):
        repaired = _repair_row_separators(separators, expected_rows, min_rh, max_rh)
        if repaired is not None:
            separators = repaired
            row_heights = _row_heights(separators, expected_rows)
            if structure_status == RowStructureStatus.DIRECT_STRUCTURE:
                structure_status = RowStructureStatus.STRUCTURE_RECOVERED
        if any(rh < min_rh or rh > max_rh for rh in row_heights):
            return RowDetectionResult(
                status=RowStructureStatus.ROW_STRUCTURE_FAILED,
                separator_ys=separators,
                rows=[],
                message=f"Row heights out of range [{min_rh}, {max_rh}]: {row_heights}.",
            )

    min_vc = int(rcfg.get("min_value_crop_row_px", max(min_rh + 4, 22)))
    rebalanced = _rebalance_thin_tail_separators(
        separators, expected_rows, min_vc, min_rh
    )
    if rebalanced != separators:
        separators = rebalanced
        row_heights = _row_heights(separators, expected_rows)
        if structure_status == RowStructureStatus.DIRECT_STRUCTURE:
            structure_status = RowStructureStatus.STRUCTURE_RECOVERED
        if any(rh < min_rh or rh > max_rh for rh in row_heights):
            return RowDetectionResult(
                status=RowStructureStatus.ROW_STRUCTURE_FAILED,
                separator_ys=separators,
                rows=[],
                message=f"Row heights out of range after tail rebalance [{min_rh}, {max_rh}]: {row_heights}.",
            )

    mean_h = float(np.mean(row_heights))
    row_cv = float(np.std(row_heights) / (mean_h + 1e-6))
    cv_max = float(rcfg.get("row_height_cv_max", 0.45))
    if row_cv > cv_max:
        return RowDetectionResult(
            status=RowStructureStatus.ROW_STRUCTURE_FAILED,
            separator_ys=separators,
            rows=[],
            message=f"Row height inconsistency CV={row_cv:.3f} > {cv_max}; heights={row_heights}.",
            row_height_cv=row_cv,
        )

    rows = _rows_from_separators(separators, semantics, expected_rows)
    return RowDetectionResult(
        status=structure_status,
        separator_ys=separators,
        rows=rows,
        message="Eight rows mapped by vertical order.",
        structure_score=structure_score,
        row_height_cv=row_cv,
    )
