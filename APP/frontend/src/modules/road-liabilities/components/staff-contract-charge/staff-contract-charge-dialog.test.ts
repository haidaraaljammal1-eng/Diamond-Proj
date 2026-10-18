import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  createStaffChargeDialogResetState,
  isStaffChargeReferenceValid,
  parseStaffChargeReference,
  parseWholeAed,
  shouldAutoCloseStaffChargeDialog,
  shouldClearStaffChargeInputsAfterOutcome,
  shouldShowSuccessHighlight,
  staffChargeOutcomeMessageKey,
  staffChargeSuccessMessageKey,
  staffChargeReferenceLabelKey,
  staffChargeReferenceRequiredKey,
  isStaffChargeSuccessPendingClose,
  STAFF_CHARGE_SUCCESS_CLOSE_MS,
} from "./staff-contract-charge-dialog.logic.ts";

describe("staff charge amount parsing", () => {
  test("accepts positive whole AED amounts", () => {
    assert.equal(parseWholeAed("150"), 150);
    assert.equal(parseWholeAed("1,200"), 1200);
  });

  test("rejects decimals, zero, and non-numeric input", () => {
    assert.equal(parseWholeAed("0"), null);
    assert.equal(parseWholeAed("12.5"), null);
    assert.equal(parseWholeAed("abc"), null);
  });
});

describe("staff charge reference validation", () => {
  test("trims edges only and preserves leading zeros", () => {
    assert.equal(parseStaffChargeReference("  000987  "), "000987");
    assert.equal(isStaffChargeReferenceValid("  000987  "), true);
  });

  test("rejects empty and whitespace-only references", () => {
    assert.equal(isStaffChargeReferenceValid(""), false);
    assert.equal(isStaffChargeReferenceValid("   "), false);
  });
});

describe("staff charge dialog outcome UX", () => {
  test("auto-close and success highlight apply only to succeeded", () => {
    assert.equal(shouldAutoCloseStaffChargeDialog("succeeded"), true);
    assert.equal(shouldShowSuccessHighlight("succeeded"), true);
    assert.equal(shouldAutoCloseStaffChargeDialog("processing"), false);
    assert.equal(shouldAutoCloseStaffChargeDialog("failed"), false);
    assert.equal(shouldAutoCloseStaffChargeDialog("requires_action"), false);
    assert.equal(shouldShowSuccessHighlight("processing"), false);
  });

  test("uses category-specific success message keys", () => {
    assert.equal(staffChargeSuccessMessageKey("TRAFFIC_VIOLATION"), "resultSuccessTraffic");
    assert.equal(staffChargeSuccessMessageKey("SALIK"), "resultSuccessSalik");
  });

  test("uses category-specific reference label and required keys", () => {
    assert.equal(staffChargeReferenceLabelKey("TRAFFIC_VIOLATION"), "referenceLabelTraffic");
    assert.equal(staffChargeReferenceLabelKey("SALIK"), "referenceLabelSalik");
    assert.equal(staffChargeReferenceRequiredKey("TRAFFIC_VIOLATION"), "referenceRequiredTraffic");
    assert.equal(staffChargeReferenceRequiredKey("SALIK"), "referenceRequiredSalik");
  });

  test("success pending close shows banner-only state", () => {
    assert.equal(isStaffChargeSuccessPendingClose(true, "ok"), true);
    assert.equal(isStaffChargeSuccessPendingClose(true, null), false);
    assert.equal(isStaffChargeSuccessPendingClose(false, "processing"), false);
  });

  test("success auto-close delay is exactly two seconds", () => {
    assert.equal(STAFF_CHARGE_SUCCESS_CLOSE_MS, 2000);
  });

  test("processing with awaiting_provider uses dedicated message key", () => {
    assert.equal(staffChargeOutcomeMessageKey("processing", "awaiting_provider"), "resultAwaitingProvider");
    assert.equal(staffChargeOutcomeMessageKey("blocked", "manual_review"), "resultManualReview");
  });

  test("definitive failure clears reference and amount inputs", () => {
    assert.equal(shouldClearStaffChargeInputsAfterOutcome("failed"), true);
    assert.equal(shouldClearStaffChargeInputsAfterOutcome("processing"), false);
    assert.equal(shouldClearStaffChargeInputsAfterOutcome("succeeded"), false);
  });

  test("reopen reset state is fully clean", () => {
    const reset = createStaffChargeDialogResetState();
    assert.equal(reset.category, "TRAFFIC_VIOLATION");
    assert.equal(reset.referenceRaw, "");
    assert.equal(reset.amountRaw, "");
    assert.equal(reset.confirming, false);
    assert.equal(reset.submitting, false);
    assert.equal(reset.error, null);
    assert.equal(reset.resultMessage, null);
    assert.equal(reset.successHighlight, false);
    assert.equal(reset.referenceError, null);
  });
});
