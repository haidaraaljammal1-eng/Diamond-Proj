import type { PrismaClient, RoadLiabilityType, StaffRoadChargeCategory } from "@prisma/client";
import type { OpenReceivableRow } from "src/modules/finance/finance.mapper";
import { createFinanceReceivablesService } from "src/modules/finance/finance-receivables.service";
import { resolveFinanceCompanyScope } from "src/modules/finance/finance-company-scope";
import type { DailyOperationsDigestSnapshot } from "src/modules/notification-delivery/daily-operations-digest.types";

const SALIK_TYPES: ReadonlySet<RoadLiabilityType> = new Set(["SALIK_TOLL", "SALIK_VIOLATION"]);

/** Salik vs traffic split for open ROAD_LIABILITY finance rows (digest counts). */
export function isSalikLiabilityForDigest(row: {
  type: RoadLiabilityType;
  staffChargeCategory: StaffRoadChargeCategory | null;
}): boolean {
  if (row.staffChargeCategory === "SALIK") return true;
  if (row.staffChargeCategory === "TRAFFIC_VIOLATION") return false;
  return SALIK_TYPES.has(row.type);
}

export interface DailyOperationsDigestQueryDeps {
  listOpenReceivables?: () => Promise<{ data: OpenReceivableRow[] }>;
}

/**
 * Fresh DB snapshot for one scheduled digest slot.
 * Financial counts come from Finance `listOpenReceivables` (same sources as the grid).
 * Overdue returns / maintenance reuse the legacy monitor WHERE clauses.
 */
export async function loadDailyOperationsDigestSnapshot(
  prisma: PrismaClient,
  now = new Date(),
  deps: DailyOperationsDigestQueryDeps = {},
): Promise<DailyOperationsDigestSnapshot> {
  const openRows = deps.listOpenReceivables
    ? (await deps.listOpenReceivables()).data
    : await createFinanceReceivablesService(prisma).listAllOpenReceivableRows(
        resolveFinanceCompanyScope({}),
      );

  let unpaidRentalsCount = 0;
  let unpaidRenewalsCount = 0;
  let reconciliationCount = 0;
  let postCloseReceivablesCount = 0;
  const roadLiabilityIds: string[] = [];

  for (const row of openRows) {
    switch (row.sourceType) {
      case "RENTAL":
        unpaidRentalsCount += 1;
        break;
      case "RENEWAL":
        unpaidRenewalsCount += 1;
        break;
      case "RECONCILIATION":
        reconciliationCount += 1;
        break;
      case "POST_CLOSE_RECEIVABLE":
        postCloseReceivablesCount += 1;
        break;
      case "ROAD_LIABILITY":
        roadLiabilityIds.push(row.sourceId);
        break;
      default:
        break;
    }
  }

  let trafficViolationsCount = 0;
  let salikCount = 0;
  if (roadLiabilityIds.length > 0) {
    const liabilities = await prisma.roadLiability.findMany({
      where: { id: { in: roadLiabilityIds } },
      select: { id: true, type: true, staffChargeCategory: true },
    });
    const byId = new Map(liabilities.map((row) => [row.id, row]));
    for (const id of roadLiabilityIds) {
      const liability = byId.get(id);
      if (!liability) {
        // Keep parity with finance grid: never drop an open ROAD_LIABILITY row.
        trafficViolationsCount += 1;
        continue;
      }
      if (isSalikLiabilityForDigest(liability)) salikCount += 1;
      else trafficViolationsCount += 1;
    }
  }

  const overdueVehicleReturnsCount = await prisma.contract.count({
    where: {
      status: "ACTIVE",
      endAt: { lt: now },
    },
  });

  const scheduledMaintenanceNotStartedCount = await prisma.maintenanceOrder.count({
    where: {
      status: "SCHEDULED",
      scheduledAt: { not: null, lt: now },
    },
  });

  const maintenanceCompletionDelayedCount = await prisma.maintenanceOrder.count({
    where: {
      status: "IN_SERVICE",
      expectedCompletionAt: { not: null, lt: now },
    },
  });

  return {
    unpaidRentalsCount,
    unpaidRenewalsCount,
    trafficViolationsCount,
    salikCount,
    reconciliationCount,
    postCloseReceivablesCount,
    overdueVehicleReturnsCount,
    scheduledMaintenanceNotStartedCount,
    maintenanceCompletionDelayedCount,
  };
}
