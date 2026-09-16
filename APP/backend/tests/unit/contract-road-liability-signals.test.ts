import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_ROAD_LIABILITY_SIGNALS,
  foldSalikGpsSignals,
} from "src/modules/contracts/contract-road-liability-signals";

describe("foldSalikGpsSignals", () => {
  it("is false when no GPS Salik prediction exists", () => {
    const map = foldSalikGpsSignals(["c1"], []);
    assert.deepEqual(map.get("c1"), EMPTY_ROAD_LIABILITY_SIGNALS);
  });

  it("marks a GPS crossing prediction as an informational historical signal", () => {
    const at = new Date("2026-09-02T10:31:00.000Z");
    const map = foldSalikGpsSignals(["c1"], [
      {
        attributedContractId: "c1",
        confirmationStatus: "PENDING_CONFIRMATION",
        occurredAt: at,
      },
    ]);
    assert.deepEqual(map.get("c1"), {
      hasSalikGpsSignal: true,
      salikGpsSignalCount: 1,
      unconfirmedSalikGpsSignalCount: 1,
      latestSalikGpsSignalAt: at,
    });
  });

  it("keeps historical GPS detection after official confirmation", () => {
    const first = new Date("2026-09-02T10:31:00.000Z");
    const later = new Date("2026-09-02T11:00:00.000Z");
    const map = foldSalikGpsSignals(["c1"], [
      {
        attributedContractId: "c1",
        confirmationStatus: "CONFIRMED",
        occurredAt: first,
      },
      {
        attributedContractId: "c1",
        confirmationStatus: "PENDING_CONFIRMATION",
        occurredAt: later,
      },
    ]);
    const signal = map.get("c1");
    assert.equal(signal?.hasSalikGpsSignal, true);
    assert.equal(signal?.salikGpsSignalCount, 2);
    assert.equal(signal?.unconfirmedSalikGpsSignalCount, 1);
    assert.equal(signal?.latestSalikGpsSignalAt?.toISOString(), later.toISOString());
  });

  it("ignores rows attributed to another contract", () => {
    const map = foldSalikGpsSignals(["c1"], [
      {
        attributedContractId: "other",
        confirmationStatus: "PENDING_CONFIRMATION",
        occurredAt: new Date(),
      },
    ]);
    assert.equal(map.get("c1")?.hasSalikGpsSignal, false);
  });
});
