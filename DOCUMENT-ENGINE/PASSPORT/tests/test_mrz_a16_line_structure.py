"""MRZ-A16 fallback line-structure disambiguation tests."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from mrz_detect_td3 import RowCandidate  # noqa: E402
from mrz_fallback_line_structure import (  # noqa: E402
    analyze_row_pixels,
    apply_orphan_band_filter,
    apply_partial_width_rejection,
    classify_row_structure,
    load_line_structure_params,
)
from mrz_detect_td3_fallback import load_fallback_params  # noqa: E402

GERMAN = ROOT / "results" / "mrz_a2" / "20260930T214256Z" / "01_original_reference.png"


def _row(rid, x, y, w, h, comp=40, horiz=0.6, reg=0.65):
    return RowCandidate(
        row_id=rid,
        x=x,
        y=y,
        w=w,
        h=h,
        angle_deg=0.0,
        ink_density=0.15,
        component_count=comp,
        horizontal_coverage=horiz,
        rejected=False,
        reject_reason="",
        metrics={"regularity": reg, "passes_structure": True},
    )


class TestPartialWidthRejection(unittest.TestCase):
    def test_narrow_decorative_row_rejected(self):
        fb = load_fallback_params()
        rows = [_row(0, 300, 100, 200, 10, comp=10)]
        apply_partial_width_rejection(rows, 640, fb)
        self.assertTrue(rows[0].rejected)


class TestOrphanBandFilter(unittest.TestCase):
    def test_orphan_above_core_pair_rejected(self):
        fb = load_fallback_params()
        r15 = _row(15, 0, 363, 640, 9)
        r17 = _row(17, 0, 395, 640, 11)
        r19 = _row(19, 0, 415, 640, 11)
        rows = [r15, r17, r19]
        class P:
            def __init__(self, score, vgap, a, b):
                self.total_score = score
                self.score_breakdown = {"vertical_gap": vgap}
                self.row_a = a
                self.row_b = b

        pairs = [
            P(0.881, 0.84, r17, r19),
            P(0.804, 0.35, r15, r17),
        ]
        notes = apply_orphan_band_filter(rows, pairs, fb)
        self.assertTrue(r15.rejected)
        self.assertFalse(r17.rejected)
        self.assertFalse(r19.rejected)
        self.assertTrue(notes)

    def test_two_row_mrz_no_orphan_rejection(self):
        fb = load_fallback_params()
        r1 = _row(1, 0, 388, 640, 10)
        r2 = _row(2, 0, 420, 640, 19)
        rows = [r1, r2]

        class P:
            total_score = 0.9
            score_breakdown = {"vertical_gap": 0.8}
            row_a = r1
            row_b = r2

        apply_orphan_band_filter(rows, [P], fb)
        self.assertFalse(r1.rejected)


class TestTextLikeRow(unittest.TestCase):
    def test_mrz_like_row_not_line_artifact(self):
        img = np.full((14, 400, 3), 245, dtype=np.uint8)
        for x in range(10, 390, 12):
            cv2.rectangle(img, (x, 2), (x + 8, 12), (20, 20, 20), -1)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        pm = analyze_row_pixels(gray)
        row = _row(0, 0, 0, 400, 14, comp=30, horiz=0.55, reg=0.7)
        cfg = load_line_structure_params(load_fallback_params())
        self.assertEqual(classify_row_structure(row, pm, 640, cfg), "TEXT_LIKE_ROW")


class TestLongHorizontalLine(unittest.TestCase):
    def test_pure_horizontal_line_classified(self):
        img = np.full((6, 500, 3), 255, dtype=np.uint8)
        cv2.line(img, (0, 3), (499, 3), (0, 0, 0), 1)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        pm = analyze_row_pixels(gray)
        row = _row(0, 0, 0, 500, 6, comp=1, horiz=0.95, reg=0.1)
        cfg = load_line_structure_params(load_fallback_params())
        self.assertEqual(classify_row_structure(row, pm, 640, cfg), "LINE_LIKE_ARTIFACT")


class TestGermanDetectionIntegration(unittest.TestCase):
    def test_german_fallback_finds_pair(self):
        from mrz_detect_orchestrator import detect_mrz_orchestrated
        from mrz_detect_td3 import load_params

        img = cv2.imread(str(GERMAN))
        orch = detect_mrz_orchestrated(img, load_params())
        self.assertEqual(orch.detector_path, "FALLBACK")
        self.assertEqual(orch.detection.status, "MRZ_FOUND")
        self.assertIsNotNone(orch.detection.selected_pair)


class TestNoOcrInDisambiguation(unittest.TestCase):
    def test_orphan_filter_no_ocr_import(self):
        src = (ROOT / "scripts" / "mrz_fallback_line_structure.py").read_text(encoding="utf-8")
        self.assertNotIn("run_ocr", src)
        self.assertNotIn("parse_td3", src)


if __name__ == "__main__":
    unittest.main()
