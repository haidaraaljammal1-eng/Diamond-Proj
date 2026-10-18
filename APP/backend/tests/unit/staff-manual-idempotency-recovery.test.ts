import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  canClearOrphanStaffManualIdempotencyKey,
  classifyStaffManualProviderInvocationPhase,
  staffManualIdempotencyInflightRef,
} from "src/modules/road-liabilities/staff-manual-idempotency-recovery";

describe("classifyStaffManualProviderInvocationPhase", () => {
  test("no customer charge is PROVEN_PRE_PROVIDER", async () => {
    const prisma = {
      roadLiability: {
        findUnique: async () => ({
          authoritativeSourceKey: "STAFF_MANUAL",
          collectionStatus: "OPEN",
          staffEnteredAt: null,
          confirmationStatus: "CONFIRMED",
        }),
      },
      roadLiabilityCustomerCharge: { findUnique: async () => null },
    };
    const phase = await classifyStaffManualProviderInvocationPhase(prisma as never, "liab-1");
    assert.equal(phase, "PROVEN_PRE_PROVIDER");
  });

  test("orphan clear allowed only before effect inflight marker", () => {
    const fp = "abc123";
    assert.equal(canClearOrphanStaffManualIdempotencyKey(fp, fp), true);
    assert.equal(canClearOrphanStaffManualIdempotencyKey(staffManualIdempotencyInflightRef(fp), fp), false);
  });

  test("off-session attempt row is POSSIBLY_SENT even without providerReference", async () => {
    const prisma = {
      roadLiability: {
        findUnique: async () => ({
          authoritativeSourceKey: "STAFF_MANUAL",
          collectionStatus: "OPEN",
          staffEnteredAt: null,
          confirmationStatus: "CONFIRMED",
        }),
      },
      roadLiabilityCustomerCharge: {
        findUnique: async () => ({ id: "charge-1", operationalState: "PROCESSING" }),
      },
      contractPayment: { findMany: async () => [] },
      contractPaymentOffSessionAttempt: {
        findMany: async () => [{ id: "a1", status: "PREPARING", providerReference: null }],
      },
    };
    const phase = await classifyStaffManualProviderInvocationPhase(prisma as never, "liab-1");
    assert.equal(phase, "POSSIBLY_SENT");
  });
});
