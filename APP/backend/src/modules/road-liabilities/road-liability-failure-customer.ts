import type { PrismaClient } from "@prisma/client";
import { buildContractIdentityDraft } from "src/modules/contracts/contract-identity-draft";
import { formatStoredExpiry } from "src/modules/contracts/driving-license-policy";
import type { RoadLiabilityFailureCustomerSchema } from "src/modules/road-liabilities/road-liability-collection.schema";
import type { z } from "zod";

type FailureCustomer = z.infer<typeof RoadLiabilityFailureCustomerSchema>;

function pick<T>(...values: (T | null | undefined)[]): T | null {
  for (const value of values) {
    if (value != null && String(value).trim() !== "") return value;
  }
  return null;
}

export async function buildRoadLiabilityFailureCustomer(
  prisma: PrismaClient,
  contractId: string,
): Promise<FailureCustomer> {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      customer: true,
      officialReviewDraft: true,
      licenseVerifications: { orderBy: { createdAt: "desc" }, take: 1 },
      passportExtractions: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!contract) {
    return {
      fullName: null,
      nationality: null,
      identityNumber: null,
      passportNumber: null,
      passportIssueDate: null,
      passportExpiryDate: null,
      dateOfBirth: null,
      sex: null,
      issuingCountry: null,
      drivingLicenseNumber: null,
      drivingLicenseExpiry: null,
      telephone: null,
      address: null,
    };
  }

  const review = contract.officialReviewDraft;
  const license = contract.licenseVerifications[0] ?? null;
  const passport = contract.passportExtractions[0] ?? null;
  const identity = buildContractIdentityDraft({ license, passport });
  const customer = contract.customer;

  return {
    fullName: pick(review?.hirerName, identity.fullName.value, customer?.name),
    nationality: pick(review?.nationality, identity.nationality.value, customer?.nationality),
    identityNumber: pick(customer?.identityNumber),
    passportNumber: pick(review?.passportNumber, identity.passportNumber.value, customer?.passportNumber),
    passportIssueDate: pick(identity.passportIssueDate.value),
    passportExpiryDate: pick(identity.passportExpiryDate.value),
    dateOfBirth: pick(identity.dateOfBirth.value),
    sex: pick(identity.sex.value),
    issuingCountry: pick(identity.issuingCountry.value),
    drivingLicenseNumber: pick(identity.driverLicenseNumber.value, customer?.drivingLicenseNumber),
    drivingLicenseExpiry: pick(
      identity.driverLicenseExpiryDate.value,
      formatStoredExpiry(customer?.drivingLicenseExpiry ?? null),
    ),
    telephone: pick(review?.telephone, customer?.mobile),
    address: pick(review?.address, customer?.address),
  };
}
