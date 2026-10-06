from __future__ import annotations

from src.detect_rows import (
    RowStructureStatus,
    _rebalance_thin_tail_separators,
    _repair_row_separators,
    detect_rows,
)
from src.detect_table import TableStatus, detect_table


def test_eight_rows_on_synthetic(synthetic_licence_bgr, config):
    table = detect_table(synthetic_licence_bgr, config)
    assert table.status == TableStatus.TABLE_OK
    rows = detect_rows(
        synthetic_licence_bgr,
        table.bbox(),
        config,
        table_line_ys=table.horizontal_line_ys,
    )
    assert rows.status in (
        RowStructureStatus.DIRECT_STRUCTURE,
        RowStructureStatus.STRUCTURE_RECOVERED,
    )
    assert len(rows.rows) == 8
    assert rows.rows[0].semantic == "license_number"
    assert rows.rows[-1].semantic == "place_of_issue"


def test_repair_thin_tail_rows_from_text_band_fallback():
    """live_test_007: spurious mid-boundary squeezed expiry/place rows below min height."""
    sep = [143, 175, 214, 252, 301, 334, 365, 381, 399]
    fixed = _repair_row_separators(sep, 8, 18, 180)
    assert fixed is not None
    heights = [fixed[i + 1] - fixed[i] for i in range(8)]
    assert all(18 <= h <= 180 for h in heights)
    assert fixed[0] == 143 and fixed[-1] == 399


def test_rebalance_thin_tail_for_value_crop_rows():
    sep = [143, 175, 214, 252, 301, 334, 363, 381, 399]
    fixed = _repair_row_separators(sep, 8, 18, 180)
    assert fixed is not None
    out = _rebalance_thin_tail_separators(fixed, 8, 22, 18)
    heights = [out[i + 1] - out[i] for i in range(8)]
    assert all(h >= 22 for h in heights[-3:])
    assert all(h >= 18 for h in heights)
    assert out[0] == 143 and out[-1] == 399
    # Max-borrow from DOB row (not k=4 collapse that pulled sep[5] to ~326).
    assert out[5] <= 334
    assert heights[4] >= 22
    assert heights[5] >= 24
