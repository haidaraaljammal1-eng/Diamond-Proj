"""MRZ-A17: fallback TD3 line crop row assignment (geometry only, no OCR)."""

from __future__ import annotations

from typing import Any

from mrz_detect_td3 import PairCandidate, RowCandidate


def resolve_td3_line_rows_for_crops(
    selected: PairCandidate,
    rows: list[RowCandidate],
    fb: dict,
) -> tuple[RowCandidate, RowCandidate]:
    """
    Map selected fallback pair to TD3 line1 (upper) and line2 (lower) row candidates.

    When A16 orphan-band rejection removed the true upper MRZ band, recover it for
    cropping only if it sits immediately above the selected top row with MRZ-like spacing.
    """
    top, bottom = (
        (selected.row_a, selected.row_b)
        if selected.row_a.y <= selected.row_b.y
        else (selected.row_b, selected.row_a)
    )
    pr = fb["pairing"]
    cfg = fb.get("crop_assignment") or {}
    max_gap_ratio = float(cfg.get("recover_orphan_max_gap_over_avg_height", pr["max_gap_height_ratio"]))

    recovered: list[RowCandidate] = [
        r
        for r in rows
        if r.rejected and r.reject_reason == "line_artifact_orphan_band_above_core_pair"
    ]
    best: RowCandidate | None = None
    for r in recovered:
        gap = top.y - (r.y + r.h)
        if gap < 0:
            continue
        avg_h = (r.h + top.h) / 2.0
        if gap > avg_h * max_gap_ratio:
            continue
        if r.w / max(top.w, 1) < pr["min_width_ratio"] * 0.95:
            continue
        if best is None or r.y < best.y:
            best = r

    if best is not None:
        line1_row, line2_row = best, top
    else:
        line1_row, line2_row = top, bottom

    # Prefer the lower row with stronger text ink among selected bottom and alternates.
    min_ink = float(cfg.get("min_line2_ink_density", 0.03))
    if line2_row.ink_density < min_ink:
        candidates = [
            r
            for r in rows
            if not r.rejected
            and r.row_id != line1_row.row_id
            and r.y > line1_row.y + line1_row.h
            and r.ink_density >= min_ink
        ]
        if candidates:
            line2_row = min(candidates, key=lambda r: r.y)

    if line1_row.y > line2_row.y:
        line1_row, line2_row = line2_row, line1_row

    return line1_row, line2_row
