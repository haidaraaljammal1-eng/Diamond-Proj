"""Fixed label template matching (no OCR)."""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

from src.value_crop.english_label import (
    EnLabelBleedStatus,
    MAX_EN_LABEL_RIGHT_EXPAND_PX,
    check_english_label_value_bleed,
    tighten_english_label_ink,
)
from src.value_crop.models import BoundaryStatus, LabelDetection
from src.value_crop.preprocess import detect_text_band, prepare_ink_mask
from src.value_crop.template_ink import (
    InkBBox,
    load_template_ink_bboxes,
    map_ink_bbox_to_row,
)


def load_templates(template_dir: Path) -> Dict[str, np.ndarray]:
    templates: Dict[str, np.ndarray] = {}
    skip = {
        "label_templates_debug.png",
        "label_templates_ink_bbox_debug.png",
        "english_label_purity_debug.png",
        "english_templates_before_after.png",
    }
    for path in sorted(template_dir.glob("*.png")):
        if path.name in skip:
            continue
        img = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
        if img is not None:
            templates[path.stem] = img
    return templates


def _prep_match_image(gray: np.ndarray) -> np.ndarray:
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    return cv2.normalize(blur, None, 0, 255, cv2.NORM_MINMAX)


def match_label(
    gray_norm: np.ndarray,
    template: np.ndarray,
    template_name: str,
    template_ink: InkBBox,
    search_frac: Tuple[float, float, float, float],
    scales: List[float],
    expected_side: str,
    match_min: float,
    geom_min: float,
    min_label_width_ratio: float = 0.72,
) -> LabelDetection:
    h, w = gray_norm.shape[:2]
    sx1 = int(search_frac[0] * w)
    sy1 = int(search_frac[1] * h)
    sx2 = int(search_frac[2] * w)
    sy2 = int(search_frac[3] * h)
    roi = _prep_match_image(gray_norm[sy1:sy2, sx1:sx2])
    ink = prepare_ink_mask(gray_norm)
    text_y1, text_y2 = detect_text_band(ink)

    best_score = -1.0
    best_bbox = (sx1, sy1, sx2, sy2)
    best_scale = 1.0
    tmpl_h, tmpl_w = template.shape[:2]
    tix1, tiy1, tix2, tiy2 = template_ink
    template_ink_w = max(1, tix2 - tix1)

    for scale in scales:
        nh = max(4, int(round(tmpl_h * scale)))
        nw = max(4, int(round(tmpl_w * scale)))
        tmpl = cv2.resize(template, (nw, nh), interpolation=cv2.INTER_LINEAR)
        tmpl = _prep_match_image(tmpl)
        if roi.shape[0] < nh or roi.shape[1] < nw:
            continue
        res = cv2.matchTemplate(roi, tmpl, cv2.TM_CCOEFF_NORMED)
        _, max_val, _, max_loc = cv2.minMaxLoc(res)
        if max_val > best_score:
            x = sx1 + max_loc[0]
            y = sy1 + max_loc[1]
            best_score = float(max_val)
            best_bbox = (x, y, x + nw, y + nh)
            best_scale = float(scale)

    tx1, ty1, tx2, ty2 = best_bbox
    mapped_ink = map_ink_bbox_to_row(template_ink, tx1, ty1, best_scale)

    if expected_side == "left":
        tightened = tighten_english_label_ink(ink, best_bbox, mapped_ink)
        right_cap = mapped_ink[2] + MAX_EN_LABEL_RIGHT_EXPAND_PX
        final_ink = (
            tightened[0],
            tightened[1],
            min(tightened[2], right_cap),
            tightened[3],
        )
        bleed_status, nxt_x = check_english_label_value_bleed(
            ink, final_ink, text_y1, text_y2
        )
    else:
        final_ink = mapped_ink
        bleed_status = EnLabelBleedStatus.EN_LABEL_CLEAN
        nxt_x = None

    detected_w = final_ink[2] - final_ink[0]
    expected_w = max(1, int(round(template_ink_w * best_scale)))
    width_ratio = detected_w / float(expected_w)

    overlap_x = max(0, min(tx2, final_ink[2]) - max(tx1, final_ink[0]))
    overlap = overlap_x / max(1, expected_w)
    geom = 0.45 + 0.35 * min(1.0, overlap) + 0.20 * min(1.0, width_ratio)

    match_component = max(0.0, best_score)
    final = 0.55 * match_component + 0.45 * min(1.0, geom)

    status = BoundaryStatus.FOUND
    if match_component < match_min:
        status = BoundaryStatus.NOT_FOUND
    elif width_ratio < min_label_width_ratio:
        status = BoundaryStatus.AMBIGUOUS
    elif geom < geom_min:
        status = BoundaryStatus.AMBIGUOUS
    elif final < match_min * 0.85:
        status = BoundaryStatus.AMBIGUOUS

    if width_ratio < min_label_width_ratio * 0.85:
        status = BoundaryStatus.NOT_FOUND

    if expected_side == "left" and bleed_status == EnLabelBleedStatus.EN_LABEL_VALUE_BLEED:
        status = BoundaryStatus.AMBIGUOUS

    return LabelDetection(
        template_name=template_name,
        bbox=final_ink,
        template_match_bbox=best_bbox,
        ink_bbox=final_ink,
        match_scale=best_scale,
        template_ink_width=template_ink_w,
        detected_width_ratio=width_ratio,
        match_score=match_component,
        geometry_score=geom,
        final_confidence=final,
        status=status,
        right_edge=int(final_ink[2]),
        left_edge=int(final_ink[0]),
        en_bleed_check=bleed_status.value,
        next_value_component_x=nxt_x,
    )


class LabelMatcher:
    """Caches template images and ink bboxes."""

    def __init__(self, template_dir: Path) -> None:
        self.template_dir = template_dir
        self.templates = load_templates(template_dir)
        self.template_ink = load_template_ink_bboxes(template_dir)

    def match(
        self,
        gray_norm: np.ndarray,
        template_name: str,
        search_frac: Tuple[float, float, float, float],
        scales: List[float],
        expected_side: str,
        match_min: float,
        geom_min: float,
    ) -> LabelDetection:
        tmpl = self.templates[template_name]
        ink_bb = self.template_ink.get(template_name, (0, 0, tmpl.shape[1], tmpl.shape[0]))
        return match_label(
            gray_norm,
            tmpl,
            template_name,
            ink_bb,
            search_frac,
            scales,
            expected_side,
            match_min,
            geom_min,
        )
