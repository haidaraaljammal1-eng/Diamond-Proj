import type { Prisma } from "@prisma/client";
import { env } from "src/config/env";
import {
  OFFICE_DISPLAY_NAME_DEFAULT,
} from "src/modules/contracts/contracts.constants";
import { derivePublicRentalFlowStep } from "src/modules/contracts/public-rental-flow";
import {
  buildContractIdentityDraft,
  publicPassportStatus,
} from "src/modules/contracts/contract-identity-draft";
import {
  formatStoredExpiry,
  maskLicenseNumber,
} from "src/modules/contracts/driving-license-policy";
import { fleetVehicleTypeLabel, vehicleDisplayName } from "src/modules/vehicles/vehicles.mapper";
import { createPaymentProvider } from "src/modules/contracts/payment/payment-provider.factory";
import type { PublicRentalContextSchema } from "src/modules/contracts/contracts.schema";
import type { z } from "zod";

export const PUBLIC_RENTAL_INCLUDE = {
  vehicle: { include: { model: { select: { name: true } } } },
  customer: true,
  payments: { orderBy: { createdAt: "desc" as const }, take: 1 },
  carOut: { select: { occurredAt: true } },
  carIn: { select: { occurredAt: true } },
  licenseVerifications: { orderBy: { createdAt: "desc" as const }, take: 1 },
  // Active attempt only: a superseded (retaken) passport is never authoritative.
  passportExtractions: {
    where: { document: { supersededAt: null } },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
} satisfies Prisma.ContractInclude;

export type PublicRentalRow = Prisma.ContractGetPayload<{ include: typeof PUBLIC_RENTAL_INCLUDE }>;

export function toPublicRentalContext(
  row: PublicRentalRow,
  now: Date = new Date(),
): z.infer<typeof PublicRentalContextSchema> {
  const verification = row.licenseVerifications[0] ?? null;
  const passport = row.passportExtractions[0] ?? null;
  const identity = buildContractIdentityDraft({ license: verification, passport, now });
  const payment = row.payments[0] ?? null;
  const displayName = vehicleDisplayName({
    vehicleName: row.vehicle.vehicleName,
    modelName: row.vehicle.model?.name ?? null,
    modelYear: row.vehicle.modelYear,
    plateNumber: row.vehicle.plateNumber,
  });
  const step = derivePublicRentalFlowStep({
    status: row.status,
    identityReady: identity.identityReady,
    paymentStatus: payment?.status ?? null,
  });
  const verifiedNumber =
    verification?.status === "VALID" ? verification.licenseNumber : null;
  const verifiedExpiry =
    verification?.status === "VALID" ? formatStoredExpiry(verification.expiryDate) : null;

  return {
    office: { displayName: env.OFFICE_DISPLAY_NAME || OFFICE_DISPLAY_NAME_DEFAULT },
    flow: { step },
    contract: {
      contractNumber: row.contractNumber,
      status: row.status,
      termsVersion: row.termsVersion,
    },
    vehicle: {
      displayName,
      vehicleType: fleetVehicleTypeLabel(row.vehicle.vehicleName, row.vehicle.model?.name ?? null),
      plateNumber: row.vehicle.plateNumber,
      modelYear: row.vehicle.modelYear,
      color: row.vehicle.color,
      vin: row.vehicle.vin,
    },
    rental: {
      rentalDays: row.rentalDays,
      agreedAmount: row.agreedAmount,
      currency: row.currency,
      startAt: row.startAt,
      endAt: row.endAt,
      actualPickupAt: row.carOut?.occurredAt ?? null,
      actualReturnAt: row.carIn?.occurredAt ?? null,
    },
    customer: row.customer
      ? {
          name: row.customer.name,
          mobile: row.customer.mobile,
          email: row.customer.email,
          nationality: row.customer.nationality,
          identityNumber: row.customer.identityNumber,
          passportNumber: row.customer.passportNumber,
          address: row.customer.address,
          drivingLicenseNumber: verifiedNumber ?? row.customer.drivingLicenseNumber,
          drivingLicenseExpiry:
            verifiedExpiry ?? formatStoredExpiry(row.customer.drivingLicenseExpiry),
        }
      : null,
    licenseVerification: {
      status: verification?.status ?? "PENDING",
      licenseNumber: verification?.status === "VALID" ? verification.licenseNumber : null,
      licenseNumberMasked: maskLicenseNumber(verification?.licenseNumber ?? null),
      expiryDate: formatStoredExpiry(verification?.expiryDate ?? null),
      confidence: verification?.confidence ?? null,
    },
    identity: {
      licenseStatus: identity.licenseStatus,
      passport: {
        status: publicPassportStatus(passport, now),
        fields:
          identity.passportStatus === "PASSPORT_READY"
            ? {
                fullName: identity.fullName.value,
                passportNumber: identity.passportNumber.value,
                nationality: identity.nationality.value,
                dateOfBirth: identity.dateOfBirth.value,
                sex: identity.sex.value,
                passportIssueDate: identity.passportIssueDate.value,
                passportExpiryDate: identity.passportExpiryDate.value,
                issuingCountry: identity.issuingCountry.value,
              }
            : null,
      },
      identityReady: identity.identityReady,
    },
    payment: {
      status: payment?.status ?? null,
      method: payment?.method ?? null,
      amount: payment?.amount ?? row.agreedAmount,
      currency: row.currency,
      providerAvailable: createPaymentProvider().configured,
    },
  };
}
