import assert from "node:assert/strict";
import { test } from "node:test";
import { mrzDigitMatches, mrzYyMmDdToIso, validateTd3Mrz } from "src/modules/vision-ai/mrz/td3-mrz";

// ICAO TD3 sample (test vector style — synthetic document).
const LINE1 = "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<";
const LINE2 = "L898902C<3UTO7408122F1204159ZE184226B<<<<<10";

test("valid TD3 MRZ checksums pass", () => {
  const result = validateTd3Mrz(LINE1, LINE2);
  assert.equal(result.checksumValid, true);
  assert.equal(result.isoDateOfBirth, "1974-08-12");
  assert.equal(result.isoExpiryDate, "2012-04-15");
});

test("invalid passport number checksum fails", () => {
  const bad = `${LINE2.slice(0, 9)}X${LINE2.slice(10)}`;
  const result = validateTd3Mrz(LINE1, bad);
  assert.equal(result.passportNumberChecksumValid, false);
  assert.equal(result.checksumValid, false);
});

test("mrz date parser rejects malformed dates", () => {
  assert.equal(mrzYyMmDdToIso("990231", "dob"), null);
});

test("mrz digit helper matches ICAO weighting", () => {
  assert.equal(mrzDigitMatches("L898902C<", "3"), true);
});
