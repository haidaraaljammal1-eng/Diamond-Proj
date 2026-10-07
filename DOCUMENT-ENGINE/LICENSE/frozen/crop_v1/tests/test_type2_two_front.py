from __future__ import annotations

import numpy as np

from src.value_crop.type2_two_front import analyze_type2_two_front


def _draw_box(mask: np.ndarray, x1: int, y1: int, x2: int, y2: int) -> None:
    mask[y1:y2, x1:x2] = 255


def test_type2_does_not_split_mid_gap_when_english_front_is_speck():
    """Faint EN missed by mask: avoid split in empty band between speck and AR value."""
    h, w = 40, 400
    mask = np.zeros((h, w), dtype=np.uint8)
    ink = np.zeros((h, w), dtype=np.uint8)
    internal_x1, internal_x2 = 100, 360
    text_y1, text_y2 = 8, 30
    # Noise speck mistaken as English front
    _draw_box(mask, 102, 14, 106, 20)
    _draw_box(ink, 102, 14, 106, 20)
    # Real English value visible in full ink only
    _draw_box(ink, 130, 10, 195, 24)
    # Arabic translation on the right
    _draw_box(mask, 240, 10, 310, 24)
    _draw_box(ink, 240, 10, 310, 24)

    result, dbg = analyze_type2_two_front(
        mask, internal_x1, internal_x2, text_y1, text_y2, ink=ink, arabic_field_label_left=370
    )
    assert result.split_status.name == "FOUND"
    assert result.translation_split_x is not None
    assert result.translation_split_x >= 228
    assert result.english_value_full_bbox[2] - result.english_value_full_bbox[0] >= 14
    assert dbg.failure_code is None
