import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizePrintedDate,
  preferDayFirstForLicenceContext,
} from "src/modules/vision-ai/extraction/date-normalize";
import { parseGeminiLicenceRaw } from "src/modules/vision-ai/extraction/licence-gemini.schema";

test("normalizePrintedDate accepts ISO input", () => {
  const result = normalizePrintedDate("2022-12-18");
  assert.equal(result.iso, "2022-12-18");
  assert.equal(result.ambiguous, false);
});

test("normalizePrintedDate converts DD/MM/YYYY when day is unambiguous", () => {
  const result = normalizePrintedDate("18/12/2022");
  assert.equal(result.iso, "2022-12-18");
  assert.equal(result.ambiguous, false);
});

test("normalizePrintedDate uses preferDayFirst for ambiguous slash dates", () => {
  const without = normalizePrintedDate("03/04/2028");
  assert.equal(without.iso, null);
  assert.equal(without.ambiguous, true);

  const withPref = normalizePrintedDate("03/04/2028", { preferDayFirst: true });
  assert.equal(withPref.iso, "2028-04-03");
  assert.equal(withPref.ambiguous, false);
});

test("parseGeminiLicenceRaw normalizes printed UAE-style dates from model output", () => {
  const parsed = parseGeminiLicenceRaw({
    fullName: "TEST DRIVER",
    licenceNumber: "1893918",
    nationality: "Philippines",
    issuingCountry: "United Arab Emirates",
    dateOfBirth: "04/05/1980",
    issueDate: "13/04/2013",
    expiryDate: "13/04/2023",
  });
  assert.equal(parsed.dateOfBirth, "1980-05-04");
  assert.equal(parsed.issueDate, "2013-04-13");
  assert.equal(parsed.expiryDate, "2023-04-13");
  assert.equal(parsed.dateOfBirthNeedsReview, false);
});

test("parseGeminiLicenceRaw previously dropped slash dates via cleanIsoDate", () => {
  const parsed = parseGeminiLicenceRaw({
    dateOfBirth: "01/01/1990",
    expiryDate: "14/05/2033",
    issuingCountry: "UNITED ARAB EMIRATES",
  });
  assert.equal(parsed.dateOfBirth, "1990-01-01");
  assert.equal(parsed.expiryDate, "2033-05-14");
});

test("preferDayFirstForLicenceContext detects UAE issuing country", () => {
  assert.equal(preferDayFirstForLicenceContext("United Arab Emirates", null), true);
  assert.equal(preferDayFirstForLicenceContext(null, "UAE"), true);
  assert.equal(preferDayFirstForLicenceContext("Germany", "German"), false);
});
