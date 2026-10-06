"""MRZ-A14 pair-aware fallback crop normalization tests."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from mrz_detect_orchestrator import detect_mrz_orchestrated  # noqa: E402
from mrz_detect_td3 import detect_td3_mrz_pair, load_params, rotate_image  # noqa: E402
from mrz_fallback_crop_normalize import (  # noqa: E402
    median_component_height,
    normalize_fallback_pair_crops,
)
from mrz_pre_ocr_gate import validate_pre_ocr  # noqa: E402

SYR = ROOT / "results" / "mrz_a2" / "20260930T134456Z" / "01_original_reference.png"
GBR = ROOT / "results" / "mrz_a2" / "20260930T140445Z" / "01_original_reference.png"
A9_GEOM = ROOT / "results" / "mrz_a2" / "20260930T165849Z" / "selected_geometry.json"
A12_L1 = ROOT / "results" / "mrz_a12" / "20260930T200835Z" / "line1.png"
A12_L2 = ROOT / "results" / "mrz_a12" / "20260930T200835Z" / "line2.png"
A12_GEOM = ROOT / "results" / "mrz_a12" / "20260930T200835Z" / "selected_geometry.json"


def _a12_line_bboxes() -> tuple[tuple[int, int, int, int], tuple[int, int, int, int]]:
    geom = json.loads(A12_GEOM.read_text(encoding="utf-8"))
    return tuple(geom["line1_bbox_xywh"]), tuple(geom["line2_bbox_xywh"])


def _a12_deskewed_stub() -> np.ndarray:
    return np.full((426, 602, 3), 245, dtype=np.uint8)


def _params_a14() -> dict:
    p = load_params()
    block = json.loads((ROOT / "docs" / "mrz_a14_normalization_params.json").read_text(encoding="utf-8"))
    p["fallback_crop_normalization"] = {k: v for k, v in block.items() if k != "description"}
    return p


def _deskewed(img, det):
    return rotate_image(img, det.deskew_angle_deg) if det.deskew_applied else img.copy()


class TestPrimaryNeverNormalized(unittest.TestCase):
    def test_syrian_orchestrator_primary(self):
        params = _params_a14()
        img = cv2.imread(str(SYR))
        orch = detect_mrz_orchestrated(img, params)
        self.assertEqual(orch.detector_path, "PRIMARY")
        det = orch.detection
        norm = normalize_fallback_pair_crops(
            _deskewed(img, det),
            det.line1_bgr,
            det.line2_bgr,
            det.line1_bbox,
            det.line2_bbox,
            params,
        )
        self.assertEqual(norm.status, "UNCHANGED")


class TestSimilarHeightsUnchanged(unittest.TestCase):
    def test_saved_a9_geometry_ratio_does_not_trigger(self):
        """A9 fallback pair was 14px vs 17px (ratio ~0.82) — above 0.70 trigger."""
        params = _params_a14()
        geom = json.loads(A9_GEOM.read_text(encoding="utf-8"))
        h1 = geom["line1_bbox_xywh"][3]
        h2 = geom["line2_bbox_xywh"][3]
        ratio = min(h1, h2) / max(h1, h2)
        self.assertGreaterEqual(ratio, 0.7)
        w = 405
        line1 = np.full((h1, w, 3), 245, dtype=np.uint8)
        line2 = np.full((h2, w, 3), 245, dtype=np.uint8)
        for x in range(20, w - 20, 12):
            cv2.rectangle(line1, (x, 2), (x + 7, h1 - 3), (30, 30, 30), -1)
            cv2.rectangle(line2, (x, 2), (x + 7, h2 - 3), (30, 30, 30), -1)
        desk = np.full((270, w, 3), 245, dtype=np.uint8)
        bb1 = tuple(geom["line1_bbox_xywh"])
        bb2 = tuple(geom["line2_bbox_xywh"])
        norm = normalize_fallback_pair_crops(desk, line1, line2, bb1, bb2, params)
        self.assertEqual(norm.status, "UNCHANGED")


class TestA12StyleNormalization(unittest.TestCase):
    def test_saved_a12_crops_normalize_to_pair_height(self):
        params = _params_a14()
        l1 = cv2.imread(str(A12_L1))
        l2 = cv2.imread(str(A12_L2))
        bb1, bb2 = _a12_line_bboxes()
        norm = normalize_fallback_pair_crops(
            _a12_deskewed_stub(),
            l1,
            l2,
            bb1,
            bb2,
            params,
        )
        self.assertEqual(norm.status, "NORMALIZED")
        self.assertEqual(norm.line1_bgr.shape[0], l2.shape[0])
        self.assertEqual(norm.line1_bgr.shape[1], l1.shape[1])
        self.assertEqual(norm.line2_bgr.shape, l2.shape)


class TestGlyphMismatchRejected(unittest.TestCase):
    def test_different_glyph_scale_not_stretched(self):
        params = _params_a14()
        tall = np.full((40, 200, 3), 245, dtype=np.uint8)
        short = np.full((12, 200, 3), 245, dtype=np.uint8)
        for x in range(10, 190, 14):
            cv2.rectangle(tall, (x, 8), (x + 8, 32), (0, 0, 0), -1)
            cv2.rectangle(short, (x, 1), (x + 4, 8), (0, 0, 0), -1)
        desk = np.full((120, 220, 3), 245, dtype=np.uint8)
        norm = normalize_fallback_pair_crops(
            desk,
            short,
            tall,
            (10, 40, 200, 12),
            (10, 70, 200, 40),
            params,
        )
        self.assertEqual(norm.status, "REJECTED")


class TestIdempotence(unittest.TestCase):
    def test_second_pass_unchanged(self):
        params = _params_a14()
        l1 = cv2.imread(str(A12_L1))
        l2 = cv2.imread(str(A12_L2))
        bb1, bb2 = _a12_line_bboxes()
        n1 = normalize_fallback_pair_crops(_a12_deskewed_stub(), l1, l2, bb1, bb2, params)
        n2 = normalize_fallback_pair_crops(
            _a12_deskewed_stub(),
            n1.line1_bgr,
            n1.line2_bgr,
            n1.line1_bbox,
            n1.line2_bbox,
            params,
        )
        self.assertEqual(n2.status, "UNCHANGED")


class TestPreOcrPairHeightGate(unittest.TestCase):
    def test_abnormal_pair_fails_gate(self):
        params = _params_a14()
        l1 = cv2.imread(str(A12_L1))
        l2 = cv2.imread(str(A12_L2))
        gate = validate_pre_ocr(l1, l2, params)
        self.assertEqual(gate.status, "SEGMENTATION_INVALID")
        self.assertFalse(gate.pair_geometry_pass)

    def test_normalized_pair_passes_gate(self):
        params = _params_a14()
        l1 = cv2.imread(str(A12_L1))
        l2 = cv2.imread(str(A12_L2))
        bb1, bb2 = _a12_line_bboxes()
        norm = normalize_fallback_pair_crops(_a12_deskewed_stub(), l1, l2, bb1, bb2, params)
        self.assertEqual(norm.status, "NORMALIZED")
        gate = validate_pre_ocr(norm.line1_bgr, norm.line2_bgr, params)
        self.assertTrue(gate.details["pair"]["pair_crop_height_similarity_pass"])
        ratio = gate.details["pair"]["crop_height_ratio_min_over_max"]
        self.assertGreaterEqual(ratio, 0.7)


class TestNoHardcodedAntiOverfit(unittest.TestCase):
    def test_module_source(self):
        src = (ROOT / "scripts" / "mrz_fallback_crop_normalize.py").read_text(encoding="utf-8")
        for token in ("602", "340007955", "HAPPY", "8367fa8f", "USA"):
            self.assertNotIn(token, src)


if __name__ == "__main__":
    unittest.main()
