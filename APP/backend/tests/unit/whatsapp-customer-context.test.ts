import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pickActiveWhatsAppCustomerContract,
  pickLatestWhatsAppCustomerContract,
} from "src/modules/whatsapp/whatsapp.customer-context";

describe("whatsapp customer context contract pickers", () => {
  const base = {
    contractNumber: "C-1",
    endAt: new Date("2026-10-20T12:00:00.000Z"),
    vehicle: { vehicleName: "Sedan", plateNumber: "A 1" },
    company: { code: "ELITE", displayName: "Elite" },
  };

  it("prefers ACTIVE over PAID and RETOUT", () => {
    const rows = [
      { id: "1", status: "PAID" as const, createdAt: new Date("2026-10-01"), ...base },
      { id: "2", status: "ACTIVE" as const, createdAt: new Date("2026-10-02"), ...base },
      { id: "3", status: "RETOUT" as const, createdAt: new Date("2026-10-03"), ...base },
    ];
    const picked = pickActiveWhatsAppCustomerContract(rows);
    assert.equal(picked?.id, "2");
  });

  it("returns null when no blocking contract exists", () => {
    const rows = [
      {
        id: "1",
        status: "CLOSED" as const,
        createdAt: new Date("2026-10-01"),
        ...base,
      },
    ];
    assert.equal(pickActiveWhatsAppCustomerContract(rows), null);
  });

  it("picks the most recently created contract as latest", () => {
    const rows = [
      { id: "1", status: "CLOSED" as const, createdAt: new Date("2026-10-01"), ...base },
      { id: "2", status: "REVIEW" as const, createdAt: new Date("2026-10-05"), ...base },
    ];
    assert.equal(pickLatestWhatsAppCustomerContract(rows)?.id, "2");
  });
});
