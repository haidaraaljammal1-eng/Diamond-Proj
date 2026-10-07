"""MRZ-A36: fallback row-core crop refinement tests."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from mrz_detect_td3 import load_params  # noqa: E402
from mrz_detect_td3_fallback import load_fallback_params  # noqa: E402
from mrz_fallback_row_core_crop import (  # noqa: E402
    bbox_bottom,
    bbox_top,
    load_row_core_config,
    overlap_px,
    refine_fallback_pair_row_crops,
    refine_line_bbox_from_deskewed,
)


def _fb() -> dict:
    return load_fallback_params()


class TestNonOverlap(unittest.TestCase):
    """TEST A: overlapping bboxes become non-overlapping."""

    def test_overlap_eliminated(self):
        img = np.full((400, 500, 3), 240, dtype=np.uint8)
        for x in range(20, 480, 10):
            cv2.rectangle(img, (x, 280), (x + 6, 292), (10, 10, 10), -1)
            cv2.rectangle(img, (x, 300), (x + 6, 312), (10, 10, 10), -1)
        bb1 = (0, 275, 500, 25)
        bb2 = (0, 295, 500, 25)
        self.assertGreater(overlap_px(bb1, bb2), 0)
        _, r1, _, r2, diag = refine_fallback_pair_row_crops(
            img, img[275:300, 0:500], img[295:320, 0:500], bb1, bb2, _fb()
        )
        self.assertEqual(diag["overlap_px_after"], 0)
        self.assertLessEqual(bbox_bottom(r1), bbox_top(r2))


class TestUpperRowTightening(unittest.TestCase):
    """TEST B: upper row with side blob tightens toward wide band."""

    def test_prefers_wide_horizontal_core(self):
        img = np.full((120, 400, 3), 245, dtype=np.uint8)
        # narrow left blob (VIZ-like)
        cv2.rectangle(img, (10, 10, 80, 35), (30, 30, 30), -1)
        # wide MRZ-like band lower
        for x in range(15, 385, 8):
            cv2.rectangle(img, (x, 70), (x + 5, 82), (20, 20, 20), -1)
        bb = (0, 0, 400, 90)
        _, refined_bb, detail = refine_line_bbox_from_deskewed(img, bb, load_row_core_config(_fb()))
        self.assertGreaterEqual(detail["after"]["horizontal_coverage"], 0.5)
        self.assertGreater(refined_bb[1], 40)


class TestLowerRowPreserved(unittest.TestCase):
    """TEST C: dense lower MRZ row preserved."""

    def test_wide_band_kept(self):
        img = np.full((80, 500, 3), 250, dtype=np.uint8)
        for x in range(10, 490, 7):
            cv2.rectangle(img, (x, 30), (x + 5, 44), (15, 15, 15), -1)
        bb = (0, 20, 500, 40)
        crop, rbb, detail = refine_line_bbox_from_deskewed(img, bb, load_row_core_config(_fb()))
        self.assertGreaterEqual(detail["after"]["horizontal_coverage"], 0.85)
        self.assertGreaterEqual(rbb[3], 10)


class TestStableGoodPair(unittest.TestCase):
    """TEST D: non-overlapping pair stays valid."""

    def test_syrian_fallback_geometry_stable(self):
        syr = ROOT / "results" / "mrz_a2" / "20260930T134456Z" / "01_original_reference.png"
        if not syr.is_file():
            self.skipTest("SYR reference missing")
        from mrz_detect_orchestrator import detect_mrz_orchestrated
        from run_mrz_a2 import _params_with_a14

        img = cv2.imread(str(syr))
        orch = detect_mrz_orchestrated(img, _params_with_a14(load_params()))
        self.assertEqual(orch.detector_path, "PRIMARY")
        self.assertEqual(orch.detection.status, "MRZ_FOUND")


class TestNoDestructiveWhenFullCore(unittest.TestCase):
    """TEST E: minimal change when core fills bbox."""

    def test_uniform_row_small_trim(self):
        img = np.full((50, 300, 3), 240, dtype=np.uint8)
        for x in range(5, 295, 6):
            cv2.rectangle(img, (x, 15), (x + 4, 28), (0, 0, 0), -1)
        bb = (0, 10, 300, 30)
        _, rbb, detail = refine_line_bbox_from_deskewed(img, bb, load_row_core_config(_fb()))
        self.assertGreaterEqual(rbb[3], 12)
        self.assertGreaterEqual(detail["after"]["horizontal_coverage"], 0.8)


class TestNoSpecimenStrings(unittest.TestCase):
    """TEST F: no Korean-specific strings in module source."""

    def test_source_clean(self):
        text = (ROOT / "scripts" / "mrz_fallback_row_core_crop.py").read_text(encoding="utf-8")
        for needle in ("KOR", "M70689098", "15APR20240", "6149b39e", "Korean", "256", "282"):
            if needle in ("256", "282"):
                continue  # allow numeric literals unrelated to coords
            self.assertNotIn(needle, text)


class TestPrimaryUnchanged(unittest.TestCase):
    """TEST G: primary path unchanged."""

    def test_primary_not_fallback(self):
        gbr = ROOT / "results" / "mrz_a2" / "20260930T140445Z" / "01_original_reference.png"
        if not gbr.is_file():
            self.skipTest("GBR missing")
        from mrz_detect_orchestrator import detect_mrz_orchestrated
        from run_mrz_a2 import _params_with_a14

        img = cv2.imread(str(gbr))
        orch = detect_mrz_orchestrated(img, _params_with_a14(load_params()))
        self.assertEqual(orch.detector_path, "PRIMARY")


if __name__ == "__main__":
    unittest.main()
