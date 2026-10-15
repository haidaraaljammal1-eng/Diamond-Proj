import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { env } from "src/config/env";
import { ErrorCode } from "src/constants/error-codes";
import { AppError } from "src/lib/errors/app-error";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { withTransaction } from "src/lib/db/transaction";
import { ARCHIVE_VEHICLE_LOCK_NS } from "src/modules/archive/archive.constants";
import {
  ARCHIVE_SYNC_BATCH_SIZE,
  ARCHIVE_SYNC_STATE_ID,
} from "src/modules/archive/archive-sync.constants";
import { discoverAffectedContractIds } from "src/modules/archive/archive-sync.discover";
import { archiveSyncAlreadyRunningError } from "src/modules/archive/archive-sync.errors";
import {
  buildSyncArchiveRowUpdate,
  syncPayloadChanged,
} from "src/modules/archive/archive-manual-overrides";
import { recomputeArchiveAutoFields } from "src/modules/archive/archive-sync.recompute";
import type {
  ArchiveSyncResultDto,
  ArchiveSyncStatusDto,
} from "src/modules/archive/archive-sync.schema";

const SYNC_RUNNING_STALE_MS = 30 * 60 * 1000;

async function ensureSyncStateRow(prisma: FastifyInstance["prisma"]): Promise<void> {
  await prisma.archiveSyncState.upsert({
    where: { id: ARCHIVE_SYNC_STATE_ID },
    update: {},
    create: { id: ARCHIVE_SYNC_STATE_ID },
  });
}

export function createArchiveSyncService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const offsetMinutes = env.BUSINESS_TIMEZONE_OFFSET_MINUTES;

  async function getStatus(): Promise<ArchiveSyncStatusDto> {
    await ensureSyncStateRow(prisma);
    const state = await prisma.archiveSyncState.findUniqueOrThrow({
      where: { id: ARCHIVE_SYNC_STATE_ID },
    });
    const running =
      state.runningStartedAt != null &&
      Date.now() - state.runningStartedAt.getTime() < SYNC_RUNNING_STALE_MS;
    return {
      lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
      running,
      runningStartedAt: running ? state.runningStartedAt : null,
    };
  }

  async function tryAcquireRunningLock(
    userId: number,
    syncStartedAt: Date,
  ): Promise<boolean> {
    const staleBefore = new Date(syncStartedAt.getTime() - SYNC_RUNNING_STALE_MS);
    const result = await prisma.archiveSyncState.updateMany({
      where: {
        id: ARCHIVE_SYNC_STATE_ID,
        OR: [{ runningStartedAt: null }, { runningStartedAt: { lt: staleBefore } }],
      },
      data: { runningStartedAt: syncStartedAt, runningByUserId: userId },
    });
    return result.count === 1;
  }

  async function releaseRunningLock(): Promise<void> {
    await prisma.archiveSyncState.update({
      where: { id: ARCHIVE_SYNC_STATE_ID },
      data: { runningStartedAt: null, runningByUserId: null },
    });
  }

  async function processBatch(
    contractIds: string[],
    summary: {
      created: number;
      updated: number;
      unchanged: number;
      failed: number;
      violationsCounted: number;
      errors: Array<{ contractId: string; message: string }>;
    },
  ): Promise<void> {
    const contracts = await prisma.contract.findMany({
      where: { id: { in: contractIds }, acceptance: { isNot: null } },
      include: {
        customer: { select: { name: true, mobile: true } },
        carOut: true,
        carIn: true,
        payments: true,
        reconciliation: { include: { lines: true } },
        archiveRows: { take: 1 },
      },
    });

    const charges = await prisma.roadLiabilityCustomerCharge.findMany({
      where: { contractId: { in: contractIds } },
      include: {
        roadLiability: {
          select: {
            type: true,
            attributionStatus: true,
            attributedContractId: true,
          },
        },
      },
    });
    const chargesByContract = new Map<string, typeof charges>();
    for (const charge of charges) {
      const bucket = chargesByContract.get(charge.contractId);
      if (bucket) bucket.push(charge);
      else chargesByContract.set(charge.contractId, [charge]);
    }

    for (const contract of contracts) {
      try {
        const existing = contract.archiveRows[0] ?? null;
        const recompute = recomputeArchiveAutoFields({
          contractId: contract.id,
          rentalDays: contract.rentalDays,
          agreedAmount: contract.agreedAmount,
          snapshot: contract.snapshot,
          customer: contract.customer,
          carOut: contract.carOut,
          carIn: contract.carIn,
          payments: contract.payments,
          reconciliationLines: contract.reconciliation?.lines ?? [],
          roadCharges: chargesByContract.get(contract.id) ?? [],
          businessTimezoneOffsetMinutes: offsetMinutes,
          parkingForTotal: existing?.parking ?? null,
          includeCustomer: true,
        });
        summary.violationsCounted += recompute.violationsCounted;

        const autoData = buildSyncArchiveRowUpdate(
          existing,
          recompute,
          contract.payments,
        );

        if (existing) {
          if (!syncPayloadChanged(existing, autoData)) {
            summary.unchanged += 1;
            continue;
          }
          await prisma.archiveRow.update({
            where: { id: existing.id },
            data: autoData as Parameters<typeof prisma.archiveRow.update>[0]["data"],
          });
          summary.updated += 1;
        } else {
          await withTransaction(prisma, async (tx) => {
            await acquireAdvisoryLock(tx, ARCHIVE_VEHICLE_LOCK_NS, contract.vehicleId);
            const max = await tx.archiveRow.aggregate({
              where: { vehicleId: contract.vehicleId },
              _max: { rowOrder: true },
            });
            const rowOrder = (max._max.rowOrder ?? 0) + 1;
            await tx.archiveRow.create({
              data: {
                vehicleId: contract.vehicleId,
                contractId: contract.id,
                rowOrder,
                ...(autoData as Record<string, unknown>),
              },
            });
          });
          summary.created += 1;
        }
      } catch (err) {
        summary.failed += 1;
        summary.errors.push({
          contractId: contract.id,
          message: err instanceof Error ? err.message : "Sync failed",
        });
      }
    }
  }

  async function runSync(userId: number): Promise<ArchiveSyncResultDto> {
    await ensureSyncStateRow(prisma);
    const syncStartedAt = new Date();

    const acquired = await tryAcquireRunningLock(userId, syncStartedAt);
    if (!acquired) throw archiveSyncAlreadyRunningError();

    const stateBefore = await prisma.archiveSyncState.findUniqueOrThrow({
      where: { id: ARCHIVE_SYNC_STATE_ID },
    });
    const since = stateBefore.lastSuccessfulSyncAt;

    const summary = {
      created: 0,
      updated: 0,
      unchanged: 0,
      failed: 0,
      violationsCounted: 0,
      errors: [] as Array<{ contractId: string; message: string }>,
    };

    let syncSucceeded = false;
    try {
      const contractIds = [...(await discoverAffectedContractIds(prisma, since, syncStartedAt))];
      const batches: string[][] = [];
      for (let i = 0; i < contractIds.length; i += ARCHIVE_SYNC_BATCH_SIZE) {
        batches.push(contractIds.slice(i, i + ARCHIVE_SYNC_BATCH_SIZE));
      }

      for (const batch of batches) {
        await processBatch(batch, summary);
      }

      if (summary.failed > 0) {
        syncSucceeded = false;
      } else {
        await prisma.archiveSyncState.update({
          where: { id: ARCHIVE_SYNC_STATE_ID },
          data: { lastSuccessfulSyncAt: syncStartedAt },
        });
        syncSucceeded = true;
      }
    } finally {
      await releaseRunningLock();
    }

    const stateAfter = await prisma.archiveSyncState.findUniqueOrThrow({
      where: { id: ARCHIVE_SYNC_STATE_ID },
    });

    const result: ArchiveSyncResultDto = {
      created: summary.created,
      updated: summary.updated,
      unchanged: summary.unchanged,
      failed: summary.failed,
      affectedContracts: summary.created + summary.updated + summary.unchanged + summary.failed,
      violationsCounted: summary.violationsCounted,
      syncStartedAt,
      lastSuccessfulSyncAt: stateAfter.lastSuccessfulSyncAt,
      errors: summary.errors.length > 0 ? summary.errors : undefined,
    };

    if (!syncSucceeded) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: "Archive sync completed with errors",
        context: { reason: "ARCHIVE_SYNC_FAILED", result },
      });
    }

    return result;
  }

  /**
   * Sync an explicit contract id list. Does not move the global cursor and does
   * not discover other contracts. Staff HTTP sync keeps using `runSync`.
   */
  async function syncContractIds(contractIds: string[]) {
    const summary = {
      created: 0,
      updated: 0,
      unchanged: 0,
      failed: 0,
      violationsCounted: 0,
      errors: [] as Array<{ contractId: string; message: string }>,
    };
    if (contractIds.length > 0) {
      await processBatch(contractIds, summary);
    }
    return summary;
  }

  async function acquireRunningLock(userId: number): Promise<boolean> {
    await ensureSyncStateRow(prisma);
    return tryAcquireRunningLock(userId, new Date());
  }

  return {
    runSync,
    getStatus,
    syncContractIds,
    acquireRunningLock,
    releaseRunningLock,
  };
}
