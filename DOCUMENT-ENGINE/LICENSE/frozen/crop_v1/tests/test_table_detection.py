from __future__ import annotations

from src.detect_table import TableStatus, detect_table


def test_table_on_synthetic(synthetic_licence_bgr, config):
    result = detect_table(synthetic_licence_bgr, config)
    assert result.status == TableStatus.TABLE_OK
    assert result.x2 > result.x1
    assert result.y2 > result.y1
    assert result.confidence > 0.3
