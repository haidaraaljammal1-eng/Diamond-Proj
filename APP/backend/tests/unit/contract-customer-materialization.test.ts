import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canMaterializeContractCustomer } from "src/modules/contracts/contract-customer-materialization";

describe("canMaterializeContractCustomer", () => {
  it("returns true when a Customer is already linked", () => {
    assert.equal(
      canMaterializeContractCustomer({ customerId: 42, snapshot: null }),
      true,
    );
  });

  it("returns true when the signed snapshot contains hirer identity", () => {
    assert.equal(
      canMaterializeContractCustomer({
        customerId: null,
        snapshot: {
          customer: {
            name: "Test Hirer",
            mobile: "+971500000000",
            email: null,
            nationality: "AE",
            identityNumber: null,
            passportNumber: "P123",
            drivingLicenseNumber: "DL123",
            drivingLicenseExpiry: "2099-12-31",
            address: "Dubai",
          },
        },
      }),
      true,
    );
  });

  it("returns false when no Customer and snapshot cannot materialize", () => {
    assert.equal(
      canMaterializeContractCustomer({ customerId: null, snapshot: null }),
      false,
    );
  });
});
