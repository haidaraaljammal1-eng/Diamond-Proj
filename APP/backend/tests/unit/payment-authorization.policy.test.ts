import assert from "node:assert/strict";
import { test } from "node:test";
import {
  loadRentalAuthorizationState,
  rentalPaymentAuthorizationState,
} from "src/modules/contracts/payment/payment-authorization.policy";
import { canCarOutFromState } from "src/modules/contracts/vehicle-rental-guard";

test("rentalPaymentAuthorizationState is informational and separate from payment confirmation", () => {
  assert.equal(
    rentalPaymentAuthorizationState(
      {
        savePaymentMethodForFutureUse: true,
        status: "CONFIRMED",
        contract: { collectionMode: "ELECTRONIC" },
      },
      false,
    ),
    "incomplete",
  );
  assert.equal(
    rentalPaymentAuthorizationState(
      {
        savePaymentMethodForFutureUse: true,
        status: "CONFIRMED",
        contract: { collectionMode: "ELECTRONIC" },
      },
      true,
    ),
    "complete",
  );
  assert.equal(
    rentalPaymentAuthorizationState(
      {
        savePaymentMethodForFutureUse: true,
        status: "PROCESSING",
        contract: { collectionMode: "ELECTRONIC" },
      },
      false,
    ),
    "pending",
  );
  assert.equal(
    rentalPaymentAuthorizationState(
      {
        savePaymentMethodForFutureUse: false,
        status: "CONFIRMED",
        contract: { collectionMode: "ELECTRONIC" },
      },
      false,
    ),
    "not_required",
  );
});

test("Car-Out eligibility does not depend on saved-card authorization state", () => {
  const eligible = canCarOutFromState({
    status: "PAID",
    vehicleId: 1,
    vehicleActive: true,
    vehicleStatus: "AVAILABLE",
    hasCarOut: false,
    hasConflictingContract: false,
  });
  assert.equal(eligible, true);
});

test("loadRentalAuthorizationState returns incomplete when consent payment lacks authorization row", async () => {
  const state = await loadRentalAuthorizationState(
    {
      contractPayment: {
        findUnique: async () => ({
          savePaymentMethodForFutureUse: true,
          status: "CONFIRMED",
          contract: { collectionMode: "ELECTRONIC" },
        }),
      },
      contractPaymentAuthorization: {
        findUnique: async () => null,
      },
    } as never,
    "pay-1",
  );
  assert.equal(state, "incomplete");
});
