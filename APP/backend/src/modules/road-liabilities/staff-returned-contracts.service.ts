import type { Prisma, PrismaClient } from "@prisma/client";
import { RETURNED_CONTRACT_WINDOW_MS } from "src/modules/road-liabilities/road-liability.constants";
import { resolveCollectionAuthorization } from "src/modules/road-liabilities/road-liability-collection.capability";
import { COMPANY_REF_SELECT } from "src/modules/operating-companies/company-ref";
import { vehicleDisplayName } from "src/modules/vehicles/vehicles.mapper";

export function returnedContractWindowStart(now = new Date()): Date {
  return new Date(now.getTime() - RETURNED_CONTRACT_WINDOW_MS);
}

export function isReturnedContractEligible(
  contract: {
    status: string;
    carIn: { occurredAt: Date } | null;
  },
  now = new Date(),
): boolean {
  if (contract.status !== "REVIEW" && contract.status !== "CLOSED") return false;
  if (!contract.carIn) return false;
  const start = returnedContractWindowStart(now);
  return contract.carIn.occurredAt.getTime() >= start.getTime();
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
  const windowStart = returnedContractWindowStart(now);
  const where: Prisma.ContractWhereInput = {
    status: { in: ["REVIEW", "CLOSED"] },
    carIn: { occurredAt: { gte: windowStart } },
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...buildSearchWhere(query.search ?? ""),
  };

  const skip = (query.page - 1) * query.pageSize;
  const [total, rows] = await Promise.all([
    prisma.contract.count({ where }),
    prisma.contract.findMany({
      where,
      orderBy: { carIn: { occurredAt: "desc" } },
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
        status: row.status as "REVIEW" | "CLOSED",
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
        carInOccurredAt: row.carIn!.occurredAt,
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
  prisma: PrismaClient,
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
