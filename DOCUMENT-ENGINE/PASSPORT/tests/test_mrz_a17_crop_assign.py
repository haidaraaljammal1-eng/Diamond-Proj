"""MRZ-A17 fallback crop assignment tests."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from mrz_detect_td3 import PairCandidate, RowCandidate  # noqa: E402
from mrz_fallback_crop_assign import resolve_td3_line_rows_for_crops  # noqa: E402
from mrz_detect_td3_fallback import detect_td3_mrz_fallback, load_fallback_params  # noqa: E402
from mrz_detect_td3 import load_params  # noqa: E402

GERMAN = ROOT / "results" / "mrz_a2" / "20260930T214256Z" / "01_original_reference.png"


def _row(rid, x, y, w, h, ink=0.15, rejected=False, reason=""):
    return RowCandidate(
        row_id=rid,
        x=x,
        y=y,
        w=w,
        h=h,
        angle_deg=0.0,
        ink_density=ink,
        component_count=40,
        horizontal_coverage=0.6,
        rejected=rejected,
        reject_reason=reason,
        metrics={"regularity": 0.6, "passes_structure": True},
    )


class TestLineOrdering(unittest.TestCase):
    def test_upper_row_becomes_line1(self):
        fb = load_fallback_params()
        a = _row(1, 0, 100, 600, 12)
        b = _row(2, 0, 120, 600, 12)
        pair = PairCandidate(0, 1, 2, {}, 0.9, a, b)
        l1, l2 = resolve_td3_line_rows_for_crops(pair, [a, b], fb)
        self.assertEqual(l1.row_id, 1)
        self.assertEqual(l2.row_id, 2)

    def test_recovers_orphan_rejected_upper_band(self):
        fb = load_fallback_params()
        r15 = _row(15, 0, 363, 640, 9, rejected=True, reason="line_artifact_orphan_band_above_core_pair")
        r17 = _row(17, 0, 395, 640, 11, ink=0.18)
        r19 = _row(19, 0, 415, 640, 11, ink=0.01)
        pair = PairCandidate(0, 17, 19, {}, 0.88, r17, r19)
        rows = [r15, r17, r19]
        l1, l2 = resolve_td3_line_rows_for_crops(pair, rows, fb)
        self.assertEqual(l1.row_id, 15)
        self.assertEqual(l2.row_id, 17)


class TestGermanIntegration(unittest.TestCase):
    def test_fallback_crops_have_ink_on_both_lines(self):
        img = cv2.imread(str(GERMAN))
        res, _ = detect_td3_mrz_fallback(img, load_params(), load_fallback_params())
        self.assertEqual(res.status, "MRZ_FOUND")
        self.assertIsNotNone(res.line1_bgr)
        self.assertIsNotNone(res.line2_bgr)
        g1 = cv2.cvtColor(res.line1_bgr, cv2.COLOR_BGR2GRAY)
        g2 = cv2.cvtColor(res.line2_bgr, cv2.COLOR_BGR2GRAY)
        _, i1 = cv2.threshold(g1, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        _, i2 = cv2.threshold(g2, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        self.assertGreater(i1.sum(), 0)
        self.assertGreater(i2.sum(), 0)
        self.assertLess(res.line1_bbox[1], res.line2_bbox[1])


if __name__ == "__main__":
    unittest.main()
