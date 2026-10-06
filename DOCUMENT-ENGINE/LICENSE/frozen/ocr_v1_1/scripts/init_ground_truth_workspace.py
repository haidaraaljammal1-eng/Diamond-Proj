"""Initialize or merge ground-truth workspace (no OCR)."""

from __future__ import annotations

import json
import sys

from src.ground_truth.workspace import init_or_merge_workspace


def main() -> int:
    paths = init_or_merge_workspace()
    print(json.dumps(paths, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
