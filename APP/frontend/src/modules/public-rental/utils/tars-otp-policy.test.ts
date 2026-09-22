import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  isTarsOtpBlockingSign,
  maxOtpCodeLength,
  minOtpCodeLength,
  resolveTarsOtpDisplayStatus,
} from "./tars-otp-policy.ts";

const MESSAGES_DIR = path.join(import.meta.dirname, "../../../../messages");

function readMessages(locale: "ar" | "en") {
  return JSON.parse(readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), "utf8")) as {
    PublicRental: { tarsOtp: Record<string, string> };
  };
}

const baseState = {
  providerConfigured: true,
  required: true,
  status: "CODE_SENT" as const,
  maskedDestination: "***45",
  resendAvailableAt: null,
  expiresAt: null,
  otpLength: null,
  attemptsRemaining: 3,
};

describe("TarsOtp policy", () => {
  it("blocks signing when OTP is required but not verified", () => {
    assert.equal(isTarsOtpBlockingSign({ ...baseState, status: "CODE_SENT" }), true);
    assert.equal(isTarsOtpBlockingSign({ ...baseState, status: "VERIFIED" }), false);
    assert.equal(
      isTarsOtpBlockingSign({
        providerConfigured: false,
        required: false,
        status: "NOT_REQUIRED",
        maskedDestination: null,
        resendAvailableAt: null,
        expiresAt: null,
        otpLength: null,
        attemptsRemaining: null,
      }),
      false,
    );
  });

  it("maps client pending phases over backend status", () => {
    assert.equal(resolveTarsOtpDisplayStatus("NOT_STARTED", "REQUESTING"), "REQUESTING");
    assert.equal(resolveTarsOtpDisplayStatus("CODE_SENT", "VERIFYING"), "VERIFYING");
    assert.equal(resolveTarsOtpDisplayStatus("CODE_SENT", null), "CODE_SENT");
  });

  it("does not hardcode OTP length when provider omits it", () => {
    assert.equal(minOtpCodeLength({ ...baseState, otpLength: null }), 1);
    assert.equal(maxOtpCodeLength({ ...baseState, otpLength: null }), 32);
    assert.equal(minOtpCodeLength({ ...baseState, otpLength: 8 }), 8);
    assert.equal(maxOtpCodeLength({ ...baseState, otpLength: 8 }), 8);
  });
});

describe("TarsOtp i18n", () => {
  it("keeps Arabic and English tarsOtp keys aligned", () => {
    const en = readMessages("en").PublicRental.tarsOtp;
    const ar = readMessages("ar").PublicRental.tarsOtp;
    assert.deepEqual(Object.keys(en).sort(), Object.keys(ar).sort());
  });
});
