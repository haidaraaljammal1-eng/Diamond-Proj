"""Value crop pipeline orchestration."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

from src.detect_rows import RowInfo
from src.value_crop.build_templates import require_templates
from src.value_crop.canonical import map_bbox_to_original, normalize_row
from src.value_crop.geometry_check import (
    assert_no_overlap,
    assert_value_has_ink,
    label_ink_bbox,
)
from src.value_crop.english_label import EnLabelBleedStatus
from src.value_crop.labels import LabelMatcher
from src.value_crop.models import (
    BoundaryStatus,
    FieldStatus,
    LabelDetection,
    Type2Diagnostics,
    ValueCropPipelineResult,
    ValueCropResult,
)
from src.value_crop.preprocess import detect_text_band, prepare_ink_mask, suppress_table_lines
from src.value_crop.template_ink import load_template_ink_bboxes
from src.value_crop.type2_english_recover import (
    assert_english_crop_glyph_profile,
    cap_type2_english_right_edge,
    min_english_phrase_width,
    phrase_width_ok,
    recover_english_phrase_from_ink,
    trim_type2_english_bbox,
)
from src.value_crop.type2_split import (
    Type2SupportMode,
    analyze_type2_split,
    build_type2_text_mask,
    expanded_arabic_bleed_rect,
)


FIELD_ORDER = [
    "license_number",
    "name_ar",
    "name_en",
    "nationality",
    "date_of_birth",
    "issue_date",
    "expiry_date",
    "place_of_issue",
]

_TYPE1_DATE_SEMANTICS = frozenset(
    {"date_of_birth", "issue_date", "expiry_date"},
)


def _clamp_gap(value_config: Dict, row_w: int, key: str) -> int:
    if key == "gap":
        frac = float(value_config.get("tiny_gap_width_frac", 0.005))
        lo = int(value_config.get("tiny_gap_min_px", 2))
        hi = int(value_config.get("tiny_gap_max_px", 4))
    else:
        frac = float(value_config.get("tiny_outer_inset_width_frac", 0.003))
        lo = int(value_config.get("tiny_outer_inset_min_px", 1))
        hi = int(value_config.get("tiny_outer_inset_max_px", 3))
    return int(np.clip(round(row_w * frac), lo, hi))


def _label_ok(det: Optional[LabelDetection], conf_min: float, require_clean_en: bool = False) -> bool:
    if det is None:
        return False
    if require_clean_en and det.en_bleed_check != EnLabelBleedStatus.EN_LABEL_CLEAN.value:
        return False
    return (
        det.status == BoundaryStatus.FOUND
        and det.final_confidence >= conf_min
        and det.detected_width_ratio >= 0.72
    )


def _en_label_field_status(det: Optional[LabelDetection]) -> FieldStatus:
    if det is None:
        return FieldStatus.VALUE_BOUNDARY_UNCERTAIN
    if det.en_bleed_check == EnLabelBleedStatus.EN_LABEL_VALUE_BLEED.value:
        return FieldStatus.EN_LABEL_VALUE_BLEED
    if det.status != BoundaryStatus.FOUND:
        return FieldStatus.LABEL_BOUNDARY_CONFLICT
    return FieldStatus.VALUE_BOUNDARY_UNCERTAIN


def _labels_conflict(en: Optional[LabelDetection], ar: Optional[LabelDetection]) -> bool:
    if en and en.status != BoundaryStatus.FOUND:
        return en.status == BoundaryStatus.AMBIGUOUS
    if ar and ar.status != BoundaryStatus.FOUND:
        return ar.status == BoundaryStatus.AMBIGUOUS
    if en and ar and en.right_edge >= ar.left_edge - 5:
        return True
    return False


def _finalize_value(
    semantic: str,
    structure: str,
    value_bbox: Optional[Tuple[int, int, int, int]],
    ink: np.ndarray,
    blockers: List[Tuple[int, int, int, int]],
    en_det: Optional[LabelDetection],
    ar_det: Optional[LabelDetection],
    type2_diag: Optional[Type2Diagnostics],
    scale: float,
    message: str,
    geometry_note: str,
) -> ValueCropResult:
    if value_bbox is None:
        return ValueCropResult(
            semantic=semantic,
            structure_type=structure,
            field_status=FieldStatus.VALUE_BOUNDARY_UNCERTAIN,
            value_bbox=None,
            value_bbox_canonical=None,
            english_label=en_det,
            arabic_label=ar_det,
            type2=type2_diag,
            geometry_assertion=geometry_note,
            message=message,
        )
    if not assert_value_has_ink(ink, value_bbox):
        return ValueCropResult(
            semantic=semantic,
            structure_type=structure,
            field_status=FieldStatus.VALUE_REGION_EMPTY_OR_INVALID,
            value_bbox=None,
            value_bbox_canonical=None,
            english_label=en_det,
            arabic_label=ar_det,
            type2=type2_diag,
            geometry_assertion="empty_value_ink",
            message=message or "Value region has insufficient ink.",
        )
    if not assert_no_overlap(value_bbox, blockers):
        return ValueCropResult(
            semantic=semantic,
            structure_type=structure,
            field_status=FieldStatus.VALUE_GEOMETRY_CONFLICT,
            value_bbox=None,
            value_bbox_canonical=None,
            english_label=en_det,
            arabic_label=ar_det,
            type2=type2_diag,
            geometry_assertion="value_intersects_label_or_ar_value",
            message=message or "Value box intersects forbidden ink.",
        )
    orig = map_bbox_to_original(value_bbox, scale)
    return ValueCropResult(
        semantic=semantic,
        structure_type=structure,
        field_status=FieldStatus.VALUE_OK,
        value_bbox=orig,
        value_bbox_canonical=value_bbox,
        english_label=en_det,
        arabic_label=ar_det,
        type2=type2_diag,
        geometry_assertion="pass",
        message=message,
    )


def process_field(
    semantic: str,
    row_bgr: np.ndarray,
    fcfg: Dict,
    matcher: LabelMatcher,
    value_config: Dict,
    canonical_width: int,
) -> ValueCropResult:
    structure = fcfg["structure_type"]
    scales = list(value_config.get("template_scales", [1.0]))
    match_min = float(value_config.get("match_score_min", 0.42))
    geom_min = float(value_config.get("geometry_score_min", 0.35))
    conf_min = float(value_config.get("final_confidence_min", 0.45))

    norm_bgr, scale = normalize_row(row_bgr, canonical_width)
    gray = cv2.cvtColor(norm_bgr, cv2.COLOR_BGR2GRAY)
    proc = suppress_table_lines(gray)
    ink = prepare_ink_mask(proc)
    h, w = gray.shape[:2]
    text_y1, text_y2 = detect_text_band(ink)
    pad = int(round((text_y2 - text_y1) * float(value_config.get("vertical_pad_frac", 0.04))))
    text_y1 = max(0, text_y1 - pad)
    text_y2 = min(h - 1, text_y2 + pad)
    if semantic == "license_number":
        text_y1, text_y2 = 0, h - 1

    gap = _clamp_gap(value_config, w, "gap")
    inset = _clamp_gap(value_config, w, "outer")

    en_det: Optional[LabelDetection] = None
    ar_det: Optional[LabelDetection] = None
    type2_diag: Optional[Type2Diagnostics] = None

    def match_en():
        return matcher.match(
            gray,
            fcfg["en_template"],
            tuple(fcfg["en_search"]),
            scales,
            "left",
            match_min,
            geom_min,
        )

    def match_ar():
        return matcher.match(
            gray,
            fcfg["ar_template"],
            tuple(fcfg["ar_search"]),
            scales,
            "right",
            match_min,
            geom_min,
        )

    if structure == "TYPE_1_SINGLE_VALUE":
        en_det = match_en()
        ar_det = match_ar()
        if _labels_conflict(en_det, ar_det):
            st = (
                FieldStatus.LABEL_BOUNDARY_CONFLICT
                if (en_det and en_det.status == BoundaryStatus.AMBIGUOUS)
                or (ar_det and ar_det.status == BoundaryStatus.AMBIGUOUS)
                else FieldStatus.VALUE_BOUNDARY_UNCERTAIN
            )
            return ValueCropResult(
                semantic=semantic,
                structure_type=structure,
                field_status=st,
                value_bbox=None,
                value_bbox_canonical=None,
                english_label=en_det,
                arabic_label=ar_det,
                message="TYPE1 label anchors unreliable.",
            )
        if not _label_ok(en_det, conf_min, True) or not _label_ok(ar_det, conf_min):
            return ValueCropResult(
                semantic=semantic,
                structure_type=structure,
                field_status=_en_label_field_status(en_det)
                if en_det and not _label_ok(en_det, conf_min, True)
                else FieldStatus.LABEL_BOUNDARY_CONFLICT,
                value_bbox=None,
                value_bbox_canonical=None,
                english_label=en_det,
                arabic_label=ar_det,
                message="TYPE1 label width or confidence failed.",
            )
        vx1 = en_det.right_edge + gap
        vx2 = ar_det.left_edge - gap
        blockers = [en_det.ink_bbox, ar_det.ink_bbox]
        vb = (vx1, text_y1, vx2, text_y2) if vx2 - vx1 >= 10 else None
        if vb and semantic in _TYPE1_DATE_SEMANTICS:
            band_h = max(8, text_y2 - text_y1)
            narrowed = recover_english_phrase_from_ink(
                ink, vb[0], vb[2], vb[1], vb[3], band_h
            )
            if narrowed and phrase_width_ok(narrowed, band_h):
                vb = narrowed
        return _finalize_value(
            semantic, structure, vb, ink, blockers, en_det, ar_det, None, scale, "", "type1"
        )

    if structure == "TYPE_2_TRANSLATED_VALUE":
        en_det = match_en()
        ar_det = match_ar()
        if _labels_conflict(en_det, ar_det):
            return ValueCropResult(
                semantic=semantic,
                structure_type=structure,
                field_status=FieldStatus.LABEL_BOUNDARY_CONFLICT,
                value_bbox=None,
                value_bbox_canonical=None,
                english_label=en_det,
                arabic_label=ar_det,
                message="TYPE2 label anchors conflict.",
            )
        if not _label_ok(en_det, conf_min, True) or not _label_ok(ar_det, conf_min):
            return ValueCropResult(
                semantic=semantic,
                structure_type=structure,
                field_status=_en_label_field_status(en_det)
                if en_det and not _label_ok(en_det, conf_min, True)
                else FieldStatus.LABEL_BOUNDARY_CONFLICT,
                value_bbox=None,
                value_bbox_canonical=None,
                english_label=en_det,
                arabic_label=ar_det,
                message="TYPE2 label width or confidence failed.",
            )

        internal_x1 = en_det.right_edge + gap
        internal_x2 = ar_det.left_edge - gap
        if internal_x2 - internal_x1 < 20:
            return ValueCropResult(
                semantic=semantic,
                structure_type=structure,
                field_status=FieldStatus.VALUE_BOUNDARY_UNCERTAIN,
                value_bbox=None,
                value_bbox_canonical=None,
                english_label=en_det,
                arabic_label=ar_det,
                message="TYPE2 internal window too narrow.",
            )

        t2_mask = build_type2_text_mask(gray, internal_x1, internal_x2, text_y1, text_y2)
        t2 = analyze_type2_split(
            gray,
            t2_mask,
            internal_x1,
            internal_x2,
            text_y1,
            text_y2,
            ink=ink,
            arabic_field_label_left=ar_det.left_edge,
        )
        tf_dbg = t2.two_front_debug
        type2_diag = Type2Diagnostics(
            english_label_right=en_det.right_edge,
            arabic_field_label_left=ar_det.left_edge,
            internal_x1=internal_x1,
            internal_x2=internal_x2,
            arabic_value_full_bbox=t2.arabic_value_full_bbox,
            arabic_value_left_edge=t2.arabic_value_left_edge,
            arabic_value_left_edge_confidence=t2.arabic_value_left_edge_confidence,
            arabic_phrase_status=t2.arabic_phrase_status.value,
            arabic_component_count=t2.arabic_component_count,
            projection_split_x=t2.projection_split_x,
            translation_split_x=t2.translation_split_x,
            split_raw_score=t2.split_raw_score,
            normalized_confidence=t2.normalized_confidence,
            split_status=t2.split_status,
            support_mode=t2.support_mode.value,
            estimates_agree=t2.estimates_agree,
            english_value_full_bbox=t2.english_value_full_bbox,
            english_front_x2=tf_dbg.english_front_x2 if tf_dbg else 0,
            arabic_front_x1=tf_dbg.arabic_front_x1 if tf_dbg else 0,
            failure_code=tf_dbg.failure_code if tf_dbg else None,
            ordered_islands=list(tf_dbg.ordered_islands) if tf_dbg else [],
            gap_score_table=list(tf_dbg.gap_score_table) if tf_dbg else [],
        )

        def attempt_group_overlap_recovery() -> Optional[ValueCropResult]:
            if type2_diag.failure_code != "TYPE2_GROUP_OVERLAP":
                return None
            band_h = max(8, text_y2 - text_y1)
            recovered = recover_english_phrase_from_ink(
                ink,
                internal_x1,
                internal_x2,
                text_y1,
                text_y2,
                band_h,
            )
            if not recovered or not phrase_width_ok(recovered, band_h):
                return None
            ar_cap = ar_det.left_edge - gap
            if type2_diag.ordered_islands:
                isl_x1: Optional[int] = None
                for isl in type2_diag.ordered_islands:
                    ix1 = int(isl["x1"]) if isinstance(isl, dict) else int(isl[0])
                    if ix1 > internal_x1 + min_english_phrase_width(band_h):
                        isl_x1 = ix1 if isl_x1 is None else min(isl_x1, ix1)
                if isl_x1 is not None:
                    ar_cap = min(ar_cap, isl_x1 - gap)
            trimmed = cap_type2_english_right_edge(
                ink, recovered, ar_cap, gap, median_h=band_h
            )
            if semantic == "nationality" and not assert_english_crop_glyph_profile(
                ink, trimmed
            ):
                return None
            vx1, vy1, vx2, vy2 = trimmed
            if vx2 - vx1 < min_english_phrase_width(band_h):
                return None
            blockers = [en_det.ink_bbox, ar_det.ink_bbox]
            return _finalize_value(
                semantic,
                structure,
                trimmed,
                ink,
                blockers,
                en_det,
                ar_det,
                type2_diag,
                scale,
                "TYPE2_GROUP_OVERLAP_INK_RECOVERY",
                "type2_recovery",
            )

        acceptable = t2.support_mode in (
            Type2SupportMode.BOTH_AGREE,
            Type2SupportMode.COMPONENT_ONLY_STRONG,
            Type2SupportMode.COMPONENT_GAP_STRONG,
            Type2SupportMode.PROJECTION_ONLY_STRONG,
        )
        if (
            not acceptable
            or t2.split_status != BoundaryStatus.FOUND
            or t2.translation_split_x is None
        ):
            st = FieldStatus.TRANSLATION_SPLIT_CONFLICT
            if t2.support_mode == Type2SupportMode.INSUFFICIENT:
                st = FieldStatus.VALUE_BOUNDARY_UNCERTAIN
            fail_msg = type2_diag.failure_code or f"TYPE2 split unsupported ({t2.support_mode.value})."
            recovered_field = attempt_group_overlap_recovery()
            if recovered_field is not None:
                return recovered_field
            return ValueCropResult(
                semantic=semantic,
                structure_type=structure,
                field_status=st,
                value_bbox=None,
                value_bbox_canonical=None,
                english_label=en_det,
                arabic_label=ar_det,
                type2=type2_diag,
                message=fail_msg,
            )

        if type2_diag.failure_code:
            recovered_field = attempt_group_overlap_recovery()
            if recovered_field is not None:
                return recovered_field
            return ValueCropResult(
                semantic=semantic,
                structure_type=structure,
                field_status=FieldStatus.VALUE_BOUNDARY_UNCERTAIN,
                value_bbox=None,
                value_bbox_canonical=None,
                english_label=en_det,
                arabic_label=ar_det,
                type2=type2_diag,
                message=type2_diag.failure_code,
            )

        strong_modes = (
            Type2SupportMode.COMPONENT_ONLY_STRONG,
            Type2SupportMode.COMPONENT_GAP_STRONG,
            Type2SupportMode.PROJECTION_ONLY_STRONG,
        )
        if t2.support_mode in strong_modes:
            if t2.arabic_value_left_edge_confidence < 0.68:
                return ValueCropResult(
                    semantic=semantic,
                    structure_type=structure,
                    field_status=FieldStatus.VALUE_BOUNDARY_UNCERTAIN,
                    value_bbox=None,
                    value_bbox_canonical=None,
                    english_label=en_det,
                    arabic_label=ar_det,
                    type2=type2_diag,
                    message="TYPE2 left-edge confidence too low.",
                )

        split_x = int(t2.translation_split_x)
        en_phrase = t2.english_value_full_bbox
        vx1 = max(en_det.right_edge + gap, en_phrase[0])
        if en_det.next_value_component_x is not None:
            vx1 = max(vx1, en_det.next_value_component_x)
        vx2 = split_x - gap
        ar_val_x1 = t2.arabic_value_left_edge
        if ar_val_x1 > internal_x1:
            vx2 = min(vx2, ar_val_x1 - gap)
        band_h = max(8, text_y2 - text_y1)
        ar_cap = ar_val_x1 if ar_val_x1 > internal_x1 else None
        box_in = (vx1, text_y1, vx2, text_y2)
        phrase_w = max(0, en_phrase[2] - en_phrase[0])
        if semantic == "nationality" and phrase_w <= 140:
            vx2_cap = min(box_in[2], ar_cap) if ar_cap else box_in[2]
            trimmed = (box_in[0], box_in[1], vx2_cap, box_in[3])
        elif semantic == "nationality":
            trimmed = trim_type2_english_bbox(ink, box_in, ar_cap, gap, median_h=band_h)
        else:
            trimmed = cap_type2_english_right_edge(ink, box_in, ar_cap, gap, median_h=band_h)
        vx1, vy1, vx2, vy2 = trimmed
        if semantic == "nationality":
            if not assert_english_crop_glyph_profile(ink, trimmed):
                return ValueCropResult(
                    semantic=semantic,
                    structure_type=structure,
                    field_status=FieldStatus.VALUE_REGION_EMPTY_OR_INVALID,
                    value_bbox=None,
                    value_bbox_canonical=None,
                    english_label=en_det,
                    arabic_label=ar_det,
                    type2=type2_diag,
                    geometry_assertion="type2_english_profile_fail",
                    message="TYPE2_ENGLISH_INK_PROFILE_UNREADABLE",
                )
        if vx2 - vx1 < min_english_phrase_width(band_h):
            return ValueCropResult(
                semantic=semantic,
                structure_type=structure,
                field_status=FieldStatus.VALUE_BOUNDARY_UNCERTAIN,
                value_bbox=None,
                value_bbox_canonical=None,
                english_label=en_det,
                arabic_label=ar_det,
                type2=type2_diag,
                message="TYPE2_ENGLISH_VALUE_CLIPPED",
            )
        if ar_val_x1 > 0 and vx2 > ar_val_x1:
            return ValueCropResult(
                semantic=semantic,
                structure_type=structure,
                field_status=FieldStatus.TYPE2_ARABIC_BLEED,
                value_bbox=None,
                value_bbox_canonical=None,
                english_label=en_det,
                arabic_label=ar_det,
                type2=type2_diag,
                geometry_assertion="arabic_value_bleed",
                message="English value box bleeds into Arabic translation.",
            )

        bleed_islands = list(t2.arabic_islands)
        if t2.arabic_value_full_bbox[2] > t2.arabic_value_full_bbox[0]:
            bleed_islands.append(t2.arabic_value_full_bbox)
        bleed = expanded_arabic_bleed_rect(bleed_islands, pad=2)
        blockers = [en_det.ink_bbox, ar_det.ink_bbox, bleed]
        vb = (vx1, vy1, vx2, vy2) if vx2 - vx1 >= 10 else None
        return _finalize_value(
            semantic,
            structure,
            vb,
            ink,
            blockers,
            en_det,
            ar_det,
            type2_diag,
            scale,
            "",
            "type2",
        )

    if structure == "TYPE_3_ARABIC_NAME":
        ar_det = match_ar()
        if not _label_ok(ar_det, conf_min):
            return ValueCropResult(
                semantic=semantic,
                structure_type=structure,
                field_status=FieldStatus.LABEL_BOUNDARY_CONFLICT,
                value_bbox=None,
                value_bbox_canonical=None,
                arabic_label=ar_det,
                message="TYPE3 Arabic label anchor unreliable.",
            )
        vx1 = inset
        vx2 = ar_det.left_edge - gap
        vb = (vx1, text_y1, vx2, text_y2) if vx2 - vx1 >= 10 else None
        return _finalize_value(
            semantic,
            structure,
            vb,
            ink,
            [ar_det.ink_bbox],
            None,
            ar_det,
            None,
            scale,
            "",
            "type3",
        )

    if structure == "TYPE_4_ENGLISH_NAME":
        en_det = match_en()
        if not _label_ok(en_det, conf_min, True):
            return ValueCropResult(
                semantic=semantic,
                structure_type=structure,
                field_status=_en_label_field_status(en_det),
                value_bbox=None,
                value_bbox_canonical=None,
                english_label=en_det,
                message="TYPE4 English label anchor unreliable.",
            )
        vx1 = en_det.right_edge + gap
        vx2 = w - inset
        vb = (vx1, text_y1, vx2, text_y2) if vx2 - vx1 >= 10 else None
        return _finalize_value(
            semantic,
            structure,
            vb,
            ink,
            [en_det.ink_bbox],
            en_det,
            None,
            None,
            scale,
            "",
            "type4",
        )

    return ValueCropResult(
        semantic=semantic,
        structure_type=structure,
        field_status=FieldStatus.VALUE_BOUNDARY_UNCERTAIN,
        value_bbox=None,
        value_bbox_canonical=None,
        message=f"Unknown structure type: {structure}",
    )


def run_value_crop_pipeline(
    project_root: Path,
    image_bgr: np.ndarray,
    table_bbox: Tuple[int, int, int, int],
    rows: List[RowInfo],
    row_crops_dir: Path,
    output_dir: Path,
) -> ValueCropPipelineResult:
    config_path = project_root / "config" / "value_fields.json"
    with config_path.open("r", encoding="utf-8") as f:
        value_config = json.load(f)

    template_dir = project_root / "label_templates"
    require_templates(project_root, template_dir)
    matcher = LabelMatcher(template_dir)
    ink_bboxes = load_template_ink_bboxes(template_dir)

    x1, _, x2, _ = table_bbox
    row_by_sem = {r.semantic: r for r in rows}
    canonical_w = int(value_config.get("canonical_row_width_px", 514))

    results: List[ValueCropResult] = []
    for semantic in FIELD_ORDER:
        row_info = row_by_sem.get(semantic)
        fcfg = value_config["fields"].get(semantic)
        if row_info is None or fcfg is None:
            continue
        row_bgr = image_bgr[row_info.y1 : row_info.y2, x1:x2]
        missing = []
        if "en_template" in fcfg and fcfg["en_template"] not in matcher.templates:
            missing.append(fcfg["en_template"])
        if "ar_template" in fcfg and fcfg["ar_template"] not in matcher.templates:
            missing.append(fcfg["ar_template"])
        if missing:
            results.append(
                ValueCropResult(
                    semantic=semantic,
                    structure_type=fcfg["structure_type"],
                    field_status=FieldStatus.VALUE_BOUNDARY_UNCERTAIN,
                    value_bbox=None,
                    value_bbox_canonical=None,
                    message=f"Missing templates: {missing}",
                )
            )
            continue
        results.append(
            process_field(semantic, row_bgr, fcfg, matcher, value_config, canonical_w)
        )

    sample_row = image_bgr[rows[0].y1 : rows[0].y2, x1:x2]
    scale_x = sample_row.shape[1] / float(canonical_w)
    gap_px = _clamp_gap(value_config, int(canonical_w), "gap")
    inset_px = _clamp_gap(value_config, int(canonical_w), "outer")

    return ValueCropPipelineResult(
        canonical_width=canonical_w,
        scale_x=scale_x,
        tiny_gap_px=gap_px,
        tiny_outer_inset_px=inset_px,
        fields=results,
        template_dir=str(template_dir),
        template_ink_bboxes=ink_bboxes,
    )
