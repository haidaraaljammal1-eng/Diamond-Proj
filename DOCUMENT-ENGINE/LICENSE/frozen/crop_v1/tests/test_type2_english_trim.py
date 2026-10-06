from __future__ import annotations

import numpy as np

from src.value_crop.type2_english_recover import (
    assert_english_crop_glyph_profile,
    recover_english_phrase_from_ink,
    trim_type2_english_bbox,
)


def _draw_hline(mask: np.ndarray, x1: int, x2: int, y: int, t: int = 1) -> None:
    mask[y : y + t, x1:x2] = 255


def test_projection_picks_latin_band_before_tall_arabic():
    h, w = 30, 280
    ink = np.zeros((h, w), dtype=np.uint8)
    _draw_hline(ink, 30, 95, 12, 2)
    _draw_hline(ink, 40, 90, 15, 1)
    for x in range(180, 220):
        ink[6:22, x] = 255
    rec = recover_english_phrase_from_ink(ink, 20, 230, 4, 26, 12)
    assert rec is not None
    trimmed = trim_type2_english_bbox(ink, (20, 4, 120, 26), 180, 3, median_h=12)
    assert trimmed[2] <= 120
    assert trimmed[2] - trimmed[0] >= 14


def test_trim_removes_tall_arabic_tail():
    h, w = 30, 200
    ink = np.zeros((h, w), dtype=np.uint8)
    _draw_hline(ink, 10, 90, 14, 2)
    for x in range(120, 150):
        ink[5:20, x] = 255
    bbox = trim_type2_english_bbox(ink, (5, 4, 160, 26), ar_translation_x1=120, gap=3, median_h=12)
    assert bbox[2] <= 117
    assert assert_english_crop_glyph_profile(ink, bbox)
