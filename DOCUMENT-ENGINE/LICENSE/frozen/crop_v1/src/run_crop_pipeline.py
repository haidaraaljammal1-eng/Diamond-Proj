"""Geometry-only crop pipeline — milestone 1 (no OCR, no value crops)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, Optional

import cv2
import numpy as np

from src.deskew import deskew_if_needed
from src.detect_rows import RowStructureStatus
from src.detect_table import TableStatus, detect_table
from src.detect_rows import detect_rows
from src.diagnostics import (
    draw_row_detection,
    draw_structural_layout,
    draw_table_debug_bundle,
    draw_table_detection,
    draw_table_x_boundary_debug,
)
from src.row_crops import build_row_crop_contact_sheet, export_row_crops
from src.image_validation import InputStatus, decode_image, validate_image
from src.crop_fields import crop_field_values
from src.output_hygiene import clean_job_output
from src.ocr_handoff import build_ocr_handoff, write_ocr_handoff
from src.run_metadata import RunMetadata, begin_run, finish_run, write_run_metadata
from src.template_manifest import verify_template_manifest
from src.structural_layout import build_structural_layout
from src.table_geometry_debug import (
    draw_sequence_score_comparison,
    draw_table_bottom_role_debug,
    draw_x2_outer_consensus,
    draw_y_candidate_quality,
)


def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def load_config(config_path: Optional[Path] = None) -> Dict[str, Any]:
    path = config_path or (_project_root() / "config" / "crop_layout.json")
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _finalize_job(
    output_dir: Path,
    report: Dict[str, Any],
    meta: RunMetadata,
    pipeline_status: str,
) -> None:
    finish_run(meta, pipeline_status)
    report["run_metadata"] = meta.to_dict()
    write_run_metadata(output_dir, meta)
    handoff = build_ocr_handoff(
        output_dir,
        report,
        float(report.get("validation", {}).get("grayscale_stddev") or 0.0),
    )
    write_ocr_handoff(output_dir, handoff)
    report["ocr_handoff"] = {
        "path": str(output_dir / "ocr_handoff.json"),
        "ocr_contract": (
            "OCR must read ocr_handoff.json and pipeline_report.json; "
            "use is_field_ocr_eligible(field) — never trust value_crops/*.png alone."
        ),
        "is_field_ocr_eligible": "src.ocr_handoff.is_field_ocr_eligible",
    }
    _write_report(output_dir, report)


def run_pipeline(
    input_path: Path,
    output_dir: Path,
    config: Dict[str, Any],
    geometry_only: bool = False,
) -> Dict[str, Any]:
    clean_job_output(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    meta = begin_run(input_path)
    report: Dict[str, Any] = {
        "input_path": str(input_path),
        "output_dir": str(output_dir),
        "stopped_reason": None,
        "recommendation": None,
        "run_metadata": meta.to_dict(),
    }

    image, _ = decode_image(str(input_path))
    validation = validate_image(image, config)
    report["validation"] = validation.to_dict()

    if validation.status != InputStatus.INPUT_VALID:
        report["stopped_reason"] = validation.status.value
        report["recommendation"] = "NEEDS_GEOMETRY_FIX"
        _finalize_job(output_dir, report, meta, validation.status.value)
        return report

    assert image is not None
    cv2.imwrite(str(output_dir / "01_original.png"), image)

    deskew = deskew_if_needed(image, config)
    normalized = deskew.normalized_bgr
    cv2.imwrite(str(output_dir / "02_normalized.png"), normalized)
    if deskew.applied and deskew.debug_bgr is not None:
        cv2.imwrite(str(output_dir / "02a_deskew_debug.png"), deskew.debug_bgr)
    report["deskew"] = deskew.to_dict()

    table = detect_table(normalized, config)
    report["table"] = table.to_dict()

    if table.status != TableStatus.TABLE_OK:
        report["stopped_reason"] = table.status.value
        report["recommendation"] = "NEEDS_GEOMETRY_FIX"
        if table.debug is not None:
            for name, img in draw_table_debug_bundle(normalized, table.debug).items():
                cv2.imwrite(str(output_dir / f"{name}.png"), img)
        _finalize_job(output_dir, report, meta, table.status.value)
        return report

    if table.debug is not None:
        for name, img in draw_table_debug_bundle(normalized, table.debug).items():
            cv2.imwrite(str(output_dir / f"{name}.png"), img)

    if table.debug is not None and table.debug.x_refinement is not None:
        x_dbg = draw_table_x_boundary_debug(
            normalized,
            table.y1,
            table.y2,
            table.debug.x_refinement,
        )
        cv2.imwrite(str(output_dir / "03e_table_x_boundary_debug.png"), x_dbg)

    table_debug = draw_table_detection(normalized, table.bbox())
    cv2.imwrite(str(output_dir / "03_table_detection_debug.png"), table_debug)

    if (
        table.debug is not None
        and table.debug.text_band_fallback is not None
        and table.structure_mode == "TEXT_BAND_ROW_FALLBACK"
    ):
        from src.text_band_debug import write_text_band_debug_bundle
        from src.text_band_fallback import TextBandFallbackResult

        fb_dict = table.debug.text_band_fallback
        fb = TextBandFallbackResult(
            ok=bool(fb_dict.get("ok")),
            boundaries=list(fb_dict.get("boundaries", [])),
            structure_score=float(fb_dict.get("structure_score", 0)),
            row_height_cv=float(fb_dict.get("row_height_cv", 0)),
            bands=[],
            raw_candidate_count=int(fb_dict.get("raw_candidate_count", 0)),
            median_pitch=float(fb_dict.get("median_pitch", 0)),
            pitch_cv=float(fb_dict.get("pitch_cv", 0)),
            boundary_sources=list(fb_dict.get("boundary_sources", [])),
            snapped_to_physical=list(fb_dict.get("snapped_to_physical", [])),
        )
        sx1, sy1, sx2, sy2 = table.debug.search_region
        gray_roi = cv2.cvtColor(
            normalized[sy1:sy2, sx1:sx2], cv2.COLOR_BGR2GRAY
        )
        from src.text_band_fallback import _build_text_mask_roi

        fb.text_mask = _build_text_mask_roi(gray_roi)
        x_lo = int(fb.text_mask.shape[1] * 0.06)
        fb.projection = np.sum(fb.text_mask[:, x_lo:] > 0, axis=1).astype(np.float32)
        write_text_band_debug_bundle(
            normalized,
            tuple(table.debug.search_region),
            fb,
            table.bbox(),
            table.structure_mode,
            output_dir,
        )

    if table.debug is not None:
        cv2.imwrite(
            str(output_dir / "11_y_candidate_quality.png"),
            draw_y_candidate_quality(
                normalized, table.debug, table.debug.candidate_quality
            ),
        )
        cv2.imwrite(
            str(output_dir / "12_sequence_score_comparison.png"),
            draw_sequence_score_comparison(
                normalized, table.debug, table.debug.sequence_comparison
            ),
        )
        cv2.imwrite(
            str(output_dir / "13_table_bottom_role_debug.png"),
            draw_table_bottom_role_debug(
                normalized, table.debug, table.debug.bottom_role_meta
            ),
        )
        if table.debug.x_refinement is not None:
            cv2.imwrite(
                str(output_dir / "14_x2_outer_consensus.png"),
                draw_x2_outer_consensus(
                    normalized, table.y1, table.y2, table.debug.x_refinement
                ),
            )

    rows = detect_rows(
        normalized,
        table.bbox(),
        config,
        table_line_ys=table.horizontal_line_ys,
        table_structure_mode=table.structure_mode,
        table_structure_score=table.structure_score,
    )
    report["rows"] = rows.to_dict()

    if rows.status == RowStructureStatus.ROW_STRUCTURE_FAILED:
        report["stopped_reason"] = rows.status.value
        report["recommendation"] = "NEEDS_GEOMETRY_FIX"
        _finalize_job(output_dir, report, meta, rows.status.value)
        return report

    row_debug = draw_row_detection(normalized, table.bbox(), rows.separator_ys, rows.rows)
    cv2.imwrite(str(output_dir / "04_row_detection_debug.png"), row_debug)

    layout = build_structural_layout(table.bbox(), rows)
    report["structural_layout"] = layout.to_dict()

    struct_debug = draw_structural_layout(normalized, table.bbox(), rows.rows)
    cv2.imwrite(str(output_dir / "05_structural_debug.png"), struct_debug)

    row_crop_dir = output_dir / "row_crops"
    row_crop_paths = export_row_crops(normalized, table.bbox(), rows.rows, row_crop_dir)
    report["row_crops"] = row_crop_paths

    contact = build_row_crop_contact_sheet(normalized, table.bbox(), rows.rows)
    cv2.imwrite(str(output_dir / "06_row_crop_debug.png"), contact)

    if table.debug is not None and table.debug.x_refinement is not None:
        report["table_x_refinement"] = table.debug.x_refinement

    report["geometry_only"] = geometry_only
    if geometry_only:
        report["recommendation"] = report.get("recommendation") or "GEOMETRY_ONLY_COMPLETE"
        _finalize_job(output_dir, report, meta, "GEOMETRY_ONLY_COMPLETE")
        return report

    root = _project_root()
    template_dir = root / "label_templates"
    manifest_path = root / "release" / "DYNAMIC_CROP_V1" / "template_manifest.json"
    tmpl_ok, tmpl_msg = verify_template_manifest(template_dir, manifest_path, strict=True)
    report["template_manifest_verification"] = tmpl_msg
    if not tmpl_ok:
        report["stopped_reason"] = "TEMPLATE_MANIFEST_MISMATCH"
        report["recommendation"] = "REBUILD_OR_RESTORE_PINNED_TEMPLATES"
        _finalize_job(output_dir, report, meta, "TEMPLATE_MANIFEST_MISMATCH")
        return report

    value_report = crop_field_values(
        _project_root(),
        normalized,
        table.bbox(),
        rows.rows,
        row_crop_dir,
        output_dir,
    )
    report["value_crops_phase2"] = value_report

    report["stopped_reason"] = None
    report["recommendation"] = value_report.get(
        "recommendation", "NEEDS_DYNAMIC_VALUE_BOUNDARY_FIX"
    )
    report["artifacts"] = {
        "01_original": str(output_dir / "01_original.png"),
        "02_normalized": str(output_dir / "02_normalized.png"),
        "03a_search_region_debug": str(output_dir / "03a_search_region_debug.png"),
        "03b_horizontal_candidates": str(output_dir / "03b_horizontal_candidates.png"),
        "03c_candidate_clusters": str(output_dir / "03c_candidate_clusters.png"),
        "03d_sequence_selection": str(output_dir / "03d_sequence_selection.png"),
        "03_table_detection_debug": str(output_dir / "03_table_detection_debug.png"),
        "04_row_detection_debug": str(output_dir / "04_row_detection_debug.png"),
        "05_structural_debug": str(output_dir / "05_structural_debug.png"),
        "03e_table_x_boundary_debug": str(output_dir / "03e_table_x_boundary_debug.png"),
        "06_row_crop_debug": str(output_dir / "06_row_crop_debug.png"),
        "row_crops_dir": str(row_crop_dir),
        "07_fixed_label_anchor_debug": str(output_dir / "07_fixed_label_anchor_debug.png"),
        "08_translated_value_split_debug": str(
            output_dir / "08_translated_value_split_debug.png"
        ),
        "09_value_boxes_on_rows": str(output_dir / "09_value_boxes_on_rows.png"),
        "10_value_crop_debug": str(output_dir / "10_value_crop_debug.png"),
        "value_crops_dir": str(output_dir / "value_crops"),
    }
    if deskew.applied:
        report["artifacts"]["02a_deskew_debug"] = str(output_dir / "02a_deskew_debug.png")

    _finalize_job(output_dir, report, meta, "PIPELINE_COMPLETE")
    return report


def _json_default(obj: Any) -> Any:
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def _write_report(output_dir: Path, report: Dict[str, Any]) -> None:
    path = output_dir / "pipeline_report.json"
    with path.open("w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, default=_json_default)


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="UAE licence geometry pipeline (milestone 1)")
    parser.add_argument(
        "--input",
        "-i",
        required=False,
        help="Path to user-cropped licence image",
    )
    parser.add_argument(
        "--output",
        "-o",
        default=None,
        help="Output directory (default: output/<input_stem>)",
    )
    parser.add_argument(
        "--config",
        default=None,
        help="Path to crop_layout.json",
    )
    parser.add_argument(
        "--geometry-only",
        action="store_true",
        help="Stop after table/row geometry (no value cropping).",
    )
    parser.add_argument(
        "--build-templates",
        action="store_true",
        help="Rebuild label templates from row crops (developer action; does not run crop).",
    )
    args = parser.parse_args(argv)

    if args.build_templates:
        from src.build_label_templates import main as build_templates_main

        extra = []
        if args.output:
            extra.append(f"--row-crops={args.output}")
        return build_templates_main(["--force"] + extra)

    if not args.input:
        print("--input is required unless using --build-templates", file=sys.stderr)
        return 2

    input_path = Path(args.input).resolve()
    if not input_path.is_file():
        print(f"Input not found: {input_path}", file=sys.stderr)
        return 2

    config_path = Path(args.config).resolve() if args.config else None
    config = load_config(config_path)

    if args.output:
        output_dir = Path(args.output).resolve()
    else:
        output_dir = _project_root() / "output" / input_path.stem

    report = run_pipeline(input_path, output_dir, config, geometry_only=args.geometry_only)
    print(json.dumps(report, indent=2, default=_json_default))
    if report.get("stopped_reason"):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
