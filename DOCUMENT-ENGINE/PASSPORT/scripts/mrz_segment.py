"""Split detected MRZ region into two TD3 text lines."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np


@dataclass
class SegmentationResult:
    success: bool
    line1: np.ndarray | None
    line2: np.ndarray | None
    diagnostics: dict[str, Any]
    message: str = ""


def _horizontal_projection(binary_inv: np.ndarray) -> np.ndarray:
    return binary_inv.sum(axis=1).astype(np.float32)


def segment_two_lines(mrz_bgr: np.ndarray) -> SegmentationResult:
    h, w = mrz_bgr.shape[:2]
    gray = cv2.cvtColor(mrz_bgr, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)
    _, bw = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    proj = _horizontal_projection(bw)
    if proj.max() > 0:
        proj_n = proj / proj.max()
    else:
        proj_n = proj

    thresh = 0.25
    runs: list[tuple[int, int]] = []
    in_run = False
    start = 0
    for i, v in enumerate(proj_n):
        if v >= thresh and not in_run:
            in_run = True
            start = i
        elif v < thresh and in_run:
            in_run = False
            runs.append((start, i))
    if in_run:
        runs.append((start, h - 1))

    margin_y = max(2, h // 40)
    margin_x = max(4, w // 80)

    diagnostics: dict[str, Any] = {
        "mrz_height": h,
        "mrz_width": w,
        "text_runs": runs,
        "margin_x": margin_x,
        "margin_y": margin_y,
    }

    if len(runs) >= 2:
        runs = sorted(runs, key=lambda r: r[0])[:2]
        if len(runs) > 2:
            # take two strongest by height
            runs = sorted(runs, key=lambda r: r[1] - r[0], reverse=True)[:2]
            runs.sort(key=lambda r: r[0])
    elif len(runs) == 1:
        mid = (runs[0][0] + runs[0][1]) // 2
        runs = [(runs[0][0], mid), (mid, runs[0][1])]
        diagnostics["split_mode"] = "single_run_halved"
    else:
        # equal split fallback
        mid = h // 2
        runs = [(0, mid), (mid, h - 1)]
        diagnostics["split_mode"] = "equal_fallback"

    line_crops = []
    for i, (y0, y1) in enumerate(runs[:2]):
        y0 = max(0, y0 - margin_y)
        y1 = min(h - 1, y1 + margin_y)
        x0 = margin_x
        x1 = w - margin_x
        crop = mrz_bgr[y0:y1, x0:x1]
        line_crops.append(crop)
        diagnostics[f"line{i+1}_bbox"] = {"x0": x0, "y0": y0, "x1": x1, "y1": y1}

    if len(line_crops) < 2:
        return SegmentationResult(
            success=False,
            line1=None,
            line2=None,
            diagnostics=diagnostics,
            message="could not form two line crops",
        )

    return SegmentationResult(
        success=True,
        line1=line_crops[0],
        line2=line_crops[1],
        diagnostics=diagnostics,
    )


def save_segmentation(
    seg: SegmentationResult,
    out_dir: Path,
) -> None:
    if seg.line1 is not None:
        cv2.imwrite(str(out_dir / "line1.png"), seg.line1)
    if seg.line2 is not None:
        cv2.imwrite(str(out_dir / "line2.png"), seg.line2)
    with open(out_dir / "segmentation.json", "w", encoding="utf-8") as f:
        json.dump(seg.diagnostics, f, indent=2)
