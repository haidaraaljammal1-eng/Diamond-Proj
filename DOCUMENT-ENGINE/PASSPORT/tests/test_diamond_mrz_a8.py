"""MRZ-A8 Diamond partial-MRZ acceptance tests."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from diamond_mrz_acceptance import (  # noqa: E402
    FillerLossClass,
    evaluate_mrz_for_diamond,
)
from icao_td3 import TD3_LINE_LEN  # noqa: E402

LINE1_SYR = "PNSYRALTAWEEL<<MONTAJAB<<<<<<<<<<<<<<<<<<<<<"
LINE2_SYR = "0170577470SYR0401102M2601054050<50161796<<84"

LINE1_GBR = "P<GBRDOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<"
LINE2_GBR = "AB12345671GBR8001014M3110142<<<<<<<<<<08"


class TestBritishSavedRaw(unittest.TestCase):
    def test_valid_for_diamond_without_padding(self):
        ev = evaluate_mrz_for_diamond(LINE1_GBR, LINE2_GBR)
        self.assertEqual(ev.status, "VALID_FOR_DIAMOND")
        self.assertFalse(ev.mrz_valid)
        self.assertTrue(ev.diamond_fields_validated)
        self.assertEqual(ev.full_name, "JOHN DOE")
        self.assertEqual(ev.nationality, "GBR")
        self.assertEqual(ev.passport_number, "AB1234567")
        self.assertEqual(ev.reason, "TRAILING_FILLER_LOSS_ONLY")
        self.assertEqual(ev.line1_filler_loss.classification, FillerLossClass.SAFE_TRAILING_FILLER_LOSS)
        self.assertEqual(ev.line2_filler_loss.classification, FillerLossClass.SAFE_OPTIONAL_FILLER_REGION_LOSS)


class TestSyrianStrictRegression(unittest.TestCase):
    def test_full_mrz_stays_valid(self):
        ev = evaluate_mrz_for_diamond(LINE1_SYR, LINE2_SYR)
        self.assertEqual(ev.status, "VALID")
        self.assertTrue(ev.mrz_valid)
        self.assertTrue(ev.diamond_fields_validated)
        self.assertEqual(ev.full_name, "MONTAJAB ALTAWEEL")
        self.assertEqual(ev.nationality, "SYR")
        self.assertEqual(ev.passport_number, "017057747")


class TestNegativeMutations(unittest.TestCase):
    def test_a_surname_deletion_blocks_name(self):
        line1 = LINE1_GBR.replace("DOE", "DO", 1)
        ev = evaluate_mrz_for_diamond(line1, LINE2_GBR)
        self.assertNotEqual(ev.status, "VALID_FOR_DIAMOND")
        self.assertFalse(ev.full_name_validation.validated)

    def test_b_passport_number_deletion(self):
        line2 = LINE2_GBR[1:]
        ev = evaluate_mrz_for_diamond(LINE1_GBR, line2)
        self.assertNotEqual(ev.status, "VALID_FOR_DIAMOND")
        self.assertFalse(ev.passport_number_validation.validated)

    def test_c_bad_passport_check_digit(self):
        chars = list(LINE2_GBR)
        chars[9] = "0" if chars[9] != "0" else "1"
        line2 = "".join(chars)
        ev = evaluate_mrz_for_diamond(LINE1_GBR, line2)
        self.assertEqual(ev.status, "INVALID")
        self.assertFalse(ev.passport_number_validation.validated)

    def test_d_pre_nationality_deletion(self):
        line2 = LINE2_GBR[:9] + LINE2_GBR[10:]
        ev = evaluate_mrz_for_diamond(LINE1_GBR, line2)
        self.assertNotEqual(ev.status, "VALID_FOR_DIAMOND")
        self.assertFalse(ev.nationality_validation.validated)

    def test_e_nationality_corruption(self):
        line2 = LINE2_GBR[:10] + "XXR" + LINE2_GBR[13:]
        ev = evaluate_mrz_for_diamond(LINE1_GBR, line2)
        self.assertNotEqual(ev.status, "VALID_FOR_DIAMOND")
        self.assertFalse(ev.nationality_validation.validated)

    def test_f_trailing_line1_filler_loss_name_may_validate(self):
        line1 = LINE1_SYR[:40]
        self.assertEqual(len(line1), 40)
        ev = evaluate_mrz_for_diamond(line1, LINE2_SYR)
        self.assertTrue(ev.full_name_validation.validated)
        self.assertEqual(ev.full_name_validation.extracted, "MONTAJAB ALTAWEEL")

    def test_g_optional_line2_filler_loss_prefix_may_validate(self):
        line2 = LINE2_SYR[:40]
        self.assertEqual(len(line2), 40)
        ev = evaluate_mrz_for_diamond(LINE1_SYR, line2)
        self.assertTrue(ev.passport_number_validation.validated)
        self.assertTrue(ev.nationality_validation.validated)
        self.assertEqual(ev.passport_number_validation.extracted, "017057747")
        self.assertEqual(ev.nationality_validation.extracted, "SYR")

    def test_h_ambiguous_deletion_is_review(self):
        line1 = LINE1_GBR[:20] + LINE1_GBR[21:]
        ev = evaluate_mrz_for_diamond(line1, LINE2_GBR)
        self.assertEqual(ev.status, "REVIEW")
        self.assertFalse(ev.diamond_fields_validated)


class TestNeverBlindPad(unittest.TestCase):
    def test_shorter_line_not_auto_valid(self):
        ev = evaluate_mrz_for_diamond(LINE1_GBR[:30], LINE2_GBR[:30])
        self.assertNotEqual(ev.status, "VALID")
        self.assertNotEqual(ev.status, "VALID_FOR_DIAMOND")


if __name__ == "__main__":
    unittest.main()
