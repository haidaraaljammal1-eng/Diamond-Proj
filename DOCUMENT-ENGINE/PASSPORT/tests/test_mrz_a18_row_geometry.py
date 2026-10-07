"""MRZ-A18 final TD3 row crop geometry normalization tests."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from mrz_detect_td3 import load_params  # noqa: E402
from mrz_fallback_crop_normalize import (  # noqa: E402
    median_component_height,
    normalize_fallback_pair_crops,
)

A12_L1 = ROOT / "results" / "mrz_a12" / "20260930T200835Z" / "line1.png"
A12_L2 = ROOT / "results" / "mrz_a12" / "20260930T200835Z" / "line2.png"
A12_GEOM = ROOT / "results" / "mrz_a12" / "20260930T200835Z" / "selected_geometry.json"
GER_GEOM = ROOT / "results" / "mrz_a17" / "20260930T213114Z" / "selected_geometry.json"


def _params_pipeline() -> dict:
    """Production merge: A14 base + A18 overrides."""
    p = load_params()
    norm_cfg: dict = {}
    a14 = json.loads((ROOT / "docs" / "mrz_a14_normalization_params.json").read_text(encoding="utf-8"))
    norm_cfg.update({k: v for k, v in a14.items() if k != "description"})
    a18 = json.loads((ROOT / "docs" / "mrz_a18_row_geometry_params.json").read_text(encoding="utf-8"))
    norm_cfg.update({k: v for k, v in a18.items() if k not in ("description", "phase")})
    p["fallback_crop_normalization"] = norm_cfg
    return p


def _synthetic_mrz_line(h: int, w: int, glyph_h: int) -> np.ndarray:
    img = np.full((h, w, 3), 245, dtype=np.uint8)
    y0 = max(1, (h - glyph_h) // 2)
    for x in range(20, w - 20, 12):
        cv2.rectangle(img, (x, y0), (x + 7, y0 + glyph_h - 1), (25, 25, 25), -1)
    return img


class TestEqualHeightsNoNormalization(unittest.TestCase):
    def test_equal_crop_heights_unchanged(self):
        params = _params_pipeline()
        w = 400
        h = 22
        l1 = _synthetic_mrz_line(h, w, 10)
        l2 = _synthetic_mrz_line(h, w, 10)
        desk = np.full((200, w, 3), 245, dtype=np.uint8)
        norm = normalize_fallback_pair_crops(
            desk, l1, l2, (0, 50, w, h), (0, 90, w, h), params
        )
        self.assertEqual(norm.status, "UNCHANGED")
        self.assertFalse(norm.applied)


class TestShortValidRowTriggers(unittest.TestCase):
    def test_german_geometry_ratio_triggers(self):
        params = _params_pipeline()
        geom = json.loads(GER_GEOM.read_text(encoding="utf-8"))
        h1 = geom["line1_bbox_xywh"][3]
        h2 = geom["line2_bbox_xywh"][3]
        ratio = min(h1, h2) / max(h1, h2)
        self.assertLess(ratio, params["fallback_crop_normalization"]["min_pair_crop_height_ratio_to_trigger"])
        w = geom["line1_bbox_xywh"][2]
        l1 = _synthetic_mrz_line(h1, w, 8)
        l2 = _synthetic_mrz_line(h2, w, 10)
        desk = np.full((414, w, 3), 245, dtype=np.uint8)
        bb1 = tuple(geom["line1_bbox_xywh"])
        bb2 = tuple(geom["line2_bbox_xywh"])
        norm = normalize_fallback_pair_crops(desk, l1, l2, bb1, bb2, params)
        self.assertEqual(norm.status, "NORMALIZED")
        self.assertTrue(norm.applied)
        ah1, ah2 = norm.line1_bgr.shape[0], norm.line2_bgr.shape[0]
        self.assertGreaterEqual(min(ah1, ah2) / max(ah1, ah2), 0.7)


class TestSecurityLineNoNormalization(unittest.TestCase):
    def test_uniform_thin_band_not_expanded(self):
        """Thin security stripe: weak paired glyph scale → REJECT, not normalize."""
        params = _params_pipeline()
        w = 400
        tall = _synthetic_mrz_line(24, w, 12)
        stripe = np.full((6, w, 3), 245, dtype=np.uint8)
        cv2.rectangle(stripe, (0, 2), (w - 1, 4), (40, 40, 40), -1)
        desk = np.full((120, w, 3), 245, dtype=np.uint8)
        norm = normalize_fallback_pair_crops(
            desk, stripe, tall, (0, 40, w, 6), (0, 70, w, 24), params
        )
        self.assertIn(norm.status, ("REJECTED", "UNCHANGED"))
        self.assertFalse(norm.applied)


class TestWeakRowRejected(unittest.TestCase):
    def test_empty_short_row_rejected(self):
        params = _params_pipeline()
        w = 300
        empty = np.full((14, w, 3), 245, dtype=np.uint8)
        tall = _synthetic_mrz_line(22, w, 11)
        desk = np.full((100, w, 3), 245, dtype=np.uint8)
        norm = normalize_fallback_pair_crops(
            desk, empty, tall, (0, 30, w, 14), (0, 60, w, 22), params
        )
        self.assertEqual(norm.status, "REJECTED")
        self.assertFalse(norm.applied)


class TestWidthInvariant(unittest.TestCase):
    def test_normalization_never_changes_width(self):
        params = _params_pipeline()
        l1 = cv2.imread(str(A12_L1))
        l2 = cv2.imread(str(A12_L2))
        geom = json.loads(A12_GEOM.read_text(encoding="utf-8"))
        bb1 = tuple(geom["line1_bbox_xywh"])
        bb2 = tuple(geom["line2_bbox_xywh"])
        desk = np.full((426, l1.shape[1], 3), 245, dtype=np.uint8)
        norm = normalize_fallback_pair_crops(desk, l1, l2, bb1, bb2, params)
        self.assertEqual(norm.status, "NORMALIZED")
        self.assertEqual(norm.line1_bgr.shape[1], l1.shape[1])
        self.assertEqual(norm.line2_bgr.shape[1], l2.shape[1])
        self.assertEqual(norm.line1_bbox[2], bb1[2])
        self.assertEqual(norm.line2_bbox[2], bb2[2])


class TestNoOcrDependency(unittest.TestCase):
    def test_module_has_no_ocr_imports(self):
        src = (ROOT / "scripts" / "mrz_fallback_crop_normalize.py").read_text(encoding="utf-8")
        for token in ("run_ocr", "paddle", "PaddleOCR", "raw_ocr", "en_PP-OCR"):
            self.assertNotIn(token, src)


class TestSourceImageUntouched(unittest.TestCase):
    def test_deskewed_buffer_not_mutated(self):
        params = _params_pipeline()
        w = 350
        l1 = _synthetic_mrz_line(14, w, 7)
        l2 = _synthetic_mrz_line(20, w, 10)
        desk = np.full((180, w, 3), 200, dtype=np.uint8)
        desk[40:54, :] = 100
        desk[80:100, :] = 100
        before = desk.copy()
        normalize_fallback_pair_crops(
            desk, l1, l2, (0, 40, w, 14), (0, 80, w, 20), params
        )
        np.testing.assert_array_equal(desk, before)


if __name__ == "__main__":
    unittest.main()
