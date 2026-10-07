"""Explicit developer action: rebuild label templates from row crops (not inference)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from src.value_crop.build_templates import build_templates_from_real_01, ensure_templates


def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Rebuild pinned label templates")
    parser.add_argument(
        "--row-crops",
        default=None,
        help="Directory with 01..08 row crop PNGs (default: output/real_01/row_crops)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force rebuild via ensure_templates (includes EN template refresh policy).",
    )
    args = parser.parse_args(argv)

    root = _project_root()
    row_crops = (
        Path(args.row_crops).resolve()
        if args.row_crops
        else root / "output" / "real_01" / "row_crops"
    )
    template_dir = root / "label_templates"
    if not row_crops.is_dir():
        print(f"Row crops not found: {row_crops}", file=sys.stderr)
        return 2

    if args.force:
        paths = ensure_templates(root, row_crops, template_dir)
    else:
        config_path = root / "config" / "value_fields.json"
        with config_path.open("r", encoding="utf-8") as f:
            value_config = json.load(f)
        paths = build_templates_from_real_01(root, row_crops, template_dir, value_config)

    print(json.dumps({"template_dir": str(template_dir), "written": paths}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
