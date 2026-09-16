import type {
  RoadLiabilityAttributionStatus,
  RoadLiabilityCollectionStatus,
  RoadLiabilityConfirmationStatus,
  RoadLiabilityConfidence,
  RoadLiabilityType,
} from "@prisma/client";

/**
 * Provider-neutral road-liability boundary.
 *
 * Do not assume a vendor URL, authentication type, webhook, pagination, or
 * external vehicle identifier format. A future real adapter implements this
 * interface from official documentation and translates vendor payloads into
 * NormalizedRoadObservation before calling ingest — never from Vehicles or
 * Contracts.
 */
export interface RoadLiabilityProvider {
  readonly name: string;
  /** False until a real, credentialed adapter exists. */
  readonly configured: boolean;
}

export interface NormalizedRoadObservationInput {
  sourceKey: string;
  authoritative: boolean;
  externalEventId?: string | null;
  eventType: RoadLiabilityType;
  vehicleId?: number | null;
  plateNumber?: string | null;
  externalVehicleRef?: string | null;
  occurredAt: Date;
  receivedAt?: Date;
  amount?: number | null;
  currency?: string | null;
  externalReference?: string | null;
  gateId?: string | null;
  locationLabel?: string | null;
  confidence?: RoadLiabilityConfidence | null;
}

export interface CustodyWindow {
  contractId: string;
  carOutAt: Date;
  carInAt: Date | null;
}

export type CustodyAttribution =
  | { status: "MATCHED"; contractId: string }
  | { status: "UNMATCHED" }
  | { status: "AMBIGUOUS"; contractIds: string[] };

export interface ChargeableRoadLiability {
  id: string;
  type: RoadLiabilityType;
  vehicleId: number | null;
  attributedContractId: string;
  amount: number;
  currency: string;
  occurredAt: Date;
  authoritativeSourceKey: string | null;
  confirmationStatus: RoadLiabilityConfirmationStatus;
  attributionStatus: RoadLiabilityAttributionStatus;
  collectionStatus: RoadLiabilityCollectionStatus;
}

export interface GpsCrossingCandidate {
  vehicleId: number;
  gateId: string;
  locationLabel: string;
  occurredAt: Date;
  confidence: RoadLiabilityConfidence;
}
