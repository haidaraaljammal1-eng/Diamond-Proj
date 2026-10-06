"""Field value cropping (label-anchored, no OCR)."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np

from src.detect_rows import RowInfo
from src.value_crop.diagnostics import (
    build_label_templates_debug,
    build_template_ink_bbox_debug,
    draw_fixed_label_anchor_debug,
    draw_translated_value_split_debug,
    draw_type2_boundary_zoom,
    draw_type2_two_front_segmentation,
    draw_value_boxes_on_rows,
)
from src.value_crop.english_purity_debug import (
    build_english_label_purity_debug,
    build_english_templates_before_after,
    draw_english_label_boundary_zoom,
)
from src.value_crop.export import build_value_contact_sheet, export_value_crops
from src.value_crop.models import FieldStatus, ValueCropPipelineResult
from src.value_crop.pipeline import run_value_crop_pipeline


def crop_field_values(
    project_root: Path,
    image_bgr: np.ndarray,
    table_bbox: Tuple[int, int, int, int],
    rows: List[RowInfo],
    row_crops_dir: Path,
    output_dir: Path,
) -> Dict[str, Any]:
    """Run dynamic value crop pipeline and write debug/value artifacts."""
    vc_result = run_value_crop_pipeline(
        project_root,
        image_bgr,
        table_bbox,
        rows,
        row_crops_dir,
        output_dir,
    )

    template_dir = Path(vc_result.template_dir)
    template_debug_dir = output_dir / "template_debug"
    template_debug_dir.mkdir(parents=True, exist_ok=True)
    label_dbg = build_label_templates_debug(template_dir)
    import cv2

    cv2.imwrite(str(template_debug_dir / "label_templates_debug.png"), label_dbg)
    ink_dbg = build_template_ink_bbox_debug(template_dir)
    cv2.imwrite(str(template_debug_dir / "label_templates_ink_bbox_debug.png"), ink_dbg)

    anchor_dbg = draw_fixed_label_anchor_debug(
        image_bgr,
        table_bbox,
        rows,
        vc_result.fields,
        vc_result.canonical_width,
    )
    cv2.imwrite(str(output_dir / "07_fixed_label_anchor_debug.png"), anchor_dbg)

    purity_dbg = build_english_label_purity_debug(
        template_dir,
        image_bgr,
        table_bbox,
        rows,
        vc_result.fields,
        vc_result.canonical_width,
    )
    cv2.imwrite(str(template_debug_dir / "english_label_purity_debug.png"), purity_dbg)

    before_after = build_english_templates_before_after(template_dir)
    if before_after is not None:
        cv2.imwrite(str(template_debug_dir / "english_templates_before_after.png"), before_after)

    zoom_en = draw_english_label_boundary_zoom(
        image_bgr,
        table_bbox,
        rows,
        vc_result.fields,
        vc_result.canonical_width,
        vc_result.tiny_gap_px,
    )
    cv2.imwrite(str(output_dir / "07b_english_label_boundary_zoom.png"), zoom_en)

    split_dbg = draw_translated_value_split_debug(
        image_bgr,
        table_bbox,
        rows,
        vc_result.fields,
        vc_result.canonical_width,
    )
    cv2.imwrite(str(output_dir / "08_translated_value_split_debug.png"), split_dbg)

    zoom_dbg = draw_type2_boundary_zoom(
        image_bgr,
        table_bbox,
        rows,
        vc_result.fields,
        vc_result.canonical_width,
    )
    cv2.imwrite(str(output_dir / "08b_type2_boundary_zoom.png"), zoom_dbg)

    type2_front_dbg = draw_type2_two_front_segmentation(
        image_bgr,
        table_bbox,
        rows,
        vc_result.fields,
        vc_result.canonical_width,
    )
    cv2.imwrite(str(output_dir / "16_type2_two_front_segmentation.png"), type2_front_dbg)

    boxes_dbg = draw_value_boxes_on_rows(image_bgr, table_bbox, rows, vc_result.fields)
    cv2.imwrite(str(output_dir / "09_value_boxes_on_rows.png"), boxes_dbg)

    value_crop_dir = output_dir / "value_crops"
    crop_paths = export_value_crops(
        image_bgr, table_bbox, rows, vc_result.fields, value_crop_dir
    )
    contact = build_value_contact_sheet(image_bgr, table_bbox, rows, vc_result.fields)
    cv2.imwrite(str(output_dir / "10_value_crop_debug.png"), contact)

    ok_count = sum(1 for f in vc_result.fields if f.field_status == FieldStatus.VALUE_OK)
    type2_ok = all(
        f.field_status == FieldStatus.VALUE_OK
        for f in vc_result.fields
        if f.semantic in ("nationality", "place_of_issue")
    )
    en_bleed = any(
        f.english_label is not None
        and f.english_label.en_bleed_check == "EN_LABEL_VALUE_BLEED"
        for f in vc_result.fields
    )
    if en_bleed:
        recommendation = "ENGLISH_LABEL_BOUNDARY_STILL_UNSAFE"
    elif ok_count == 8 and type2_ok:
        recommendation = "READY_FOR_MULTI_LICENCE_DYNAMIC_CROP_TEST"
    elif ok_count < 8:
        recommendation = "NEEDS_ANOTHER_REAL01_BOUNDARY_FIX"
    else:
        type2_modes = [
            f.type2.support_mode
            for f in vc_result.fields
            if f.semantic in ("nationality", "place_of_issue") and f.type2
        ]
        unsafe = any(
            m in ("INSUFFICIENT", "CONFLICT") for m in type2_modes
        ) or any(
            f.type2 is not None
            and f.type2.arabic_phrase_status == "AR_VALUE_GROUP_PARTIAL"
            and f.type2.arabic_value_left_edge_confidence < 0.65
            for f in vc_result.fields
            if f.semantic in ("nationality", "place_of_issue")
        )
        recommendation = (
            "TYPE2_BOUNDARY_STILL_UNSAFE" if unsafe else "READY_FOR_MULTI_LICENCE_DYNAMIC_CROP_TEST"
        )

    return {
        "value_crop": vc_result.to_dict(),
        "value_crop_paths": crop_paths,
        "recommendation": recommendation,
        "artifacts": {
            "label_templates_debug": str(template_debug_dir / "label_templates_debug.png"),
            "label_templates_ink_bbox_debug": str(
                template_debug_dir / "label_templates_ink_bbox_debug.png"
            ),
            "07_fixed_label_anchor_debug": str(output_dir / "07_fixed_label_anchor_debug.png"),
            "07b_english_label_boundary_zoom": str(
                output_dir / "07b_english_label_boundary_zoom.png"
            ),
            "english_label_purity_debug": str(
                template_debug_dir / "english_label_purity_debug.png"
            ),
            "08_translated_value_split_debug": str(
                output_dir / "08_translated_value_split_debug.png"
            ),
            "08b_type2_boundary_zoom": str(output_dir / "08b_type2_boundary_zoom.png"),
            "16_type2_two_front_segmentation": str(
                output_dir / "16_type2_two_front_segmentation.png"
            ),
            "09_value_boxes_on_rows": str(output_dir / "09_value_boxes_on_rows.png"),
            "10_value_crop_debug": str(output_dir / "10_value_crop_debug.png"),
            "value_crops_dir": str(value_crop_dir),
        },
    }
