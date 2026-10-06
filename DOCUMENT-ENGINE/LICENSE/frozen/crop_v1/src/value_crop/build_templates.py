"""Bootstrap fixed label templates from approved real_01 row crops."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, Tuple

import cv2
import numpy as np

from src.row_crops import ROW_CROP_FILES
from src.value_crop.canonical import normalize_row
from src.value_crop.template_ink import compute_template_ink_bbox

# Rebuild these EN templates when bootstrap ROIs change (label-only calibration).
FORCE_REBUILD_EN_TEMPLATES = frozenset({"nationality_en", "place_of_issue_en"})


def _roi_to_pixels(
    frac: Tuple[float, float, float, float],
    w: int,
    h: int,
) -> Tuple[int, int, int, int]:
    x1 = int(frac[0] * w)
    y1 = int(frac[1] * h)
    x2 = int(frac[2] * w)
    y2 = int(frac[3] * h)
    return x1, y1, max(x1 + 4, x2), max(y1 + 4, y2)


def build_templates_from_real_01(
    project_root: Path,
    row_crops_dir: Path,
    template_dir: Path,
    value_config: Dict,
) -> Dict[str, str]:
    template_dir.mkdir(parents=True, exist_ok=True)
    canonical_w = int(value_config.get("canonical_row_width_px", 514))
    bootstrap = value_config.get("template_bootstrap_rois", {})
    fields = value_config.get("fields", {})

    semantic_by_file = {sem: fname for fname, sem in ROW_CROP_FILES}
    paths: Dict[str, str] = {}

    for semantic, fcfg in fields.items():
        fname = semantic_by_file.get(semantic)
        if not fname:
            continue
        row_path = row_crops_dir / fname
        if not row_path.is_file():
            continue
        row = cv2.imread(str(row_path))
        if row is None:
            continue
        norm, _ = normalize_row(row, canonical_w)
        nh, nw = norm.shape[:2]

        for key in ("en_template", "ar_template"):
            tmpl_name = fcfg.get(key)
            if not tmpl_name or tmpl_name not in bootstrap:
                continue
            x1, y1, x2, y2 = _roi_to_pixels(tuple(bootstrap[tmpl_name]), nw, nh)
            patch = norm[y1:y2, x1:x2]
            if patch.size == 0:
                continue
            if key == "en_template":
                gray_patch = (
                    cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY)
                    if patch.ndim == 3
                    else patch
                )
                ix1, iy1, ix2, iy2 = compute_template_ink_bbox(gray_patch)
                pad = 1
                px1 = max(0, ix1 - pad)
                py1 = max(0, iy1 - pad)
                px2 = min(gray_patch.shape[1], ix2 + pad)
                py2 = min(gray_patch.shape[0], iy2 + pad)
                patch = patch[py1:py2, px1:px2]
            out = template_dir / f"{tmpl_name}.png"
            cv2.imwrite(str(out), patch)
            paths[tmpl_name] = str(out)

    return paths


def ensure_templates(
    project_root: Path,
    row_crops_dir: Path,
    template_dir: Path,
) -> Dict[str, str]:
    config_path = project_root / "config" / "value_fields.json"
    with config_path.open("r", encoding="utf-8") as f:
        value_config = json.load(f)

    required = set()
    for fcfg in value_config.get("fields", {}).values():
        if "en_template" in fcfg:
            required.add(fcfg["en_template"])
        if "ar_template" in fcfg:
            required.add(fcfg["ar_template"])

    existing = {p.stem for p in template_dir.glob("*.png")}
    missing = not required.issubset(existing)
    archive = template_dir / "_en_rebuild_archive"
    archive.mkdir(exist_ok=True)
    for name in FORCE_REBUILD_EN_TEMPLATES:
        path = template_dir / f"{name}.png"
        if path.is_file():
            import shutil

            shutil.copy2(path, archive / f"{name}_before.png")
            path.unlink()
        missing = True

    if missing:
        return build_templates_from_real_01(
            project_root, row_crops_dir, template_dir, value_config
        )

    return {p.stem: str(p) for p in template_dir.glob("*.png")}


def require_templates(project_root: Path, template_dir: Path) -> Dict[str, str]:
    """Load-only template check for inference (no rebuild)."""
    config_path = project_root / "config" / "value_fields.json"
    with config_path.open("r", encoding="utf-8") as f:
        value_config = json.load(f)

    required = set()
    for fcfg in value_config.get("fields", {}).values():
        if "en_template" in fcfg:
            required.add(fcfg["en_template"])
        if "ar_template" in fcfg:
            required.add(fcfg["ar_template"])

    existing = {p.stem for p in template_dir.glob("*.png")}
    missing = sorted(required - existing)
    if missing:
        raise FileNotFoundError(
            "Missing label templates for inference: "
            + ", ".join(missing)
            + ". Run: python -m src.build_label_templates"
        )

    return {p.stem: str(p) for p in template_dir.glob("*.png")}
