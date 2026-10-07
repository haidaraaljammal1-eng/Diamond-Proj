"""Post-crop geometry gate for two-field UAE licence OCR (V1.2)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_CONFIG_PATH = (
    Path(__file__).resolve().parents[3]
    / "frozen"
    / "ocr_v1_2"
    / "config"
    / "two_field_label_zones.json"
)


def _load_gate_cfg() -> dict[str, Any]:
    data = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    return data.get("geometry_gate", {})


def validate_crop_geometry(report: dict[str, Any]) -> None:
    """Raise ValueError with machine code as first token when geometry is unusable."""
    cfg = _load_gate_cfg()
    validation = report.get("validation") or {}
    if validation.get("status") != "INPUT_VALID":
        raise ValueError("GEOMETRY_REJECTED input validation failed")
    hq = validation.get("handoff_quality")
    required_hq = cfg.get("required_handoff_quality", "INPUT_OK_FOR_CROP_AND_OCR")
    if hq != required_hq:
        raise ValueError(f"GEOMETRY_REJECTED handoff_quality={hq}")

    table = report.get("table") or {}
    if table.get("status") != cfg.get("required_table_status", "TABLE_OK"):
        raise ValueError(f"GEOMETRY_REJECTED table_status={table.get('status')}")

    img_w = float(validation.get("width") or 0)
    img_h = float(validation.get("height") or 0)
    bbox = table.get("table_bbox")
    if not bbox or len(bbox) != 4 or img_w <= 0 or img_h <= 0:
        raise ValueError("GEOMETRY_REJECTED missing table_bbox")

    x1, y1, x2, y2 = [float(v) for v in bbox]
    tw = max(1.0, x2 - x1)
    th = max(1.0, y2 - y1)
    wr = tw / img_w
    hr = th / img_h

    if wr < float(cfg.get("min_table_width_over_image", 0.42)):
        raise ValueError("GEOMETRY_REJECTED table too narrow")
    if wr > float(cfg.get("max_table_width_over_image", 0.92)):
        raise ValueError("GEOMETRY_REJECTED table too wide")
    if hr < float(cfg.get("min_table_height_over_image", 0.38)):
        raise ValueError("GEOMETRY_REJECTED table too short")
    if hr > float(cfg.get("max_table_height_over_image", 0.88)):
        raise ValueError("GEOMETRY_REJECTED table too tall")

    rows = (report.get("structural_layout") or {}).get("rows") or []
    semantics = {r.get("semantic") for r in rows}
    for required in cfg.get("required_row_semantics", []):
        if required not in semantics:
            raise ValueError(f"GEOMETRY_REJECTED missing row {required}")
