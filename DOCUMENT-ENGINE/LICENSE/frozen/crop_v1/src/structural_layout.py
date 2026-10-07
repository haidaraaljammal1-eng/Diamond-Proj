"""Semantic row layout packaging (no value-region crops in milestone 1)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Tuple

from src.detect_rows import RowDetectionResult, RowInfo


@dataclass
class StructuralLayout:
    table_bbox: Tuple[int, int, int, int]
    rows: List[RowInfo]
    structure_status: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "table_bbox": list(self.table_bbox),
            "structure_status": self.structure_status,
            "rows": [r.to_dict() for r in self.rows],
        }


def build_structural_layout(
    table_bbox: Tuple[int, int, int, int],
    row_result: RowDetectionResult,
) -> StructuralLayout:
    return StructuralLayout(
        table_bbox=table_bbox,
        rows=row_result.rows,
        structure_status=row_result.status.value,
    )
