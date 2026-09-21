import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RtaUnconfiguredProvider } from "src/modules/road-liabilities/providers/rta-unconfigured.provider";
import { SalikUnconfiguredProvider } from "src/modules/road-liabilities/providers/salik-unconfigured.provider";
import { createRtaProvider, createSalikProvider } from "src/modules/road-liabilities/road-liability.provider";
import {
  buildRoadLiabilityChargeProposal,
  deriveCollectionStatus,
  deriveWorkState,
  isChargeableRoadLiability,
  resolveRoadLiabilityCompany,
} from "src/modules/road-liabilities/road-liability.mapper";
import { attributeCustodyWindows } from "src/modules/road-liabilities/matching/contract-attribution.service";
import {
  buildGpsInferenceFingerprint,
  buildIngestionFingerprint,
} from "src/modules/road-liabilities/road-liability.fingerprint";
import { detectGateCrossing } from "src/modules/road-liabilities/inference/salik-crossing-detector";
import type { GateGeometry } from "src/modules/road-liabilities/inference/salik-crossing-detector";

const GATE: GateGeometry = {
  id: "test-gate",
  nameEn: "Test Gate",
  nameAr: "بوابة اختبار",
  lineStartLatitude: 25.0,
  lineStartLongitude: 55.0,
  lineEndLatitude: 25.001,
  lineEndLongitude: 55.0,
  corridorMeters: 30,
  allowedHeadingDegrees: null,
  headingToleranceDegrees: null,
};

const T0 = new Date("2026-09-10T08:00:00.000Z");
const T1 = new Date("2026-09-10T08:00:10.000Z");

describe("road liability providers", () => {
  it("boots with RTA and Salik unconfigured and no guessed network behaviour", () => {
    const rta = createRtaProvider();
    const salik = createSalikProvider();
    assert.equal(rta.configured, false);
    assert.equal(salik.configured, false);
    assert.equal(new RtaUnconfiguredProvider().name, "RTA");
    assert.equal(new SalikUnconfiguredProvider().name, "SALIK");
  });
});

describe("isChargeableRoadLiability", () => {
  const base = {
    confirmationStatus: "CONFIRMED" as const,
    attributionStatus: "MATCHED" as const,
    attributedContractId: "c1",
    amount: 400,
    collectionStatus: "OPEN" as const,
  };

  it("is chargeable only when confirmed, matched, attributed, valid amount, and OPEN", () => {
    assert.equal(isChargeableRoadLiability(base), true);
  });

  it("is not chargeable when unmatched", () => {
    assert.equal(
      isChargeableRoadLiability({ ...base, attributionStatus: "UNMATCHED", attributedContractId: null }),
      false,
    );
  });

  it("is not chargeable for a GPS prediction (pending + not_ready, no amount)", () => {
    assert.equal(
      isChargeableRoadLiability({
        confirmationStatus: "PENDING_CONFIRMATION",
        attributionStatus: "MATCHED",
        attributedContractId: "c1",
        amount: null,
        collectionStatus: "NOT_READY",
      }),
      false,
    );
  });
});

describe("buildRoadLiabilityChargeProposal", () => {
  it("defaults suggested and minimum customer charge to the official amount", () => {
    assert.deepEqual(buildRoadLiabilityChargeProposal({ amount: 100 }), {
      officialAmount: 100,
      suggestedCustomerChargeAmount: 100,
      minimumCustomerChargeAmount: 100,
    });
  });
});

describe("deriveWorkState", () => {
  const chargeable = {
    confirmationStatus: "CONFIRMED" as const,
    attributionStatus: "MATCHED" as const,
    attributedContractId: "c1",
    amount: 400,
    collectionStatus: "OPEN" as const,
  };

  it("derives COLLECTIBLE from the centralized chargeable helper", () => {
    assert.equal(isChargeableRoadLiability(chargeable), true);
    assert.equal(deriveWorkState(chargeable), "COLLECTIBLE");
  });

  it("derives AWAITING_CONFIRMATION for pending confirmation", () => {
    assert.equal(
      deriveWorkState({
        ...chargeable,
        confirmationStatus: "PENDING_CONFIRMATION",
        amount: null,
        collectionStatus: "NOT_READY",
      }),
      "AWAITING_CONFIRMATION",
    );
  });

  it("derives NEEDS_CONTRACT for unmatched attribution", () => {
    assert.equal(
      deriveWorkState({
        ...chargeable,
        attributionStatus: "UNMATCHED",
        attributedContractId: null,
        collectionStatus: "NOT_READY",
      }),
      "NEEDS_CONTRACT",
    );
  });

  it("derives AMBIGUOUS_MATCH for ambiguous attribution", () => {
    assert.equal(
      deriveWorkState({
        ...chargeable,
        attributionStatus: "AMBIGUOUS",
        attributedContractId: null,
        collectionStatus: "NOT_READY",
      }),
      "AMBIGUOUS_MATCH",
    );
  });

  it("derives ATTRIBUTION_PENDING for unresolved attribution", () => {
    assert.equal(
      deriveWorkState({
        ...chargeable,
        attributionStatus: "UNRESOLVED",
        attributedContractId: null,
        collectionStatus: "NOT_READY",
      }),
      "ATTRIBUTION_PENDING",
    );
  });

  it("derives DISPUTED from collection status", () => {
    assert.equal(deriveWorkState({ ...chargeable, collectionStatus: "DISPUTED" }), "DISPUTED");
  });

  it("SETTLED takes precedence over confirmation and attribution", () => {
    assert.equal(
      deriveWorkState({
        confirmationStatus: "PENDING_CONFIRMATION",
        attributionStatus: "UNMATCHED",
        attributedContractId: null,
        amount: null,
        collectionStatus: "SETTLED",
      }),
      "SETTLED",
    );
  });

  it("REJECTED takes precedence over disputed and pending confirmation", () => {
    assert.equal(
      deriveWorkState({
        confirmationStatus: "REJECTED",
        attributionStatus: "MATCHED",
        attributedContractId: "c1",
        amount: 400,
        collectionStatus: "DISPUTED",
      }),
      "REJECTED",
    );
  });

  it("VOID takes precedence over rejected", () => {
    assert.equal(
      deriveWorkState({
        confirmationStatus: "REJECTED",
        attributionStatus: "UNMATCHED",
        attributedContractId: null,
        amount: null,
        collectionStatus: "VOID",
      }),
      "VOID",
    );
  });
});

describe("deriveCollectionStatus", () => {
  it("opens collection only after authoritative confirmation + match + amount", () => {
    assert.equal(
      deriveCollectionStatus({
        confirmationStatus: "PENDING_CONFIRMATION",
        attributionStatus: "MATCHED",
        attributedContractId: "c1",
        amount: null,
      }),
      "NOT_READY",
    );
    assert.equal(
      deriveCollectionStatus({
        confirmationStatus: "CONFIRMED",
        attributionStatus: "MATCHED",
        attributedContractId: "c1",
        amount: 6,
      }),
      "OPEN",
    );
  });
});

describe("attributeCustodyWindows", () => {
  const out = new Date("2026-09-01T08:00:00.000Z");
  const inn = new Date("2026-09-05T08:00:00.000Z");

  it("matches an event strictly inside Car-Out → Car-In", () => {
    const result = attributeCustodyWindows(
      [{ contractId: "a", carOutAt: out, carInAt: inn }],
      new Date("2026-09-03T12:00:00.000Z"),
    );
    assert.deepEqual(result, { status: "MATCHED", contractId: "a" });
  });

  it("does not match an event before Car-Out", () => {
    const result = attributeCustodyWindows(
      [{ contractId: "a", carOutAt: out, carInAt: inn }],
      new Date("2026-09-01T07:59:00.000Z"),
    );
    assert.equal(result.status, "UNMATCHED");
  });

  it("does not match an event at or after Car-In", () => {
    const result = attributeCustodyWindows(
      [{ contractId: "a", carOutAt: out, carInAt: inn }],
      inn,
    );
    assert.equal(result.status, "UNMATCHED");
  });

  it("matches a historical window even if the caller would consider the contract closed", () => {
    const result = attributeCustodyWindows(
      [{ contractId: "closed", carOutAt: out, carInAt: inn }],
      new Date("2026-09-04T00:00:00.000Z"),
    );
    assert.deepEqual(result, { status: "MATCHED", contractId: "closed" });
  });

  it("is ambiguous when more than one custody window matches", () => {
    const result = attributeCustodyWindows(
      [
        { contractId: "a", carOutAt: out, carInAt: null },
        { contractId: "b", carOutAt: new Date("2026-09-02T08:00:00.000Z"), carInAt: null },
      ],
      new Date("2026-09-04T00:00:00.000Z"),
    );
    assert.equal(result.status, "AMBIGUOUS");
  });

  it("ignores scheduled rental dates because they are not custody windows", () => {
    const result = attributeCustodyWindows([], new Date("2026-09-03T12:00:00.000Z"));
    assert.equal(result.status, "UNMATCHED");
  });
});

describe("ingestion fingerprints", () => {
  it("keeps distinct events with different external ids or timestamps", () => {
    const a = buildIngestionFingerprint({
      sourceKey: "SALIK",
      eventType: "SALIK_TOLL",
      externalEventId: "e1",
      occurredAt: T0,
      amount: 4,
    });
    const b = buildIngestionFingerprint({
      sourceKey: "SALIK",
      eventType: "SALIK_TOLL",
      externalEventId: "e2",
      occurredAt: T0,
      amount: 4,
    });
    assert.notEqual(a, b);
  });

  it("is stable for the same GPS crossing bucket", () => {
    const a = buildGpsInferenceFingerprint({ vehicleId: 1, gateId: "g", occurredAt: T0 });
    const b = buildGpsInferenceFingerprint({
      vehicleId: 1,
      gateId: "g",
      occurredAt: new Date(T0.getTime() + 30_000),
    });
    assert.equal(a, b);
  });
});

describe("salik crossing detector", () => {
  it("detects a real eastward segment crossing of a north-south gate line", () => {
    const hit = detectGateCrossing(
      { latitude: 25.0005, longitude: 54.999, capturedAt: T0, headingDegrees: 90 },
      { latitude: 25.0005, longitude: 55.001, capturedAt: T1, headingDegrees: 90 },
      GATE,
    );
    assert.ok(hit);
    assert.equal(hit.gateId, "test-gate");
    assert.equal(hit.confidence, "HIGH");
  });

  it("does not treat nearby travel that never crosses the line as a crossing", () => {
    const hit = detectGateCrossing(
      { latitude: 25.0005, longitude: 55.0008, capturedAt: T0, headingDegrees: 90 },
      { latitude: 25.0005, longitude: 55.002, capturedAt: T1, headingDegrees: 90 },
      GATE,
    );
    assert.equal(hit, null);
  });

  it("does not invent a direction rule when gate heading metadata is absent", () => {
    const westward = detectGateCrossing(
      { latitude: 25.0005, longitude: 55.001, capturedAt: T0, headingDegrees: 270 },
      { latitude: 25.0005, longitude: 54.999, capturedAt: T1, headingDegrees: 270 },
      GATE,
    );
    assert.ok(westward);
  });

  it("applies heading only when verified gate direction exists", () => {
    const directed = { ...GATE, allowedHeadingDegrees: 90, headingToleranceDegrees: 30 };
    const east = detectGateCrossing(
      { latitude: 25.0005, longitude: 54.999, capturedAt: T0, headingDegrees: 90 },
      { latitude: 25.0005, longitude: 55.001, capturedAt: T1, headingDegrees: 90 },
      directed,
    );
    const west = detectGateCrossing(
      { latitude: 25.0005, longitude: 55.001, capturedAt: T0, headingDegrees: 270 },
      { latitude: 25.0005, longitude: 54.999, capturedAt: T1, headingDegrees: 270 },
      directed,
    );
    assert.ok(east);
    assert.equal(west, null);
  });
});

describe("road liability operating company", () => {
  const UNIQUE = { id: 1, code: "UNIQUE", displayName: "UNIQUE", accentColor: "#C9A15C" };
  const ELITE = { id: 2, code: "ELITE", displayName: "ELITE", accentColor: "#3E5C76" };

  it("reads the attributed Contract company when there is one", () => {
    assert.equal(
      resolveRoadLiabilityCompany({
        attributedContract: { company: UNIQUE },
        vehicle: { company: UNIQUE },
      }),
      UNIQUE,
    );
    assert.equal(
      resolveRoadLiabilityCompany({
        attributedContract: { company: ELITE },
        vehicle: { company: ELITE },
      }),
      ELITE,
    );
  });

  it("falls back to the Vehicle company only when there is no Contract", () => {
    assert.equal(
      resolveRoadLiabilityCompany({ attributedContract: null, vehicle: { company: UNIQUE } }),
      UNIQUE,
    );
    assert.equal(
      resolveRoadLiabilityCompany({ attributedContract: null, vehicle: { company: ELITE } }),
      ELITE,
    );
  });

  it("lets the Contract win when the Contract and the Vehicle disagree", () => {
    assert.equal(
      resolveRoadLiabilityCompany({
        attributedContract: { company: ELITE },
        vehicle: { company: UNIQUE },
      }),
      ELITE,
    );
  });

  it("leaves an unmatched liability company-less instead of defaulting to UNIQUE", () => {
    assert.equal(
      resolveRoadLiabilityCompany({ attributedContract: null, vehicle: null }),
      null,
    );
  });
});
