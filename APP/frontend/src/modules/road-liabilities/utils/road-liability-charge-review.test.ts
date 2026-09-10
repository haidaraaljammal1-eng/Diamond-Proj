import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { ApiRequestError } from "../../../infrastructure/api/errors.ts";
import { VIOLATIONS_CHARGE_PERMISSION } from "../road-liabilities.permissions.ts";
import type { RoadLiabilityDetailDto } from "../types/road-liabilities.types.ts";
import type { RoadLiabilityCustomerChargeReviewDto } from "../types/road-liability-charge-review.types.ts";
import {
  additionalChargePreview,
  buildConfirmChargePayload,
  chargeReviewErrorKey,
  deriveChargeReviewState,
  parseWholeAed,
  validateCustomerCharge,
} from "./road-liability-charge-review.ts";
import {
  applySimulatedChargeReview,
  buildRoadLiabilitiesSimulationOverlay,
  simulatedCustomerChargeReview,
  simulatedReconciliationForLiability,
} from "./road-liability-simulation.ts";
import { isGpsPredictionOnly } from "./road-liability-status.ts";

const en = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "../../../../messages/en.json"), "utf8"),
) as { RoadLiabilities: { charge: Record<string, unknown> } };
const ar = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "../../../../messages/ar.json"), "utf8"),
) as { RoadLiabilities: { charge: Record<string, unknown> } };

function detail(
  extra: Partial<RoadLiabilityDetailDto> = {},
): RoadLiabilityDetailDto {
  return {
    id: "rl-1",
    type: "rta_violation",
    source: "RTA",
    occurredAt: "2026-08-24T11:42:00.000Z",
    amount: 100,
    currency: "AED",
    confirmationStatus: "confirmed",
    attributionStatus: "matched",
    collectionStatus: "open",
    workState: "collectible",
    locationLabel: "SZR",
    gate: null,
    vehicle: {
      id: 1,
      displayName: "Mercedes-Benz S 580",
      plateNumber: "B 55221",
      primaryImageUrl: null,
      operationalStatus: "rented",
    },
    contract: { id: "c1", contractNumber: "DE-1", status: "REVIEW" },
    customer: { displayName: "Omar Al Maktoum" },
    prediction: { predictedByGps: false, confidence: null },
    authoritative: { confirmed: true, externalReference: "RTA-1" },
    confirmedAt: "2026-08-24T11:42:00.000Z",
    createdAt: "2026-08-24T11:42:00.000Z",
    updatedAt: "2026-08-24T11:42:00.000Z",
    provenance: [],
    ...extra,
  };
}

function review(
  extra: Partial<RoadLiabilityCustomerChargeReviewDto> = {},
): RoadLiabilityCustomerChargeReviewDto {
  return {
    state: "AVAILABLE",
    destination: "RECONCILIATION",
    officialAmount: 100,
    currency: "AED",
    suggestedCustomerChargeAmount: 100,
    minimumCustomerChargeAmount: 100,
    customerChargeAmount: null,
    adjustmentAmount: null,
    adjustmentReason: null,
    adjustmentNote: null,
    confirmedAt: null,
    reconciliationLineId: null,
    postCloseReceivableId: null,
    reasonCode: null,
    ...extra,
  };
}

function err(reason: string, code = "CONFLICT"): ApiRequestError {
  return new ApiRequestError({ code, message: "x", context: { reason } }, 409);
}

describe("customer charge review amounts", () => {
  it("parses whole AED only", () => {
    assert.equal(parseWholeAed("100"), 100);
    assert.equal(parseWholeAed("120"), 120);
    assert.equal(parseWholeAed("0"), null);
    assert.equal(parseWholeAed("12.5"), null);
    assert.equal(parseWholeAed(" 100 "), 100);
    assert.equal(parseWholeAed(""), null);
  });

  it("previews additional charge as customer minus official", () => {
    assert.equal(additionalChargePreview(100, 100), 0);
    assert.equal(additionalChargePreview(100, 120), 20);
  });

  it("defaults payload to customerChargeAmount only when equal", () => {
    const payload = buildConfirmChargePayload({
      officialAmount: 100,
      customerChargeAmount: 100,
      adjustmentReason: "Administration Fee",
      adjustmentNote: "",
    });
    assert.deepEqual(payload, { customerChargeAmount: 100 });
    assert.equal("officialAmount" in payload, false);
    assert.equal("adjustmentAmount" in payload, false);
  });

  it("includes reason and optional note only when needed", () => {
    const payload = buildConfirmChargePayload({
      officialAmount: 100,
      customerChargeAmount: 120,
      adjustmentReason: "Administration Fee",
      adjustmentNote: " desk note ",
    });
    assert.deepEqual(payload, {
      customerChargeAmount: 120,
      adjustmentReason: "Administration Fee",
      adjustmentNote: "desk note",
    });
  });

  it("rejects below minimum and requires reason on increase", () => {
    assert.equal(
      validateCustomerCharge({
        officialAmount: 100,
        minimumCustomerChargeAmount: 100,
        customerChargeAmount: 90,
        adjustmentReason: "",
      }).errorKey,
      "charge.belowOfficial",
    );
    assert.equal(
      validateCustomerCharge({
        officialAmount: 100,
        minimumCustomerChargeAmount: 100,
        customerChargeAmount: 120,
        adjustmentReason: "",
      }).errorKey,
      "charge.reasonRequired",
    );
    assert.equal(
      validateCustomerCharge({
        officialAmount: 100,
        minimumCustomerChargeAmount: 100,
        customerChargeAmount: 100,
        adjustmentReason: "",
      }).customerChargeAmount,
      100,
    );
  });
});

describe("charge review eligibility", () => {
  it("shows available review from the unified backend response", () => {
    const ui = deriveChargeReviewState({
      detail: detail(),
      review: review(),
      canCharge: true,
      loading: false,
    });
    assert.equal(ui.kind, "available");
    assert.equal(ui.destination, "RECONCILIATION");
    assert.equal(ui.review?.suggestedCustomerChargeAmount, 100);
    assert.equal(ui.review?.minimumCustomerChargeAmount, 100);
  });

  it("locks attached liabilities and does not expose review", () => {
    const ui = deriveChargeReviewState({
      detail: detail({ reconciliationAttached: true, customerCharge: { confirmed: true, destination: "RECONCILIATION" } }),
      review: review({
        state: "LOCKED",
        destination: "RECONCILIATION",
        customerChargeAmount: 120,
        adjustmentAmount: 20,
        adjustmentReason: "Administration Fee",
        reconciliationLineId: "line-1",
      }),
      canCharge: true,
      loading: false,
    });
    assert.equal(ui.kind, "locked");
    assert.equal(ui.destination, "RECONCILIATION");
    assert.equal(ui.review?.customerChargeAmount, 120);
  });

  it("never offers charge review for GPS pending, unmatched, or ambiguous", () => {
    const gps = deriveChargeReviewState({
      detail: detail({
        amount: null,
        confirmationStatus: "pending_confirmation",
        collectionStatus: "not_ready",
        workState: "awaiting_confirmation",
        prediction: { predictedByGps: true, confidence: "high" },
        authoritative: { confirmed: false, externalReference: null },
      }),
      review: review(),
      canCharge: true,
      loading: false,
    });
    assert.equal(gps.kind, "gps_pending");
    assert.equal(isGpsPredictionOnly(detail({
      amount: null,
      confirmationStatus: "pending_confirmation",
      collectionStatus: "not_ready",
      workState: "awaiting_confirmation",
      prediction: { predictedByGps: true, confidence: "high" },
      authoritative: { confirmed: false, externalReference: null },
    })), true);

    assert.equal(
      deriveChargeReviewState({
        detail: detail({ attributionStatus: "unmatched", workState: "needs_contract", contract: null }),
        review: review(),
        canCharge: true,
        loading: false,
      }).kind,
      "unmatched",
    );
    assert.equal(
      deriveChargeReviewState({
        detail: detail({ attributionStatus: "ambiguous", workState: "ambiguous_match", contract: null }),
        review: review(),
        canCharge: true,
        loading: false,
      }).kind,
      "ambiguous",
    );
  });

  it("uses post-close destination for CLOSED contracts and view-only without violations.charge", () => {
    const closed = deriveChargeReviewState({
      detail: detail({ contract: { id: "c1", contractNumber: "DE-1", status: "CLOSED" } }),
      review: review({ destination: "POST_CLOSE_RECEIVABLE" }),
      canCharge: true,
      loading: false,
    });
    assert.equal(closed.kind, "available");
    assert.equal(closed.destination, "POST_CLOSE_RECEIVABLE");
    assert.equal(
      deriveChargeReviewState({
        detail: detail(),
        review: review(),
        canCharge: false,
        loading: false,
      }).kind,
      "view_only",
    );
    assert.equal(VIOLATIONS_CHARGE_PERMISSION, "violations.charge");
  });
});

describe("charge review errors", () => {
  it("maps domain reasons without exposing raw codes", () => {
    assert.equal(chargeReviewErrorKey(err("ROAD_LIABILITY_ALREADY_CHARGED")), "charge.alreadyCharged");
    assert.equal(chargeReviewErrorKey(err("CUSTOMER_CHARGE_BELOW_OFFICIAL")), "charge.belowOfficial");
    assert.equal(chargeReviewErrorKey(err("ADJUSTMENT_REASON_REQUIRED")), "charge.reasonRequired");
    assert.equal(chargeReviewErrorKey(err("CONTRACT_CAR_IN_REQUIRED")), "charge.notEligible");
    assert.equal(
      chargeReviewErrorKey(new ApiRequestError({ code: "FORBIDDEN", message: "no" }, 403)),
      "charge.forbidden",
    );
    const charge = en.RoadLiabilities.charge;
    assert.equal(JSON.stringify(charge).includes("ROAD_LIABILITY_ALREADY_CHARGED"), false);
    assert.equal((charge.alreadyCharged as string).includes("ROAD_LIABILITY"), false);
  });
});

describe("AR and EN charge review labels", () => {
  it("uses official/customer/additional language", () => {
    assert.equal(en.RoadLiabilities.charge.section, "Customer Charge");
    assert.equal(en.RoadLiabilities.charge.officialAmount, "Official Amount");
    assert.equal(en.RoadLiabilities.charge.review, "Review Customer Charge");
    assert.equal(en.RoadLiabilities.charge.confirm, "Confirm Customer Charge");
    assert.equal(ar.RoadLiabilities.charge.section, "المبلغ على العميل");
    assert.equal(ar.RoadLiabilities.charge.officialAmount, "المبلغ الرسمي");
    assert.equal(ar.RoadLiabilities.charge.review, "مراجعة المبلغ على العميل");
    assert.equal(ar.RoadLiabilities.charge.confirm, "تثبيت المبلغ على العميل");
    assert.equal((ar.RoadLiabilities.charge.destinationPostClose as string).includes("مغلق"), true);
  });
});

describe("charge review UI wiring", () => {
  it("keeps mutations out of road-liabilities.api and in the charge API", () => {
    const listApi = readFileSync(path.join(import.meta.dirname, "../api/road-liabilities.api.ts"), "utf8");
    const chargeApi = readFileSync(path.join(import.meta.dirname, "../api/road-liability-charge.api.ts"), "utf8");
    assert.equal(/method:\s*"(POST|PUT|PATCH|DELETE)"/.test(listApi), false);
    assert.ok(chargeApi.includes("method: \"POST\""));
    assert.ok(chargeApi.includes("/customer-charge/confirm"));
    assert.equal(chargeApi.includes("officialAmount"), false);
    assert.equal(chargeApi.includes("adjustmentAmount"), false);
  });

  it("reviews from the drawer, not the table row", () => {
    const row = readFileSync(
      path.join(import.meta.dirname, "../components/road-liability-row/road-liability-row.tsx"),
      "utf8",
    );
    const detailUi = readFileSync(
      path.join(import.meta.dirname, "../components/road-liability-detail/road-liability-detail.tsx"),
      "utf8",
    );
    const section = readFileSync(
      path.join(
        import.meta.dirname,
        "../components/road-liability-charge-review/road-liability-charge-review-section.tsx",
      ),
      "utf8",
    );
    const dialog = readFileSync(
      path.join(
        import.meta.dirname,
        "../components/road-liability-charge-review/road-liability-charge-review-dialog.tsx",
      ),
      "utf8",
    );
    const hook = readFileSync(
      path.join(import.meta.dirname, "../hooks/use-road-liability-charge-review.ts"),
      "utf8",
    );
    assert.equal(row.includes("road-liability-charge-review"), false);
    assert.ok(detailUi.includes("RoadLiabilityChargeReviewSection"));
    assert.ok(detailUi.includes("RoadLiabilityChargeReviewDialog"));
    assert.ok(section.includes('data-testid="road-liability-charge-review"'));
    assert.ok(section.includes("canCharge"));
    assert.ok(dialog.includes("suggestedCustomerChargeAmount"));
    assert.ok(dialog.includes("officialPlate"));
    assert.equal(dialog.includes("name=\"officialAmount\""), false);
    assert.ok(dialog.includes("loading={submitting}"));
    assert.ok(dialog.includes("if (submitting) return"));
    assert.ok(hook.includes("getRoadLiabilityCustomerCharge"));
    assert.ok(hook.includes("simulated"));
    assert.ok(hook.includes("attachSimulated"));
    assert.ok(hook.includes("alreadyCharged"));
    assert.equal(hook.includes("for (const"), false);
  });

  it("does not add an ordinary edit after attachment", () => {
    const section = readFileSync(
      path.join(
        import.meta.dirname,
        "../components/road-liability-charge-review/road-liability-charge-review-section.tsx",
      ),
      "utf8",
    );
    assert.equal(section.includes("Edit Charge"), false);
    assert.equal(section.includes("Change Amount"), false);
    assert.ok(section.includes('"attached"'));
    assert.ok(section.includes("post-close"));
    assert.ok(section.includes("lockedAmount"));
  });
});

describe("simulated charge review", () => {
  it("treats confirmed RTA as available and GPS pending as unchargeable", () => {
    const overlay = buildRoadLiabilitiesSimulationOverlay();
    const rta = simulatedReconciliationForLiability(overlay, "sim-rl-rta-open");
    const gps = simulatedReconciliationForLiability(overlay, "sim-rl-gps-pending");
    const attached = simulatedReconciliationForLiability(overlay, "sim-rl-salik-violation");
    assert.equal(rta.available[0]?.officialAmount, 600);
    assert.equal(rta.available[0]?.suggestedCustomerChargeAmount, 600);
    assert.deepEqual(gps.available, []);
    assert.equal(attached.attached[0]?.locked, true);
    assert.equal(attached.attached[0]?.customerChargeAmount, 50);
    assert.equal(overlay.summary.confirmedOpenAmount, 758);
  });

  it("locks 600→720 locally without a backend write", () => {
    const overlay = buildRoadLiabilitiesSimulationOverlay();
    const next = applySimulatedChargeReview(overlay, "sim-rl-rta-open", {
      customerChargeAmount: 720,
      adjustmentReason: "Administration Fee",
    });
    const locked = next.attachedCharges["sim-rl-rta-open"];
    assert.equal(locked?.officialAmount, 600);
    assert.equal(locked?.adjustmentAmount, 120);
    assert.equal(locked?.customerChargeAmount, 720);
    assert.equal(locked?.adjustmentReason, "Administration Fee");
    assert.equal(next.items.find((item) => item.id === "sim-rl-rta-open")?.reconciliationAttached, true);
    const gps = applySimulatedChargeReview(overlay, "sim-rl-gps-pending", {
      customerChargeAmount: 120,
      adjustmentReason: "Administration Fee",
    });
    assert.equal(gps.attachedCharges["sim-rl-gps-pending"], undefined);
    const reset = buildRoadLiabilitiesSimulationOverlay();
    assert.equal(reset.attachedCharges["sim-rl-rta-open"], undefined);
    assert.ok(reset.attachedCharges["sim-rl-salik-violation"]);
  });

  it("routes late CLOSED liabilities to post-close and never charges GPS predictions", () => {
    const overlay = buildRoadLiabilitiesSimulationOverlay();
    const late = overlay.details["sim-rl-late-rta"];
    const gpsOnly = overlay.details["sim-rl-gps-pending"];
    const lateSalik = overlay.details["sim-rl-late-salik-gps"];
    assert.ok(late);
    assert.ok(gpsOnly);
    assert.ok(lateSalik);
    assert.equal(late.contract?.status, "CLOSED");
    assert.equal(late.workState, "collectible");
    const lateReview = simulatedCustomerChargeReview(overlay, late);
    assert.equal(lateReview.destination, "POST_CLOSE_RECEIVABLE");
    assert.equal(lateReview.state, "AVAILABLE");
    const gpsReview = simulatedCustomerChargeReview(overlay, gpsOnly);
    assert.equal(gpsReview.state, "NOT_ELIGIBLE");
    const charged = applySimulatedChargeReview(overlay, "sim-rl-late-rta", {
      customerChargeAmount: 120,
      adjustmentReason: "Administration Fee",
    });
    const locked = simulatedCustomerChargeReview(charged, charged.details["sim-rl-late-rta"]!);
    assert.equal(locked.state, "LOCKED");
    assert.equal(locked.destination, "POST_CLOSE_RECEIVABLE");
    assert.ok(locked.postCloseReceivableId);
    assert.equal(locked.reconciliationLineId, null);
    assert.equal(charged.summary.confirmedOpenAmount, overlay.summary.confirmedOpenAmount);
    const afterGpsConfirm = applySimulatedChargeReview(overlay, "sim-rl-late-salik-gps", {
      customerChargeAmount: 4,
    });
    const lockedSalik = simulatedCustomerChargeReview(
      afterGpsConfirm,
      afterGpsConfirm.details["sim-rl-late-salik-gps"]!,
    );
    assert.equal(lockedSalik.destination, "POST_CLOSE_RECEIVABLE");
  });
});
