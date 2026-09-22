import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractStrongIdentity,
  canMaterializeContractCustomer,
} from "src/modules/contracts/contract-customer-materialization";
import { stripeLivemodeFromSecret } from "src/modules/contracts/payment/stripe-account-identity";
import {
  stripeCheckoutIdempotencyKey,
  stripeCustomerIdempotencyKey,
} from "src/modules/contracts/payment/stripe-payment-profile.service";

describe("extractStrongIdentity", () => {
  it("normalizes strong identifiers and ignores weak-only input", () => {
    const strong = extractStrongIdentity({
      identityNumber: "  EM-123  ",
      passportNumber: null,
      drivingLicenseNumber: "DL-999",
    });
    assert.equal(strong.identityNumber, "em-123");
    assert.equal(strong.drivingLicenseNumber, "dl-999");
  });
});

describe("canMaterializeContractCustomer", () => {
  it("requires passport or license in snapshot when customerId is null", () => {
    assert.equal(
      canMaterializeContractCustomer({
        customerId: null,
        snapshot: {
          customer: {
            name: "Test",
            mobile: "+971500000000",
            drivingLicenseNumber: "DL1",
            drivingLicenseExpiry: "2099-12-31",
            passportNumber: "P1",
          },
        },
      }),
      true,
    );
  });
});

describe("stripe idempotency keys", () => {
  it("uses deterministic provider keys", () => {
    assert.equal(stripeCustomerIdempotencyKey("prof_1"), "diamond:stripe-customer-profile:prof_1:v1");
    assert.equal(stripeCheckoutIdempotencyKey("pay_1"), "diamond:checkout:pay_1:v1");
  });
});

describe("stripe livemode isolation", () => {
  it("detects test vs live secret prefixes", () => {
    assert.equal(stripeLivemodeFromSecret("sk_test_abc"), false);
    assert.equal(stripeLivemodeFromSecret("sk_live_abc"), true);
  });
});
