from __future__ import annotations

from pathlib import Path

import cv2
import pytest

from src.run_crop_pipeline import load_config, run_pipeline

VENKAT_IMG = Path(
    r"C:\Users\Rw\.cursor\projects\c-Users-Rw-UAE-LICENSE-CROP-V2\assets"
    r"\c__Users_Rw_AppData_Roaming_Cursor_User_workspaceStorage_40cafdd502c2c29ba493ebfafd5ce785_images_image-cfce047d-2e8f-46e2-8ab6-b64e03a5a67b.png"
)
VENKAT_ROW_NAT = Path(
    r"C:\Users\Rw\UAE_LICENSE_OCR_V1\live_tests\live_test_venkat\crop_work\row_crops\04_nationality_row.png"
)


@pytest.mark.skipif(not VENKAT_IMG.is_file(), reason="venkat fixture image missing")
def test_venkat_nationality_and_place_value_ok(tmp_path):
    config = load_config()
    out = tmp_path / "venkat"
    report = run_pipeline(VENKAT_IMG, out, config)
    fields = {f["semantic"]: f for f in report["value_crops_phase2"]["value_crop"]["fields"]}
    nat = fields["nationality"]
    place = fields["place_of_issue"]
    assert nat["field_status"] == "VALUE_OK"
    assert place["field_status"] == "VALUE_OK"
    nat_bb = nat["value_bbox_canonical"]
    place_bb = place["value_bbox_canonical"]
    assert nat_bb[0] >= 140
    assert 35 <= (nat_bb[2] - nat_bb[0]) <= 90
    assert place_bb[2] - place_bb[0] >= 60
    crop = cv2.imread(str(out / "value_crops" / "04_nationality.png"))
    assert crop is not None and crop.shape[1] >= 40


@pytest.mark.skipif(not VENKAT_ROW_NAT.is_file(), reason="venkat nationality row missing")
def test_venkat_nationality_row_glyph_profile():
    from src.value_crop.canonical import normalize_row
    from src.value_crop.preprocess import (
        detect_text_band,
        prepare_ink_mask,
        suppress_table_lines,
    )
    from src.value_crop.type2_english_recover import (
        assert_english_crop_glyph_profile,
        trim_type2_english_bbox,
    )

    row = cv2.imread(str(VENKAT_ROW_NAT))
    norm, _ = normalize_row(row, 501)
    gray = cv2.cvtColor(norm, cv2.COLOR_BGR2GRAY)
    ink = prepare_ink_mask(suppress_table_lines(gray))
    y1, y2 = detect_text_band(ink)
    trimmed = trim_type2_english_bbox(ink, (103, y1, 228, y2), 234, 3, median_h=12)
    assert trimmed[2] - trimmed[0] >= 40
    assert assert_english_crop_glyph_profile(ink, trimmed)
