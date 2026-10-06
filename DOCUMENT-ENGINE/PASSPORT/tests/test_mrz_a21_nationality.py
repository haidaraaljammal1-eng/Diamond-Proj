"""MRZ-A21 nationality slot validation and O↔0 correction tests."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from diamond_mrz_acceptance import evaluate_mrz_for_diamond  # noqa: E402
from icao_td3 import normalize_mrz_line, parse_td3, validate_td3  # noqa: E402
from mrz_nationality_slot import (  # noqa: E402
    exhaustive_o0_collision_report,
    load_slot_table,
    resolve_nationality_slot,
)

A19_L1 = "P<NOROESTENBYEN<<AASAMUND<SPECIMEN<<<<<<<<<<"
A19_L2 = "CCC0022514N0R5604230M3004157<<<<<<<<<<<<<<04"
GER_L1 = "P<D<<MUSTERMANN<<ERIKA<<<<<<<<<<<<<<<<<<<<<<"
GER_L2 = "C01X00T478D<<6408125F2702283<<<<<<<<<<<<<<<4"
SYR_L1 = "PNSYRALTAWEEL<<MONTAJAB<<<<<<<<<<<<<<<<<<<<<"
SYR_L2 = "0170577470SYR0401102M2601054050<50161796<<84"
GBR_L1 = "P<GBRDOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<"
GBR_L2 = "AB12345671GBR8001014M3110142<<<<<<<<<<08"
USA_L1 = "P<USATRAVELER<<HAPPY<<<<<<<<<<<<<<<<<<<<<<<<"
USA_L2 = "3400079553USA6707046F1608078910000833<111920"


def _swap_nat(l2: str, nat3: str) -> str:
    from icao_td3 import compute_check_digit

    s = list(l2)
    s[10:13] = list(nat3)
    line = "".join(s)
    comp = line[0:10] + line[13:20] + line[21:28] + line[28:43]
    s[43] = str(compute_check_digit(comp))
    return "".join(s)


class TestSlotResolution(unittest.TestCase):
    def test_nor_unchanged(self):
        r = resolve_nationality_slot("NOR")
        self.assertEqual(r.status, "ACCEPTED_RAW")
        self.assertEqual(r.final_nationality, "NOR")
        self.assertFalse(r.correction_applied)

    def test_n0r_corrects_to_nor(self):
        r = resolve_nationality_slot("N0R")
        self.assertEqual(r.status, "CORRECTED")
        self.assertEqual(r.final_nationality, "NOR")
        self.assertEqual(r.correction_type, "O0_OCR_CONFUSION")

    def test_d_fillers_unchanged(self):
        r = resolve_nationality_slot("D<<")
        self.assertEqual(r.status, "ACCEPTED_RAW")
        self.assertEqual(r.final_nationality, "D")

    def test_xx_codes(self):
        for code in ("XXA", "XXB", "XXC", "XXX"):
            r = resolve_nationality_slot(code)
            self.assertEqual(r.status, "ACCEPTED_RAW")
            self.assertEqual(r.final_nationality, code)

    def test_british_part_a_codes(self):
        for code in ("GBD", "GBN", "GBO", "GBP", "GBS"):
            r = resolve_nationality_slot(code)
            self.assertEqual(r.status, "ACCEPTED_RAW")
            self.assertEqual(r.final_nationality, code)

    def test_rks_accepted(self):
        r = resolve_nationality_slot("RKS")
        self.assertEqual(r.status, "ACCEPTED_RAW")
        self.assertEqual(r.final_nationality, "RKS")

    def test_part_d_authority_codes_not_nationality(self):
        for code in ("XBA", "XCC", "XCO", "XDC", "XEC", "XES", "XOM", "XPO"):
            r = resolve_nationality_slot(code)
            self.assertEqual(r.status, "REVIEW", code)
            self.assertIsNone(r.final_nationality)

    def test_eue_not_in_dataset(self):
        self.assertNotIn("EUE", load_slot_table())

    def test_gbr_usa_syr(self):
        for code in ("GBR", "USA", "SYR"):
            r = resolve_nationality_slot(code)
            self.assertEqual(r.final_nationality, code)
            self.assertFalse(r.correction_applied)


class TestAmbiguousOrReview(unittest.TestCase):
    def test_no0_review(self):
        r = resolve_nationality_slot("NO0")
        self.assertEqual(r.status, "REVIEW")

    def test_n00_review(self):
        r = resolve_nationality_slot("N00")
        self.assertEqual(r.status, "REVIEW")

    def test_invalid_no_o0_path(self):
        r = resolve_nationality_slot("ZZQ")
        self.assertEqual(r.status, "REVIEW")
        self.assertFalse(r.candidate_codes)


class TestStrictPathRegression(unittest.TestCase):
    def test_a19_norwegian(self):
        ev = evaluate_mrz_for_diamond(A19_L1, A19_L2)
        self.assertEqual(ev.status, "VALID")
        self.assertEqual(ev.nationality, "NOR")
        self.assertTrue(ev.nationality_slot_resolution.correction_applied)
        self.assertEqual(ev.nationality_slot_resolution.raw_slot, "N0R")
        self.assertEqual(normalize_mrz_line(A19_L2)[10:13], "N0R")

    def test_german_d_fillers(self):
        ev = evaluate_mrz_for_diamond(GER_L1, GER_L2)
        self.assertEqual(ev.status, "VALID")
        self.assertEqual(ev.nationality, "D")

    def test_syrian(self):
        ev = evaluate_mrz_for_diamond(SYR_L1, SYR_L2)
        self.assertEqual(ev.nationality, "SYR")

    def test_usa(self):
        ev = evaluate_mrz_for_diamond(USA_L1, USA_L2)
        self.assertEqual(ev.nationality, "USA")

    def test_british_partial(self):
        ev = evaluate_mrz_for_diamond(GBR_L1, GBR_L2)
        self.assertEqual(ev.nationality, "GBR")


class TestRawOcrPreserved(unittest.TestCase):
    def test_a19_raw_line2_unchanged_in_parser(self):
        parsed = parse_td3(A19_L1, A19_L2)
        self.assertIn("N0R", parsed.line2)
        self.assertEqual(parsed.nationality, "N0R")

    def test_checksums_unchanged(self):
        l1 = normalize_mrz_line(A19_L1)
        l2 = normalize_mrz_line(A19_L2)
        v = validate_td3(l1, l2)
        self.assertTrue(v.all_required_checks_pass)


class TestCodeWithOUnchanged(unittest.TestCase):
    def test_nor_slot_not_mutated_when_valid(self):
        table = load_slot_table()
        self.assertIn("NOR", table)
        r = resolve_nationality_slot("NOR")
        self.assertFalse(r.correction_applied)


class TestA20MatrixWithDataset(unittest.TestCase):
    def test_matrix_behaviors(self):
        l1 = A19_L1
        cases = {
            "NOR": ("VALID", "NOR", False),
            "N0R": ("VALID", "NOR", True),
            "GBR": ("VALID", "GBR", False),
            "USA": ("VALID", "USA", False),
            "D<<": ("VALID", "D", False),
        }
        for nat, (exp_status, exp_nat, corrected) in cases.items():
            l2 = _swap_nat(A19_L2, nat)
            ev = evaluate_mrz_for_diamond(l1, l2)
            self.assertEqual(ev.status, exp_status, nat)
            self.assertEqual(ev.nationality, exp_nat, nat)
            if corrected:
                self.assertTrue(ev.nationality_slot_resolution.correction_applied)


class TestExhaustiveCollision(unittest.TestCase):
    def test_collision_report(self):
        rep = exhaustive_o0_collision_report()
        self.assertEqual(rep["total_valid_slots"], 260)
        self.assertEqual(rep["ambiguous_invalid_mutations"], 0)


if __name__ == "__main__":
    unittest.main()
