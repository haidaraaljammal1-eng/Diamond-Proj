import assert from "node:assert/strict";
import { test } from "node:test";
import {
  businessToday,
  calendarDateToStoredUtc,
  compareCalendarDate,
  isLicenseExpiredOn,
  parseCalendarDate,
  storedUtcToCalendarDate,
} from "src/modules/contracts/license-calendar";
import { evaluateDrivingLicenseOcr } from "src/modules/contracts/driving-license-policy";
import { derivePublicRentalFlowStep } from "src/modules/contracts/public-rental-flow";

test("expiry yesterday is EXPIRED, today and future are VALID", () => {
  const offset = 240;
  const now = new Date("2026-09-09T12:00:00.000Z");
  const today = businessToday(now, offset);
  const yesterday = { y: today.y, m: today.m, d: today.d - 1 };
  const tomorrow = { y: today.y, m: today.m, d: today.d + 1 };
  assert.equal(isLicenseExpiredOn(yesterday, today), true);
  assert.equal(isLicenseExpiredOn(today, today), false);
  assert.equal(isLicenseExpiredOn(tomorrow, today), false);
});

test("Dubai UTC+4 date is independent of process/client timezone", () => {
  const offset = 240;
  // 20:30 UTC on 8 Sep = 00:30 on 9 Sep in Dubai; still 8 Sep in UTC and UTC+3.
  const now = new Date("2026-09-08T20:30:00.000Z");
  const today = businessToday(now, offset);
  assert.deepEqual(today, { y: 2026, m: 9, d: 9 });

  const expired = evaluateDrivingLicenseOcr(
    {
      ok: true,
      licenseNumber: "DL-1",
      expiryDate: "2026-09-08",
      confidence: 0.99,
      provider: "test",
    },
    now,
    offset,
  );
  assert.equal(expired.status, "EXPIRED");

  const validToday = evaluateDrivingLicenseOcr(
    {
      ok: true,
      licenseNumber: "DL-1",
      expiryDate: "2026-09-09",
      confidence: 0.99,
      provider: "test",
    },
    now,
    offset,
  );
  assert.equal(validToday.status, "VALID");

  const validTomorrow = evaluateDrivingLicenseOcr(
    {
      ok: true,
      licenseNumber: "DL-1",
      expiryDate: "2026-09-10",
      confidence: 0.99,
      provider: "test",
    },
    now,
    offset,
  );
  assert.equal(validTomorrow.status, "VALID");
});

test("UTC noon storage does not shift the calendar day", () => {
  const stored = calendarDateToStoredUtc({ y: 2026, m: 9, d: 9 });
  assert.deepEqual(storedUtcToCalendarDate(stored), { y: 2026, m: 9, d: 9 });
  assert.equal(parseCalendarDate("2026-09-31"), null);
  assert.equal(compareCalendarDate({ y: 2026, m: 1, d: 1 }, { y: 2026, m: 1, d: 2 }) < 0, true);
});

test("OCR policy: unreadable, low confidence, expired, valid", () => {
  const now = new Date("2026-09-09T08:00:00.000Z");
  const offset = 240;
  const unreadable = evaluateDrivingLicenseOcr(
    {
      ok: true,
      licenseNumber: null,
      expiryDate: "2030-01-01",
      confidence: 0.99,
      provider: "test",
    },
    now,
    offset,
  );
  assert.equal(unreadable.status, "UNREADABLE");

  const low = evaluateDrivingLicenseOcr(
    {
      ok: true,
      licenseNumber: "DL-1",
      expiryDate: "2030-01-01",
      confidence: 0.2,
      fieldConfidences: { licenseNumber: 0.2, expiryDate: 0.99 },
      provider: "test",
    },
    now,
    offset,
  );
  assert.equal(low.status, "REVIEW_REQUIRED");

  const expired = evaluateDrivingLicenseOcr(
    {
      ok: true,
      licenseNumber: "DL-1",
      expiryDate: "2026-09-08",
      confidence: 0.99,
      provider: "test",
    },
    now,
    offset,
  );
  assert.equal(expired.status, "EXPIRED");

  const validToday = evaluateDrivingLicenseOcr(
    {
      ok: true,
      licenseNumber: "DL-1",
      expiryDate: "2026-09-09",
      confidence: 0.99,
      provider: "test",
    },
    now,
    offset,
  );
  assert.equal(validToday.status, "VALID");

  const unavailable = evaluateDrivingLicenseOcr(
    { ok: false, reason: "NOT_CONFIGURED", provider: "none" },
    now,
    offset,
  );
  assert.equal(unavailable.status, "PROVIDER_UNAVAILABLE");
});

test("public rental flow is derived, never stored as Contract.status", () => {
  const electronic = { collectionMode: "ELECTRONIC" as const };
  assert.equal(
    derivePublicRentalFlowStep({ status: "AWAITING", identityReady: false, paymentStatus: null, ...electronic }),
    "LICENSE_VERIFICATION",
  );
  assert.equal(
    derivePublicRentalFlowStep({ status: "AWAITING", identityReady: true, paymentStatus: null, ...electronic }),
    "CONTRACT",
  );
  assert.equal(
    derivePublicRentalFlowStep({ status: "FORM", identityReady: true, paymentStatus: null, ...electronic }),
    "CONTRACT",
  );
  assert.equal(
    derivePublicRentalFlowStep({ status: "SIGNED", identityReady: true, paymentStatus: null, ...electronic }),
    "PAYMENT",
  );
  assert.equal(
    derivePublicRentalFlowStep({ status: "PAID", identityReady: true, paymentStatus: "CONFIRMED", ...electronic }),
    "READY_FOR_HANDOVER",
  );
});

test("cash rental skips payment step after signature", () => {
  assert.equal(
    derivePublicRentalFlowStep({
      status: "SIGNED",
      identityReady: true,
      paymentStatus: null,
      collectionMode: "CASH",
    }),
    "READY_FOR_HANDOVER",
  );
});
