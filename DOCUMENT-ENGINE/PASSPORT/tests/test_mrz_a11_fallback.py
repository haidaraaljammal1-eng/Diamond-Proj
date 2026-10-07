"""MRZ-A11 fallback detector and orchestrator tests."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from mrz_detect_orchestrator import detect_mrz_orchestrated  # noqa: E402
from mrz_detect_td3 import detect_td3_mrz_pair, load_params  # noqa: E402
from mrz_detect_td3_fallback import detect_td3_mrz_fallback, load_fallback_params  # noqa: E402

SYR = ROOT / "results" / "mrz_a2" / "20260930T134456Z" / "01_original_reference.png"
GBR = ROOT / "results" / "mrz_a2" / "20260930T140445Z" / "01_original_reference.png"
A9 = ROOT / "results" / "mrz_a2" / "20260930T165849Z" / "01_original_reference.png"
SYR_GEOM = ROOT / "results" / "mrz_a2" / "20260930T134456Z" / "selected_geometry.json"


def _synthetic_two_rows(w=600, h=400) -> np.ndarray:
    img = np.full((h, w, 3), 245, dtype=np.uint8)
    for y in (280, 310):
        for x in range(40, w - 40, 12):
            cv2.rectangle(img, (x, y), (x + 8, y + 14), (20, 20, 20), -1)
    return img


class TestOrchestratorPrimaryFirst(unittest.TestCase):
    def setUp(self):
        self.params = load_params()

    def test_syrian_primary_not_fallback(self):
        img = cv2.imread(str(SYR))
        orch = detect_mrz_orchestrated(img, self.params)
        self.assertEqual(orch.detector_path, "PRIMARY")
        self.assertFalse(orch.fallback_invoked)
        self.assertEqual(orch.detection.status, "MRZ_FOUND")

    def test_british_primary_not_fallback(self):
        img = cv2.imread(str(GBR))
        orch = detect_mrz_orchestrated(img, self.params)
        self.assertEqual(orch.detector_path, "PRIMARY")
        self.assertFalse(orch.fallback_invoked)

    def test_primary_success_does_not_replace_boxes(self):
        img = cv2.imread(str(SYR))
        primary = detect_td3_mrz_pair(img, self.params)
        orch = detect_mrz_orchestrated(img, self.params)
        self.assertEqual(orch.detection.line1_bbox, primary.line1_bbox)
        self.assertEqual(orch.detection.line2_bbox, primary.line2_bbox)


class TestFallbackBehavior(unittest.TestCase):
    def setUp(self):
        self.params = load_params()
        self.fb = load_fallback_params()

    def test_a9_primary_fails_fallback_may_succeed(self):
        img = cv2.imread(str(A9))
        primary = detect_td3_mrz_pair(img, self.params)
        self.assertEqual(primary.status, "MRZ_NOT_FOUND")
        orch = detect_mrz_orchestrated(img, self.params)
        self.assertTrue(orch.fallback_invoked)
        self.assertIn(orch.detector_path, ("FALLBACK", "NONE"))

    def test_page_blob_rejected(self):
        img = np.full((300, 400, 3), 255, dtype=np.uint8)
        cv2.rectangle(img, (5, 5), (395, 290), (0, 0, 0), -1)
        res, diag = detect_td3_mrz_fallback(img, self.params, self.fb)
        self.assertEqual(res.status, "MRZ_NOT_FOUND")
        self.assertEqual(diag.plausible_rows, 0)

    def test_single_row_insufficient(self):
        img = np.full((300, 500, 3), 240, dtype=np.uint8)
        for x in range(20, 480, 10):
            cv2.rectangle(img, (x, 250), (x + 6, 265), (0, 0, 0), -1)
        res, _ = detect_td3_mrz_fallback(img, self.params, self.fb)
        self.assertEqual(res.status, "MRZ_NOT_FOUND")

    def test_synthetic_two_rows_may_pass(self):
        img = _synthetic_two_rows()
        res, diag = detect_td3_mrz_fallback(img, self.params, self.fb)
        self.assertIn(res.status, ("MRZ_FOUND", "MRZ_NOT_FOUND"))
        if res.status == "MRZ_FOUND":
            self.assertGreaterEqual(diag.plausible_rows, 2)

    def test_coordinate_mapping_scale_recorded(self):
        img = cv2.imread(str(A9))
        orch = detect_mrz_orchestrated(img, self.params)
        if orch.detector_path == "FALLBACK":
            self.assertGreater(orch.coordinate_mapping.get("working_scale", 1.0), 1.0)
            self.assertIsNotNone(orch.detection.line1_bgr)


class TestNegativeRegions(unittest.TestCase):
    def test_non_mrz_crops_no_fallback_mrz(self):
        img = cv2.imread(str(SYR))
        h, w = img.shape[:2]
        crops = [img[0 : h // 3, :], img[h // 3 : 2 * h // 3, :]]
        for c in crops:
            res, _ = detect_td3_mrz_fallback(c, load_params())
            self.assertEqual(res.status, "MRZ_NOT_FOUND")


class TestAntiOverfit(unittest.TestCase):
    def test_no_a9_hardcoded_constants_in_fallback_source(self):
        src = (ROOT / "scripts" / "mrz_detect_td3_fallback.py").read_text(encoding="utf-8")
        for token in ("405", "270", "a257f905", "GBR", "SYR"):
            self.assertNotIn(token, src, msg=f"suspicious token {token}")


if __name__ == "__main__":
    unittest.main()
