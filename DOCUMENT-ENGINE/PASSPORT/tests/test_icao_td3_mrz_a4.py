"""MRZ-A4 TD3 parser regression and checksum tests (stdlib unittest)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from icao_td3 import (  # noqa: E402
    TD3_LINE_LEN,
    char_value,
    compute_check_digit,
    normalize_mrz_line,
    parse_td3,
    status_from_validation,
    validate_td3,
    verify_check_digit,
    WEIGHTS,
)

LINE1_A2 = "PNSYRALTAWEEL<<MONTAJAB<<<<<<<<<<<<<<<<<<<<<"
LINE2_A2 = "0170577470SYR0401102M2601054050<50161796<<84"

ICAO_COMPOSITE_A2 = (
    LINE2_A2[0:10] + LINE2_A2[13:20] + LINE2_A2[21:28] + LINE2_A2[28:43]
)


def icao_composite_source(line2: str) -> str:
    return line2[0:10] + line2[13:20] + line2[21:28] + line2[28:43]


class TestChecksumPrimitive(unittest.TestCase):
    def test_digit_values(self):
        self.assertEqual(char_value("0"), 0)
        self.assertEqual(char_value("9"), 9)

    def test_alpha_values(self):
        self.assertEqual(char_value("A"), 10)
        self.assertEqual(char_value("Z"), 35)

    def test_filler_value(self):
        self.assertEqual(char_value("<"), 0)

    def test_weights_repeat(self):
        self.assertEqual(WEIGHTS, (7, 3, 1))
        self.assertEqual([WEIGHTS[i % 3] for i in range(6)], [7, 3, 1, 7, 3, 1])

    def test_document_number_substring(self):
        self.assertEqual(compute_check_digit(LINE2_A2[0:9]), 0)

    def test_dob_substring(self):
        self.assertEqual(compute_check_digit(LINE2_A2[13:19]), 2)

    def test_expiry_substring(self):
        self.assertEqual(compute_check_digit(LINE2_A2[21:27]), 4)

    def test_composite_39_char_source(self):
        self.assertEqual(len(ICAO_COMPOSITE_A2), 39)
        self.assertEqual(compute_check_digit(ICAO_COMPOSITE_A2), 4)
        self.assertEqual(LINE2_A2[43], "4")


class TestA2SavedRawRegression(unittest.TestCase):
    def test_line_lengths(self):
        self.assertEqual(len(LINE1_A2), TD3_LINE_LEN)
        self.assertEqual(len(LINE2_A2), TD3_LINE_LEN)

    def test_individual_checksums_pass(self):
        self.assertIs(verify_check_digit(LINE2_A2[0:9], LINE2_A2[9]), True)
        self.assertIs(verify_check_digit(LINE2_A2[13:19], LINE2_A2[19]), True)
        self.assertIs(verify_check_digit(LINE2_A2[21:27], LINE2_A2[27]), True)
        self.assertIs(verify_check_digit(LINE2_A2[28:42], LINE2_A2[42]), True)

    def test_composite_source_length_invariant(self):
        self.assertEqual(len(icao_composite_source(LINE2_A2)), 39)

    def test_parser_composite_passes(self):
        val = validate_td3(LINE1_A2, LINE2_A2)
        self.assertTrue(val.structure_valid)
        self.assertIs(val.document_number_check, True)
        self.assertIs(val.dob_check, True)
        self.assertIs(val.expiry_check, True)
        self.assertIs(val.composite_check, True)
        self.assertTrue(val.all_required_checks_pass)
        self.assertEqual(status_from_validation(val), "VALID")

    def test_composite_digit_matches_ocr(self):
        val = validate_td3(LINE1_A2, LINE2_A2)
        self.assertIs(val.composite_check, True)
        self.assertEqual(compute_check_digit(icao_composite_source(LINE2_A2)), int(LINE2_A2[43]))

    def test_extraction_from_mrz_structure(self):
        parsed = parse_td3(LINE1_A2, LINE2_A2)
        self.assertEqual(parsed.passport_number, "017057747")
        self.assertEqual(parsed.nationality, "SYR")
        self.assertEqual(parsed.surname, "ALTAWEEL")
        self.assertEqual(parsed.given_names, "MONTAJAB")
        self.assertEqual(parsed.full_name, "MONTAJAB ALTAWEEL")


class TestNegativeMutations(unittest.TestCase):
    def test_mutated_document_number_fails(self):
        chars = list(LINE2_A2)
        chars[0] = "1" if chars[0] != "1" else "2"
        line2 = "".join(chars)
        self.assertIs(verify_check_digit(line2[0:9], line2[9]), False)

    def test_mutated_dob_fails(self):
        chars = list(LINE2_A2)
        chars[13] = "1" if chars[13] != "1" else "2"
        line2 = "".join(chars)
        self.assertIs(verify_check_digit(line2[13:19], line2[19]), False)

    def test_mutated_expiry_fails(self):
        chars = list(LINE2_A2)
        chars[21] = "1" if chars[21] != "1" else "2"
        line2 = "".join(chars)
        self.assertIs(verify_check_digit(line2[21:27], line2[27]), False)

    def test_mutated_optional_data_fails_composite(self):
        chars = list(LINE2_A2)
        chars[28] = "1" if chars[28] != "1" else "2"
        line2 = "".join(chars)
        val = validate_td3(LINE1_A2, line2)
        self.assertIs(val.composite_check, False)

    def test_mutated_final_composite_digit_fails(self):
        chars = list(LINE2_A2)
        chars[43] = "0" if chars[43] != "0" else "1"
        line2 = "".join(chars)
        val = validate_td3(LINE1_A2, line2)
        self.assertIs(val.composite_check, False)

    def test_line2_length_43_invalid(self):
        val = validate_td3(LINE1_A2, LINE2_A2[:43])
        self.assertFalse(val.structure_valid)

    def test_line2_length_45_invalid(self):
        val = validate_td3(LINE1_A2, LINE2_A2 + "0")
        self.assertFalse(val.structure_valid)

    def test_invalid_character_structure(self):
        bad = LINE2_A2.replace("0", "!", 1)
        norm = normalize_mrz_line(bad)
        self.assertTrue(len(norm) != TD3_LINE_LEN or not validate_td3(LINE1_A2, norm).structure_valid)


class TestBaselineBugEvidence(unittest.TestCase):
    def test_independent_icao_composite_passes(self):
        self.assertEqual(compute_check_digit(ICAO_COMPOSITE_A2), int(LINE2_A2[43]))


if __name__ == "__main__":
    unittest.main()
