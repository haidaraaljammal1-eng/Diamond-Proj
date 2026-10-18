import type { Prisma, PrismaClient } from "@prisma/client";
import { RETURNED_CONTRACT_WINDOW_MS } from "src/modules/road-liabilities/road-liability.constants";
import { resolveCollectionAuthorization } from "src/modules/road-liabilities/road-liability-collection.capability";
import { COMPANY_REF_SELECT } from "src/modules/operating-companies/company-ref";
import { vehicleDisplayName } from "src/modules/vehicles/vehicles.mapper";

export function returnedContractWindowStart(now = new Date()): Date {
  return new Date(now.getTime() - RETURNED_CONTRACT_WINDOW_MS);
}

const PRE_ACTIVE_CONTRACT_STATUSES = new Set(["AWAITING", "FORM", "SIGNED", "PAID"]);
const POST_CAR_IN_COLLECTION_STATUSES = new Set(["RETOUT", "REVIEW", "CLOSED"]);

function isCarInWithinCollectionWindow(
  occurredAt: Date,
  now: Date,
): boolean {
  const start = returnedContractWindowStart(now);
  return occurredAt.getTime() >= start.getTime();
}

/** Shared eligibility for returned-contracts list and staff manual off-session charge. */
export function isReturnedContractEligible(
  contract: {
    status: string;
    carIn: { occurredAt: Date } | null;
  },
  now = new Date(),
): boolean {
  if (PRE_ACTIVE_CONTRACT_STATUSES.has(contract.status)) return false;

  if (contract.status === "ACTIVE") {
    if (!contract.carIn) return true;
    return isCarInWithinCollectionWindow(contract.carIn.occurredAt, now);
  }

  if (!POST_CAR_IN_COLLECTION_STATUSES.has(contract.status)) return false;
  if (!contract.carIn) return false;
  return isCarInWithinCollectionWindow(contract.carIn.occurredAt, now);
}

function buildEligibleContractsWhere(now: Date): Prisma.ContractWhereInput {
  const windowStart = returnedContractWindowStart(now);
  return {
    OR: [
      { status: "ACTIVE", carIn: null },
      {
        status: { in: ["ACTIVE", "RETOUT", "REVIEW", "CLOSED"] },
        carIn: { occurredAt: { gte: windowStart } },
      },
    ],
  };
}

export type ReturnedContractsQuery = {
  page: number;
  pageSize: number;
  companyId?: number;
  search?: string;
};

function buildSearchWhere(search: string): Prisma.ContractWhereInput {
  const q = search.trim();
  if (!q) return {};
  return {
    OR: [
      { contractNumber: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { vehicle: { plateNumber: { contains: q, mode: "insensitive" } } },
      { vehicle: { vehicleName: { contains: q, mode: "insensitive" } } },
    ],
  };
}

export async function listReturnedContracts(
  prisma: PrismaClient,
  query: ReturnedContractsQuery,
  now = new Date(),
) {
  const where: Prisma.ContractWhereInput = {
    AND: [
      buildEligibleContractsWhere(now),
      ...(query.companyId ? [{ companyId: query.companyId }] : []),
      buildSearchWhere(query.search ?? ""),
    ],
  };

  const skip = (query.page - 1) * query.pageSize;
  const [total, rows] = await Promise.all([
    prisma.contract.count({ where }),
    prisma.contract.findMany({
      where,
      orderBy: [{ carIn: { occurredAt: "desc" } }, { contractNumber: "desc" }],
      skip,
      take: query.pageSize,
      include: {
        company: { select: COMPANY_REF_SELECT },
        customer: { select: { id: true, name: true } },
        vehicle: { include: { model: { select: { name: true } } } },
        carIn: { select: { occurredAt: true } },
      },
    }),
  ]);

  const capabilities = await Promise.all(
    rows.map(async (row) => {
      const { capability } = await resolveCollectionAuthorization(
        prisma,
        row.id,
        row.customerId,
      );
      let cardAvailability: "available" | "unavailable" = "unavailable";
      if (capability.offSessionAvailable) cardAvailability = "available";
      return {
        contractId: row.id,
        contractNumber: row.contractNumber,
        status: row.status as "ACTIVE" | "RETOUT" | "REVIEW" | "CLOSED",
        collectionMode: row.collectionMode ?? "",
        company: row.company,
        customerName: row.customer?.name ?? null,
        vehicleDisplayName: row.vehicle
          ? vehicleDisplayName({
              vehicleName: row.vehicle.vehicleName,
              modelName: row.vehicle.model?.name ?? null,
              modelYear: row.vehicle.modelYear,
              plateNumber: row.vehicle.plateNumber,
            })
          : "",
        plateNumber: row.vehicle?.plateNumber ?? null,
        carInOccurredAt: row.carIn?.occurredAt ?? null,
        cardAvailability,
        capabilityReasonCode: capability.reasonCode,
        savedPaymentMethod: capability.savedPaymentMethod,
      };
    }),
  );

  return {
    items: capabilities,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

export async function assertReturnedContractEligible(
  prisma: PrismaClient | import("@prisma/client").Prisma.TransactionClient,
  contractId: string,
  now = new Date(),
) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { carIn: { select: { occurredAt: true } } },
  });
  if (!contract || !isReturnedContractEligible(contract, now)) {
    const { roadLiabilityCollectionError } = await import(
      "src/modules/road-liabilities/road-liability-collection.errors"
    );
    throw roadLiabilityCollectionError.returnedContractNotEligible();
  }
  return contract;
}
