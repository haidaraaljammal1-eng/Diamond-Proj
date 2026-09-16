import type { Prisma } from "@prisma/client";
import { vehicleDisplayName } from "src/modules/vehicles/vehicles.mapper";
import type { TarsOperationTypeKey } from "src/modules/integrations/tars/tars.constants";
import { tarsError } from "src/modules/integrations/tars/tars.errors";
import type {
  TarsAttachmentRef,
  TarsContractAcceptanceInput,
  TarsContractRef,
  TarsCompleteContractInput,
  TarsCustomerData,
  TarsDrivingLicenseData,
  TarsHandoverInput,
  TarsOperationInput,
  TarsRegisterContractInput,
  TarsRentalData,
  TarsReturnInput,
  TarsVehicleData,
} from "src/modules/integrations/tars/tars.types";

/**
 * THE single Diamond → normalized-TARS mapping point. Mapping logic must never
 * be spread across routes or domain services: when official TARS documentation
 * arrives, only this file plus the new adapter change.
 *
 * All values are READ from existing Diamond models. Nothing here accepts
 * caller-supplied vehicle, customer, amount, duration or contract number —
 * those are structurally unavailable to a client because the only input is the
 * persisted Contract aggregate.
 */
const CONTRACT_INCLUDE = {
  vehicle: { include: { model: { select: { name: true } } } },
  customer: true,
  acceptance: true,
  carOut: {
    include: {
      photos: {
        orderBy: { sortOrder: "asc" as const },
        include: { attachment: { select: { mimeType: true } } },
      },
    },
  },
  carIn: {
    include: {
      photos: {
        orderBy: { sortOrder: "asc" as const },
        include: { attachment: { select: { mimeType: true } } },
      },
    },
  },
  reconciliation: true,
  licenseVerifications: {
    where: { status: "VALID" as const },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
} satisfies Prisma.ContractInclude;

export const TARS_CONTRACT_INCLUDE = CONTRACT_INCLUDE;
export type TarsContractRow = Prisma.ContractGetPayload<{
  include: typeof CONTRACT_INCLUDE;
}>;

/** Calendar date (`YYYY-MM-DD`). License expiry is stored at UTC noon. */
function calendarDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function contractRef(row: TarsContractRow): TarsContractRef {
  return {
    contractId: row.id,
    contractNumber: row.contractNumber,
    status: row.status,
    termsVersion: row.termsVersion,
  };
}

function vehicleData(row: TarsContractRow): TarsVehicleData {
  return {
    vehicleId: row.vehicle.id,
    displayName: vehicleDisplayName({
      vehicleName: row.vehicle.vehicleName,
      modelName: row.vehicle.model?.name ?? null,
      modelYear: row.vehicle.modelYear,
      plateNumber: row.vehicle.plateNumber,
    }),
    plateNumber: row.vehicle.plateNumber,
    vin: row.vehicle.vin,
    modelName: row.vehicle.model?.name ?? null,
    modelYear: row.vehicle.modelYear,
    color: row.vehicle.color,
  };
}

function rentalData(row: TarsContractRow): TarsRentalData {
  return {
    priceType: row.priceType,
    rentalDays: row.rentalDays,
    agreedAmount: row.agreedAmount,
    currency: row.currency,
    depositAmount: row.depositAmount,
    startAt: row.startAt,
    endAt: row.endAt,
  };
}

function customerData(customer: NonNullable<TarsContractRow["customer"]>): TarsCustomerData {
  return {
    customerId: customer.id,
    name: customer.name,
    type: customer.type,
    mobile: customer.mobile,
    email: customer.email,
    nationality: customer.nationality,
    identityNumber: customer.identityNumber,
    passportNumber: customer.passportNumber,
    address: customer.address,
  };
}

/**
 * Verified license only. The latest VALID DrivingLicenseVerification wins; the
 * Customer columns are the fallback because Diamond writes them from that same
 * backend verification, never from customer free text.
 */
function licenseData(row: TarsContractRow): TarsDrivingLicenseData | null {
  const verified = row.licenseVerifications[0];
  if (verified?.licenseNumber) {
    return {
      number: verified.licenseNumber,
      expiryDate: calendarDate(verified.expiryDate),
    };
  }
  if (row.customer?.drivingLicenseNumber) {
    return {
      number: row.customer.drivingLicenseNumber,
      expiryDate: calendarDate(row.customer.drivingLicenseExpiry),
    };
  }
  return null;
}

/** References only — image bytes are never read, copied or encoded here. */
function photoRefs(
  contractId: string,
  side: "car-out" | "car-in",
  photos: Array<{
    attachmentId: string;
    angle: TarsAttachmentRef["angle"];
    id: string;
    attachment: { mimeType: string };
  }>,
): TarsAttachmentRef[] {
  return photos.map((photo) => ({
    attachmentId: photo.attachmentId,
    angle: photo.angle,
    mimeType: photo.attachment.mimeType,
    streamPath: `/contracts/${contractId}/${side}/photos/${photo.id}/stream`,
  }));
}

function assertComplete(operationType: TarsOperationTypeKey, missing: string[]): void {
  if (missing.length > 0) throw tarsError.mappingIncomplete(operationType, missing);
}

export function mapRegisterContractInput(row: TarsContractRow): TarsRegisterContractInput {
  const license = licenseData(row);
  const missing: string[] = [];
  if (!row.customer) missing.push("contract.customer");
  if (!license) missing.push("contract.drivingLicense");
  assertComplete("REGISTER_CONTRACT", missing);

  return {
    contract: contractRef(row),
    customer: customerData(row.customer!),
    vehicle: vehicleData(row),
    rental: rentalData(row),
    license: license!,
  };
}

export function mapContractAcceptanceInput(
  row: TarsContractRow,
): TarsContractAcceptanceInput {
  assertComplete("CONTRACT_ACCEPTANCE", row.acceptance ? [] : ["contract.acceptance"]);
  const acceptance = row.acceptance!;
  return {
    contract: contractRef(row),
    acceptance: {
      acceptedAt: acceptance.acceptedAt,
      termsVersion: acceptance.termsVersion,
      signatureAttachmentId: acceptance.signatureAttachmentId,
    },
  };
}

export function mapHandoverInput(row: TarsContractRow): TarsHandoverInput {
  assertComplete("HANDOVER", row.carOut ? [] : ["contract.carOut"]);
  const carOut = row.carOut!;
  return {
    contract: contractRef(row),
    handover: {
      occurredAt: carOut.occurredAt,
      odometer: carOut.mileageOut,
      fuelLevel: carOut.fuelOut,
      notes: carOut.notes,
    },
    photos: photoRefs(row.id, "car-out", carOut.photos),
  };
}

export function mapReturnInput(row: TarsContractRow): TarsReturnInput {
  assertComplete("RETURN_DOCUMENTATION", row.carIn ? [] : ["contract.carIn"]);
  const carIn = row.carIn!;
  return {
    contract: contractRef(row),
    returnDocumentation: {
      occurredAt: carIn.occurredAt,
      odometer: carIn.mileageIn,
      fuelLevel: carIn.fuelIn,
      notes: carIn.notes,
    },
    photos: photoRefs(row.id, "car-in", carIn.photos),
  };
}

export function mapCompleteContractInput(row: TarsContractRow): TarsCompleteContractInput {
  const reconciliation = row.reconciliation;
  const missing: string[] = [];
  if (!row.carIn) missing.push("contract.carIn");
  if (!reconciliation) missing.push("contract.reconciliation");
  else if (!reconciliation.approvedAt) missing.push("contract.reconciliation.approvedAt");
  assertComplete("COMPLETE_CONTRACT", missing);

  return {
    contract: contractRef(row),
    completion: {
      closedAt: row.closedAt,
      reconciliation: {
        chargesTotal: reconciliation!.chargesTotal,
        depositAmount: reconciliation!.depositAmount,
        deductions: reconciliation!.deductions,
        finalAmount: reconciliation!.finalAmount,
        approvedAt: reconciliation!.approvedAt!,
      },
    },
  };
}

export function buildTarsOperationInput(
  operationType: TarsOperationTypeKey,
  row: TarsContractRow,
): TarsOperationInput {
  switch (operationType) {
    case "REGISTER_CONTRACT":
      return { operationType, payload: mapRegisterContractInput(row) };
    case "CONTRACT_ACCEPTANCE":
      return { operationType, payload: mapContractAcceptanceInput(row) };
    case "HANDOVER":
      return { operationType, payload: mapHandoverInput(row) };
    case "RETURN_DOCUMENTATION":
      return { operationType, payload: mapReturnInput(row) };
    case "COMPLETE_CONTRACT":
      return { operationType, payload: mapCompleteContractInput(row) };
  }
}
