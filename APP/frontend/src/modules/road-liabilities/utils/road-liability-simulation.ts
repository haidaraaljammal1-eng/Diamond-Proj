import type {
  RoadLiabilityDetailDto,
  RoadLiabilityListItemDto,
  RoadLiabilityProvenanceDto,
  RoadLiabilitySummaryDto,
} from "../types/road-liabilities.types.ts";
import type {
  ConfirmRoadLiabilityChargePayload,
  ReconciliationRoadLiabilitiesDto,
  ReconciliationRoadLiabilityAttachedDto,
  RoadLiabilityCustomerChargeReviewDto,
} from "../types/road-liability-charge-review.types.ts";
import { additionalChargePreview } from "./road-liability-charge-review.ts";
import { isGpsPredictionOnly, SIMULATED_ROAD_LIABILITY_PREFIX } from "./road-liability-status.ts";

export interface SimulatedRoadLiabilitiesOverlay {
  summary: RoadLiabilitySummaryDto;
  items: RoadLiabilityListItemDto[];
  details: Record<string, RoadLiabilityDetailDto>;
  attachedCharges: Record<string, ReconciliationRoadLiabilityAttachedDto>;
}

const BMW: RoadLiabilityListItemDto["vehicle"] = {
  id: 900001,
  displayName: "BMW 730Li",
  plateNumber: "A 12345",
  primaryImageUrl: null,
  operationalStatus: "rented",
};

const MERCEDES: RoadLiabilityListItemDto["vehicle"] = {
  id: 900002,
  displayName: "Mercedes-Benz S 580",
  plateNumber: "B 55221",
  primaryImageUrl: null,
  operationalStatus: "rented",
};

const RANGE: RoadLiabilityListItemDto["vehicle"] = {
  id: 900003,
  displayName: "Range Rover Vogue",
  plateNumber: "C 90110",
  primaryImageUrl: null,
  operationalStatus: "available",
};

const CONTRACT_A: RoadLiabilityListItemDto["contract"] = {
  id: "sim-contract-a",
  contractNumber: "DE-2026-0817-114",
  status: "REVIEW",
};

const CONTRACT_B: RoadLiabilityListItemDto["contract"] = {
  id: "sim-contract-b",
  contractNumber: "DE-2026-0817-113",
  status: "REVIEW",
};

const CONTRACT_CLOSED: RoadLiabilityListItemDto["contract"] = {
  id: "sim-contract-closed",
  contractNumber: "DE-2026-0801-088",
  status: "CLOSED",
};

const CUSTOMER_A: RoadLiabilityListItemDto["customer"] = {
  displayName: "Demo Customer",
};

const CUSTOMER_B: RoadLiabilityListItemDto["customer"] = {
  displayName: "Omar Al Maktoum",
};

const GATE_BARSHA: NonNullable<RoadLiabilityListItemDto["gate"]> = {
  id: "sim-gate-barsha",
  networkKey: "SALIK",
  nameEn: "Al Barsha",
  nameAr: "البرشاء",
  externalGateCode: "SB",
};

function item(
  partial: RoadLiabilityListItemDto,
): RoadLiabilityListItemDto {
  return partial;
}

function provenance(
  partial: RoadLiabilityProvenanceDto,
): RoadLiabilityProvenanceDto {
  return partial;
}

function detailFrom(
  row: RoadLiabilityListItemDto,
  extra: Pick<RoadLiabilityDetailDto, "confirmedAt" | "createdAt" | "updatedAt" | "provenance">,
): RoadLiabilityDetailDto {
  return { ...row, ...extra };
}

/** Frontend-only demo overlay. Never posted to Backend. */
export function buildRoadLiabilitiesSimulationOverlay(
  now: Date = new Date("2026-09-10T10:40:00.000Z"),
): SimulatedRoadLiabilitiesOverlay {
  const gpsPending = item({
    id: `${SIMULATED_ROAD_LIABILITY_PREFIX}gps-pending`,
    type: "salik_toll",
    source: null,
    occurredAt: "2026-09-10T10:31:00.000Z",
    amount: null,
    currency: null,
    confirmationStatus: "pending_confirmation",
    attributionStatus: "matched",
    collectionStatus: "not_ready",
    workState: "awaiting_confirmation",
    locationLabel: "Al Barsha · Dubai",
    gate: GATE_BARSHA,
    vehicle: BMW,
    contract: CONTRACT_A,
    customer: CUSTOMER_A,
    prediction: { predictedByGps: true, confidence: "high" },
    authoritative: { confirmed: false, externalReference: null },
  });

  const gpsThenSalik = item({
    id: `${SIMULATED_ROAD_LIABILITY_PREFIX}gps-salik`,
    type: "salik_toll",
    source: "SALIK",
    occurredAt: "2026-09-10T10:31:00.000Z",
    amount: 4,
    currency: "AED",
    confirmationStatus: "confirmed",
    attributionStatus: "matched",
    collectionStatus: "open",
    workState: "collectible",
    locationLabel: "Al Barsha · Dubai",
    gate: GATE_BARSHA,
    vehicle: BMW,
    contract: CONTRACT_A,
    customer: CUSTOMER_A,
    prediction: { predictedByGps: true, confidence: "high" },
    authoritative: { confirmed: true, externalReference: "SAL-88219" },
  });

  const rtaOpen = item({
    id: `${SIMULATED_ROAD_LIABILITY_PREFIX}rta-open`,
    type: "rta_violation",
    source: "RTA",
    occurredAt: "2026-08-24T11:42:00.000Z",
    amount: 600,
    currency: "AED",
    confirmationStatus: "confirmed",
    attributionStatus: "matched",
    collectionStatus: "open",
    workState: "collectible",
    locationLabel: "Sheikh Zayed Road · Dubai",
    gate: null,
    vehicle: MERCEDES,
    contract: CONTRACT_B,
    customer: CUSTOMER_B,
    prediction: { predictedByGps: false, confidence: null },
    authoritative: { confirmed: true, externalReference: "RTA-24891" },
  });

  const salikUnmatched = item({
    id: `${SIMULATED_ROAD_LIABILITY_PREFIX}salik-unmatched`,
    type: "salik_toll",
    source: "SALIK",
    occurredAt: "2026-09-08T07:18:00.000Z",
    amount: 4,
    currency: "AED",
    confirmationStatus: "confirmed",
    attributionStatus: "unmatched",
    collectionStatus: "not_ready",
    workState: "needs_contract",
    locationLabel: "Airport Tunnel · Dubai",
    gate: {
      id: "sim-gate-airport",
      networkKey: "SALIK",
      nameEn: "Airport Tunnel",
      nameAr: "نفق المطار",
      externalGateCode: "AT",
    },
    vehicle: RANGE,
    contract: null,
    customer: null,
    prediction: { predictedByGps: false, confidence: null },
    authoritative: { confirmed: true, externalReference: "SAL-77102" },
  });

  const rtaAmbiguous = item({
    id: `${SIMULATED_ROAD_LIABILITY_PREFIX}rta-ambiguous`,
    type: "rta_violation",
    source: "RTA",
    occurredAt: "2026-09-07T16:05:00.000Z",
    amount: 400,
    currency: "AED",
    confirmationStatus: "confirmed",
    attributionStatus: "ambiguous",
    collectionStatus: "not_ready",
    workState: "ambiguous_match",
    locationLabel: "Al Ittihad Road · Sharjah",
    gate: null,
    vehicle: MERCEDES,
    contract: null,
    customer: null,
    prediction: { predictedByGps: false, confidence: null },
    authoritative: { confirmed: true, externalReference: "RTA-24902" },
  });

  const salikSettled = item({
    id: `${SIMULATED_ROAD_LIABILITY_PREFIX}salik-settled`,
    type: "salik_toll",
    source: "SALIK",
    occurredAt: "2026-08-23T14:08:00.000Z",
    amount: 4,
    currency: "AED",
    confirmationStatus: "confirmed",
    attributionStatus: "matched",
    collectionStatus: "settled",
    workState: "settled",
    locationLabel: "Al Safa · Dubai",
    gate: {
      id: "sim-gate-safa",
      networkKey: "SALIK",
      nameEn: "Al Safa",
      nameAr: "الصفا",
      externalGateCode: "SF",
    },
    vehicle: BMW,
    contract: CONTRACT_A,
    customer: CUSTOMER_A,
    prediction: { predictedByGps: false, confidence: null },
    authoritative: { confirmed: true, externalReference: "SAL-77241" },
  });

  const salikViolation = item({
    id: `${SIMULATED_ROAD_LIABILITY_PREFIX}salik-violation`,
    type: "salik_violation",
    source: "SALIK",
    occurredAt: "2026-09-05T09:12:00.000Z",
    amount: 50,
    currency: "AED",
    confirmationStatus: "confirmed",
    attributionStatus: "matched",
    collectionStatus: "open",
    workState: "collectible",
    locationLabel: "Al Barsha · Dubai",
    gate: GATE_BARSHA,
    vehicle: BMW,
    contract: CONTRACT_A,
    customer: CUSTOMER_A,
    prediction: { predictedByGps: false, confidence: null },
    authoritative: { confirmed: true, externalReference: "SAL-V-1044" },
    reconciliationAttached: true,
    reconciliationLineId: "sim-line-salik-violation",
    customerCharge: { confirmed: true, destination: "RECONCILIATION" },
  });

  const lateRta = item({
    id: `${SIMULATED_ROAD_LIABILITY_PREFIX}late-rta`,
    type: "rta_violation",
    source: "RTA",
    occurredAt: "2026-08-20T10:37:00.000Z",
    amount: 100,
    currency: "AED",
    confirmationStatus: "confirmed",
    attributionStatus: "matched",
    collectionStatus: "open",
    workState: "collectible",
    locationLabel: "Al Khail Road · Dubai",
    gate: null,
    vehicle: RANGE,
    contract: CONTRACT_CLOSED,
    customer: CUSTOMER_B,
    prediction: { predictedByGps: false, confidence: null },
    authoritative: { confirmed: true, externalReference: "RTA-LATE-100" },
    customerCharge: { confirmed: false, destination: null },
  });

  const lateSalikAfterGps = item({
    id: `${SIMULATED_ROAD_LIABILITY_PREFIX}late-salik-gps`,
    type: "salik_toll",
    source: "SALIK",
    occurredAt: "2026-08-20T10:31:00.000Z",
    amount: 4,
    currency: "AED",
    confirmationStatus: "confirmed",
    attributionStatus: "matched",
    collectionStatus: "open",
    workState: "collectible",
    locationLabel: "Al Barsha · Dubai",
    gate: GATE_BARSHA,
    vehicle: RANGE,
    contract: CONTRACT_CLOSED,
    customer: CUSTOMER_B,
    prediction: { predictedByGps: true, confidence: "high" },
    authoritative: { confirmed: true, externalReference: "SAL-LATE-4" },
    customerCharge: { confirmed: false, destination: null },
  });

  const items = [
    gpsPending,
    gpsThenSalik,
    rtaOpen,
    salikUnmatched,
    rtaAmbiguous,
    salikSettled,
    salikViolation,
    lateRta,
    lateSalikAfterGps,
  ];

  const isoNow = now.toISOString();

  const details: Record<string, RoadLiabilityDetailDto> = {
    [gpsPending.id]: detailFrom(gpsPending, {
      confirmedAt: null,
      createdAt: gpsPending.occurredAt,
      updatedAt: gpsPending.occurredAt,
      provenance: [
        provenance({
          id: "sim-obs-gps-1",
          sourceKey: "GPS_INFERENCE",
          authoritative: false,
          eventType: "salik_toll",
          occurredAt: gpsPending.occurredAt,
          receivedAt: gpsPending.occurredAt,
          confidence: "high",
          externalReference: null,
          locationLabel: gpsPending.locationLabel,
        }),
      ],
    }),
    [gpsThenSalik.id]: detailFrom(gpsThenSalik, {
      confirmedAt: "2026-09-10T10:34:00.000Z",
      createdAt: gpsThenSalik.occurredAt,
      updatedAt: "2026-09-10T10:34:00.000Z",
      provenance: [
        provenance({
          id: "sim-obs-gps-2",
          sourceKey: "GPS_INFERENCE",
          authoritative: false,
          eventType: "salik_toll",
          occurredAt: "2026-09-10T10:31:00.000Z",
          receivedAt: "2026-09-10T10:31:00.000Z",
          confidence: "high",
          externalReference: null,
          locationLabel: gpsThenSalik.locationLabel,
        }),
        provenance({
          id: "sim-obs-salik-2",
          sourceKey: "SALIK",
          authoritative: true,
          eventType: "salik_toll",
          occurredAt: "2026-09-10T10:34:00.000Z",
          receivedAt: "2026-09-10T10:34:00.000Z",
          confidence: null,
          externalReference: "SAL-88219",
          locationLabel: gpsThenSalik.locationLabel,
        }),
      ],
    }),
    [rtaOpen.id]: detailFrom(rtaOpen, {
      confirmedAt: rtaOpen.occurredAt,
      createdAt: rtaOpen.occurredAt,
      updatedAt: rtaOpen.occurredAt,
      provenance: [
        provenance({
          id: "sim-obs-rta-1",
          sourceKey: "RTA",
          authoritative: true,
          eventType: "rta_violation",
          occurredAt: rtaOpen.occurredAt,
          receivedAt: rtaOpen.occurredAt,
          confidence: null,
          externalReference: "RTA-24891",
          locationLabel: rtaOpen.locationLabel,
        }),
      ],
    }),
    [salikUnmatched.id]: detailFrom(salikUnmatched, {
      confirmedAt: salikUnmatched.occurredAt,
      createdAt: salikUnmatched.occurredAt,
      updatedAt: salikUnmatched.occurredAt,
      provenance: [
        provenance({
          id: "sim-obs-salik-u",
          sourceKey: "SALIK",
          authoritative: true,
          eventType: "salik_toll",
          occurredAt: salikUnmatched.occurredAt,
          receivedAt: salikUnmatched.occurredAt,
          confidence: null,
          externalReference: "SAL-77102",
          locationLabel: salikUnmatched.locationLabel,
        }),
      ],
    }),
    [rtaAmbiguous.id]: detailFrom(rtaAmbiguous, {
      confirmedAt: rtaAmbiguous.occurredAt,
      createdAt: rtaAmbiguous.occurredAt,
      updatedAt: rtaAmbiguous.occurredAt,
      provenance: [
        provenance({
          id: "sim-obs-rta-a",
          sourceKey: "RTA",
          authoritative: true,
          eventType: "rta_violation",
          occurredAt: rtaAmbiguous.occurredAt,
          receivedAt: rtaAmbiguous.occurredAt,
          confidence: null,
          externalReference: "RTA-24902",
          locationLabel: rtaAmbiguous.locationLabel,
        }),
      ],
    }),
    [salikSettled.id]: detailFrom(salikSettled, {
      confirmedAt: salikSettled.occurredAt,
      createdAt: salikSettled.occurredAt,
      updatedAt: salikSettled.occurredAt,
      provenance: [
        provenance({
          id: "sim-obs-salik-s",
          sourceKey: "SALIK",
          authoritative: true,
          eventType: "salik_toll",
          occurredAt: salikSettled.occurredAt,
          receivedAt: salikSettled.occurredAt,
          confidence: null,
          externalReference: "SAL-77241",
          locationLabel: salikSettled.locationLabel,
        }),
      ],
    }),
    [salikViolation.id]: detailFrom(salikViolation, {
      confirmedAt: salikViolation.occurredAt,
      createdAt: salikViolation.occurredAt,
      updatedAt: isoNow,
      provenance: [
        provenance({
          id: "sim-obs-salik-v",
          sourceKey: "SALIK",
          authoritative: true,
          eventType: "salik_violation",
          occurredAt: salikViolation.occurredAt,
          receivedAt: salikViolation.occurredAt,
          confidence: null,
          externalReference: "SAL-V-1044",
          locationLabel: salikViolation.locationLabel,
        }),
      ],
    }),
    [lateRta.id]: detailFrom(lateRta, {
      confirmedAt: "2026-08-30T09:00:00.000Z",
      createdAt: lateRta.occurredAt,
      updatedAt: "2026-08-30T09:00:00.000Z",
      provenance: [
        provenance({
          id: "sim-obs-late-rta",
          sourceKey: "RTA",
          authoritative: true,
          eventType: "rta_violation",
          occurredAt: lateRta.occurredAt,
          receivedAt: "2026-08-30T09:00:00.000Z",
          confidence: null,
          externalReference: "RTA-LATE-100",
          locationLabel: lateRta.locationLabel,
        }),
      ],
    }),
    [lateSalikAfterGps.id]: detailFrom(lateSalikAfterGps, {
      confirmedAt: "2026-08-30T09:10:00.000Z",
      createdAt: lateSalikAfterGps.occurredAt,
      updatedAt: "2026-08-30T09:10:00.000Z",
      provenance: [
        provenance({
          id: "sim-obs-late-gps",
          sourceKey: "GPS_INFERENCE",
          authoritative: false,
          eventType: "salik_toll",
          occurredAt: lateSalikAfterGps.occurredAt,
          receivedAt: lateSalikAfterGps.occurredAt,
          confidence: "high",
          externalReference: null,
          locationLabel: lateSalikAfterGps.locationLabel,
        }),
        provenance({
          id: "sim-obs-late-salik",
          sourceKey: "SALIK",
          authoritative: true,
          eventType: "salik_toll",
          occurredAt: lateSalikAfterGps.occurredAt,
          receivedAt: "2026-08-30T09:10:00.000Z",
          confidence: null,
          externalReference: "SAL-LATE-4",
          locationLabel: lateSalikAfterGps.locationLabel,
        }),
      ],
    }),
  };

  const summary: RoadLiabilitySummaryDto = {
    total: items.length,
    pendingConfirmationCount: 1,
    confirmedOpenCount: 5,
    confirmedOpenAmount: 758,
    matchedCount: 7,
    unmatchedCount: 1,
    ambiguousCount: 1,
    settledCount: 1,
    needsAttentionCount: 3,
    byType: {
      rtaViolations: 3,
      salikTolls: 5,
      salikViolations: 1,
    },
    providers: {
      rtaConfigured: false,
      salikConfigured: false,
      tarsTrafficCapabilityVerified: false,
    },
  };

  return { summary, items, details, attachedCharges: initialAttachedCharges(salikViolation) };
}

function initialAttachedCharges(
  salikViolation: RoadLiabilityListItemDto,
): Record<string, ReconciliationRoadLiabilityAttachedDto> {
  return {
    [salikViolation.id]: {
      roadLiabilityId: salikViolation.id,
      reconciliationLineId: "sim-line-salik-violation",
      type: "SALIK_VIOLATION",
      sourceKey: "SALIK",
      occurredAt: salikViolation.occurredAt,
      officialAmount: 50,
      customerChargeAmount: 50,
      adjustmentAmount: 0,
      adjustmentReason: null,
      adjustmentNote: null,
      locked: true,
    },
  };
}

export function simulatedReconciliationForLiability(
  overlay: SimulatedRoadLiabilitiesOverlay,
  roadLiabilityId: string,
): ReconciliationRoadLiabilitiesDto {
  const attached = overlay.attachedCharges[roadLiabilityId];
  const row = overlay.items.find((item) => item.id === roadLiabilityId);
  const available =
    row &&
    !attached &&
    row.workState === "collectible" &&
    row.amount != null &&
    row.amount > 0 &&
    row.confirmationStatus === "confirmed" &&
    row.attributionStatus === "matched"
      ? [
          {
            id: row.id,
            type:
              row.type === "rta_violation"
                ? "RTA_VIOLATION"
                : row.type === "salik_toll"
                  ? "SALIK_TOLL"
                  : "SALIK_VIOLATION",
            sourceKey: row.source,
            occurredAt: row.occurredAt,
            officialAmount: row.amount,
            currency: row.currency ?? "AED",
            suggestedCustomerChargeAmount: row.amount,
            minimumCustomerChargeAmount: row.amount,
            externalReference: row.authoritative.externalReference,
            locationLabel: row.locationLabel,
            predictedByGps: row.prediction.predictedByGps,
            vehicle: row.vehicle
              ? {
                  id: row.vehicle.id,
                  displayName: row.vehicle.displayName,
                  plateNumber: row.vehicle.plateNumber,
                }
              : null,
          } as const,
        ]
      : [];
  return {
    available: [...available],
    attached: attached ? [attached] : [],
  };
}

export function simulatedCustomerChargeReview(
  overlay: SimulatedRoadLiabilitiesOverlay,
  detail: RoadLiabilityDetailDto,
): RoadLiabilityCustomerChargeReviewDto {
  const attached = overlay.attachedCharges[detail.id];
  const destination =
    detail.contract?.status === "CLOSED"
      ? "POST_CLOSE_RECEIVABLE"
      : detail.contract?.status === "REVIEW"
        ? "RECONCILIATION"
        : null;
  if (attached) {
    return {
      state: "LOCKED",
      destination: attached.reconciliationLineId.startsWith("sim-pcr-")
        ? "POST_CLOSE_RECEIVABLE"
        : "RECONCILIATION",
      officialAmount: attached.officialAmount,
      currency: "AED",
      suggestedCustomerChargeAmount: attached.customerChargeAmount,
      minimumCustomerChargeAmount: attached.officialAmount,
      customerChargeAmount: attached.customerChargeAmount,
      adjustmentAmount: attached.adjustmentAmount,
      adjustmentReason: attached.adjustmentReason,
      adjustmentNote: attached.adjustmentNote,
      confirmedAt: detail.updatedAt,
      reconciliationLineId: attached.reconciliationLineId.startsWith("sim-pcr-")
        ? null
        : attached.reconciliationLineId,
      postCloseReceivableId: attached.reconciliationLineId.startsWith("sim-pcr-")
        ? attached.reconciliationLineId
        : null,
      reasonCode: null,
    };
  }
  if (isGpsPredictionOnly(detail)) {
    return {
      state: "NOT_ELIGIBLE",
      destination: null,
      officialAmount: detail.amount ?? 0,
      currency: detail.currency ?? "AED",
      suggestedCustomerChargeAmount: detail.amount ?? 0,
      minimumCustomerChargeAmount: detail.amount ?? 0,
      customerChargeAmount: null,
      adjustmentAmount: null,
      adjustmentReason: null,
      adjustmentNote: null,
      confirmedAt: null,
      reconciliationLineId: null,
      postCloseReceivableId: null,
      reasonCode: "GPS_PENDING",
    };
  }
  if (
    detail.workState === "collectible" &&
    detail.amount != null &&
    destination
  ) {
    return {
      state: "AVAILABLE",
      destination,
      officialAmount: detail.amount,
      currency: detail.currency ?? "AED",
      suggestedCustomerChargeAmount: detail.amount,
      minimumCustomerChargeAmount: detail.amount,
      customerChargeAmount: null,
      adjustmentAmount: null,
      adjustmentReason: null,
      adjustmentNote: null,
      confirmedAt: null,
      reconciliationLineId: null,
      postCloseReceivableId: null,
      reasonCode: null,
    };
  }
  return {
    state: "NOT_ELIGIBLE",
    destination: null,
    officialAmount: detail.amount ?? 0,
    currency: detail.currency ?? "AED",
    suggestedCustomerChargeAmount: detail.amount ?? 0,
    minimumCustomerChargeAmount: detail.amount ?? 0,
    customerChargeAmount: null,
    adjustmentAmount: null,
    adjustmentReason: null,
    adjustmentNote: null,
    confirmedAt: null,
    reconciliationLineId: null,
    postCloseReceivableId: null,
    reasonCode: "NOT_CHARGEABLE",
  };
}

/** Local overlay mutation only. Never calls Backend. */
export function applySimulatedChargeReview(
  overlay: SimulatedRoadLiabilitiesOverlay,
  roadLiabilityId: string,
  payload: ConfirmRoadLiabilityChargePayload,
): SimulatedRoadLiabilitiesOverlay {
  const row = overlay.items.find((item) => item.id === roadLiabilityId);
  if (!row || row.amount == null) return overlay;
  if (isGpsPredictionOnly(row)) return overlay;
  if (overlay.attachedCharges[roadLiabilityId]) return overlay;
  if (payload.customerChargeAmount < row.amount) return overlay;
  const destination =
    row.contract?.status === "CLOSED" ? "POST_CLOSE_RECEIVABLE" : "RECONCILIATION";
  const attached: ReconciliationRoadLiabilityAttachedDto = {
    roadLiabilityId,
    reconciliationLineId:
      destination === "POST_CLOSE_RECEIVABLE" ? `sim-pcr-${roadLiabilityId}` : `sim-line-${roadLiabilityId}`,
    type:
      row.type === "rta_violation"
        ? "RTA_VIOLATION"
        : row.type === "salik_toll"
          ? "SALIK_TOLL"
          : "SALIK_VIOLATION",
    sourceKey: row.source,
    occurredAt: row.occurredAt,
    officialAmount: row.amount,
    customerChargeAmount: payload.customerChargeAmount,
    adjustmentAmount: additionalChargePreview(row.amount, payload.customerChargeAmount),
    adjustmentReason: payload.adjustmentReason ?? null,
    adjustmentNote: payload.adjustmentNote ?? null,
    locked: true,
  };
  const mark = (item: RoadLiabilityListItemDto): RoadLiabilityListItemDto =>
    item.id === roadLiabilityId
      ? {
          ...item,
          reconciliationAttached: destination === "RECONCILIATION",
          reconciliationLineId:
            destination === "RECONCILIATION" ? attached.reconciliationLineId : item.reconciliationLineId,
          customerCharge: { confirmed: true, destination },
        }
      : item;
  return {
    ...overlay,
    items: overlay.items.map(mark),
    details: Object.fromEntries(
      Object.entries(overlay.details).map(([id, detail]) => [
        id,
        id === roadLiabilityId
          ? {
              ...detail,
              reconciliationAttached: destination === "RECONCILIATION",
              reconciliationLineId:
                destination === "RECONCILIATION" ? attached.reconciliationLineId : detail.reconciliationLineId,
              customerCharge: { confirmed: true, destination },
            }
          : detail,
      ]),
    ),
    attachedCharges: { ...overlay.attachedCharges, [roadLiabilityId]: attached },
  };
}
