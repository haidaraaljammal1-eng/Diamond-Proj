import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  canContinueFromIdentity,
  isPassportUnlocked,
  passportPanelFromState,
} from "./passport-view.ts";

describe("passport step sequencing", () => {
  it("stays locked until the backend reports a VALID license", () => {
    for (const status of [null, "PENDING", "EXPIRED", "UNREADABLE", "REVIEW_REQUIRED", "PROVIDER_UNAVAILABLE"] as const) {
      assert.equal(isPassportUnlocked(status), false);
      assert.equal(
        passportPanelFromState({ licenseStatus: status, passportStatus: "READY", phase: "idle" }),
        "locked",
      );
    }
    assert.equal(isPassportUnlocked("VALID"), true);
    assert.equal(
      passportPanelFromState({ licenseStatus: "VALID", passportStatus: "REQUIRED", phase: "idle" }),
      "idle",
    );
  });

  it("distinguishes uploading, processing, ready, failures, and provider unavailable", () => {
    const base = { licenseStatus: "VALID" as const };
    assert.equal(passportPanelFromState({ ...base, passportStatus: "REQUIRED", phase: "uploading" }), "uploading");
    assert.equal(passportPanelFromState({ ...base, passportStatus: "REQUIRED", phase: "processing" }), "processing");
    assert.equal(passportPanelFromState({ ...base, passportStatus: "PROCESSING", phase: "idle" }), "processing");
    assert.equal(passportPanelFromState({ ...base, passportStatus: "READY", phase: "idle" }), "ready");
    assert.equal(passportPanelFromState({ ...base, passportStatus: "NOT_RECOGNIZED", phase: "idle" }), "notRecognized");
    assert.equal(passportPanelFromState({ ...base, passportStatus: "FAILED", phase: "idle" }), "failed");
    assert.equal(
      passportPanelFromState({ ...base, passportStatus: "PROVIDER_UNAVAILABLE", phase: "idle" }),
      "unavailable",
    );
    // A retake in flight replaces the previous READY state on screen.
    assert.equal(passportPanelFromState({ ...base, passportStatus: "READY", phase: "uploading" }), "uploading");
  });
});

describe("canContinueFromIdentity", () => {
  it("requires backend identityReady and a later server step; never auto-advances", () => {
    assert.equal(canContinueFromIdentity(false, "LICENSE_VERIFICATION"), false);
    assert.equal(canContinueFromIdentity(false, "CONTRACT"), false);
    assert.equal(canContinueFromIdentity(true, "LICENSE_VERIFICATION"), false);
    assert.equal(canContinueFromIdentity(undefined, "CONTRACT"), false);
    assert.equal(canContinueFromIdentity(true, "CONTRACT"), true);
  });
});

describe("passport copy (AR/EN)", () => {
  const load = (locale: string) =>
    JSON.parse(readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), "utf8")) as {
      PublicRental: { passport: Record<string, string>; error: Record<string, string>; progress: Record<string, string> };
    };
  const en = load("en").PublicRental;
  const ar = load("ar").PublicRental;

  it("has the same passport keys in both locales", () => {
    assert.deepEqual(Object.keys(ar.passport).sort(), Object.keys(en.passport).sort());
    for (const key of ["PASSPORT_LICENSE_REQUIRED", "CONTRACT_IDENTITY_NOT_READY"]) {
      assert.ok(en.error[key]);
      assert.ok(ar.error[key]);
    }
  });

  it("shows the approved unavailable message and no provider brand or raw error code", () => {
    assert.equal(ar.passport.unavailableTitle, "خدمة قراءة بيانات جواز السفر غير متاحة حالياً.");
    assert.equal(ar.passport.unavailableBody, "يرجى المحاولة لاحقاً.");
    assert.equal(en.passport.unavailableTitle, "Passport processing is currently unavailable.");
    assert.equal(en.passport.unavailableBody, "Please try again later.");
    const customerCopy = JSON.stringify([en.passport, ar.passport]);
    for (const banned of ["Azure", "Google", "AWS", "Tesseract", "OpenAI", "DOCUMENT_OCR_PROVIDER_NOT_CONFIGURED"]) {
      assert.equal(customerCopy.includes(banned), false, banned);
    }
  });

  it("labels the first progress step as document verification", () => {
    assert.equal(en.progress.license, "Document Verification");
    assert.equal(ar.progress.license, "التحقق من المستندات");
  });
});
