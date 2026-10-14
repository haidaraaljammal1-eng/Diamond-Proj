/**
 * Deletes ONLY manifest-listed VERIFIED_TEST vehicles on haidara.
 * Requires FLEET_DELETE_CONFIRM=YES and DATABASE_URL pointing at haidara.
 */
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { withTransaction } from "src/lib/db/transaction";
import { parseDatabaseTarget, formatSafeDatabaseTarget } from "src/lib/dev/development-database";
import { normalizedNameExtension } from "src/lib/db/prisma-extensions";
import { createPendingRentalRequestDeleteService } from "src/modules/contracts/pending-rental-request-delete.service";

dotenv.config();

const REQUIRED_DB = "haidara";

/** From fleet audit 2026-10-13 — non-GPS integration/fixture vehicles only. */
const MANIFEST_VEHICLE_IDS = [
  568, 569, 572, 573, 576, 577, 580, 581, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611,
  612, 613, 614, 615, 616, 617, 618, 619, 620, 621, 622, 623, 624, 625, 626, 627,
] as const;

const EXCLUDE_NAME_PREFIX = "QA-RENEWAL-VISUAL-";

const TEST_PATTERNS = [
  /^INV-/i,
  /INV /i,
  /MV6AVH94/i,
  /MV6AUZJL/i,
  /MV66/i,
];

async function deletePaidTestContractWithoutCarOut(
  prisma: PrismaClient,
  contractId: string,
  expectedVehicleId: number,
): Promise<void> {
  await withTransaction(prisma, async (tx) => {
    const contract = await tx.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        vehicleId: true,
        status: true,
        carOut: { select: { id: true } },
        carIn: { select: { id: true } },
        reconciliation: { select: { id: true } },
        customerId: true,
      },
    });
    if (!contract || contract.vehicleId !== expectedVehicleId) {
      throw new Error(`Contract ${contractId} missing or vehicle mismatch`);
    }
    if (contract.carOut || contract.carIn || contract.reconciliation) {
      throw new Error(`Contract ${contractId} has car-out/in/reconciliation — abort`);
    }
    if (!["PAID", "SIGNED", "FORM", "AWAITING"].includes(contract.status)) {
      throw new Error(`Contract ${contractId} status ${contract.status} not deletable here`);
    }

    const invoices = await tx.invoice.findMany({
      where: { contractId },
      select: { id: true },
    });
    if (invoices.length > 0) {
      await tx.invoiceLine.deleteMany({
        where: { invoiceId: { in: invoices.map((i) => i.id) } },
      });
      await tx.invoiceDelivery.deleteMany({
        where: { invoiceId: { in: invoices.map((i) => i.id) } },
      });
      await tx.invoice.deleteMany({ where: { id: { in: invoices.map((i) => i.id) } } });
    }

    await tx.financialLedgerEntry.deleteMany({ where: { contractId } });
    const payments = await tx.contractPayment.findMany({
      where: { contractId },
      select: { id: true },
    });
    const paymentIds = payments.map((p) => p.id);
    if (paymentIds.length > 0) {
      await tx.contractPaymentOffSessionAttempt.deleteMany({
        where: { contractPaymentId: { in: paymentIds } },
      });
    }
    await tx.contractPaymentAuthorization.deleteMany({ where: { contractId } });
    for (const payment of payments) {
      await tx.contractPaymentAllocation.deleteMany({ where: { contractPaymentId: payment.id } });
      await tx.contractPaymentAttempt.deleteMany({ where: { contractPaymentId: payment.id } });
    }
    await tx.contractPayment.deleteMany({ where: { contractId } });
    await tx.contractCardPaymentMethod.deleteMany({ where: { contractId } });
    await tx.drivingLicenseExtraction.deleteMany({ where: { contractId } });
    await tx.passportExtraction.deleteMany({ where: { contractId } });
    await tx.drivingLicenseVerification.deleteMany({ where: { contractId } });
    await tx.officialContractSignature.deleteMany({ where: { contractId } });
    await tx.contractDocument.deleteMany({ where: { contractId } });
    await tx.contractAcceptance.deleteMany({ where: { contractId } });
    await tx.officialContractReviewDraft.deleteMany({ where: { contractId } });
    await tx.contractLink.deleteMany({ where: { contractId } });
    await tx.tarsOperation.deleteMany({ where: { contractId } });
    await tx.tarsContractOtpChallenge.deleteMany({ where: { contractId } });
    await tx.tarsContractIntegration.deleteMany({ where: { contractId } });
    await tx.contractRenewal.deleteMany({ where: { contractId } });
    await tx.contract.delete({ where: { id: contractId } });

    if (contract.customerId != null) {
      const other = await tx.contract.count({
        where: { customerId: contract.customerId },
      });
      if (other === 0) {
        await tx.customerPaymentMethod.deleteMany({
          where: { profile: { customerId: contract.customerId } },
        });
        await tx.customerPaymentProfile.deleteMany({ where: { customerId: contract.customerId } });
        await tx.customer.deleteMany({ where: { id: contract.customerId } });
      }
    }
  });
}

async function deleteVehicleDbOnly(prisma: PrismaClient, vehicleId: number): Promise<void> {
  await prisma.vehiclePhoto.deleteMany({ where: { vehicleId } });
  await prisma.purchaseExperience.deleteMany({ where: { vehicleId } });
  await prisma.vehicle.delete({ where: { id: vehicleId } });
}

async function main(): Promise<void> {
  if (process.env.FLEET_DELETE_CONFIRM !== "YES") {
    throw new Error("Set FLEET_DELETE_CONFIRM=YES to execute deletions");
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const target = parseDatabaseTarget(url);
  if (target.database !== REQUIRED_DB) {
    throw new Error(`Refusing: expected ${REQUIRED_DB}, got ${formatSafeDatabaseTarget(target)}`);
  }

  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter }).$extends(normalizedNameExtension);
  const db = prisma as unknown as PrismaClient;
  await prisma.$connect();

  const gpsBefore = await prisma.vehicleGpsBinding.findMany({
    where: { isActive: true },
    select: { id: true, vehicleId: true },
    orderBy: { vehicleId: "asc" },
  });
  const gpsIdsBefore = gpsBefore.map((b) => b.vehicleId);

  const pendingDelete = createPendingRentalRequestDeleteService(db);
  const admin = await prisma.user.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (!admin) throw new Error("No admin user for pending delete API");

  const results: Array<{ vehicleId: number; ok: boolean; detail: string }> = [];

  for (const vehicleId of MANIFEST_VEHICLE_IDS) {
    try {
      const vehicle = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: {
          id: true,
          vehicleName: true,
          plateNumber: true,
          externalId: true,
          vin: true,
          operationalStatus: true,
        },
      });
      if (!vehicle) {
        results.push({ vehicleId, ok: true, detail: "already_absent" });
        continue;
      }
      if ((vehicle.vehicleName ?? "").startsWith(EXCLUDE_NAME_PREFIX)) {
        results.push({ vehicleId, ok: true, detail: "excluded_qa_renewal_fixture" });
        continue;
      }
      const gps = await prisma.vehicleGpsBinding.count({
        where: { vehicleId, isActive: true },
      });
      if (gps > 0) {
        throw new Error(`Vehicle ${vehicleId} has GPS binding — abort`);
      }
      const label = `${vehicle.vehicleName ?? ""}|${vehicle.plateNumber ?? ""}|${vehicle.externalId ?? ""}|${vehicle.vin ?? ""}`;
      if (!TEST_PATTERNS.some((re) => re.test(label))) {
        throw new Error(`Vehicle ${vehicleId} failed pattern recheck: ${label}`);
      }

      const contracts = await prisma.contract.findMany({
        where: { vehicleId },
        select: { id: true, status: true, contractNumber: true },
      });
      for (const c of contracts) {
        if (["AWAITING", "FORM", "SIGNED"].includes(c.status)) {
          await pendingDelete.deletePendingRentalRequest(c.id, { expectedVehicleId: vehicleId });
        } else if (c.status === "PAID") {
          await deletePaidTestContractWithoutCarOut(db, c.id, vehicleId);
        } else {
          throw new Error(`Contract ${c.id} status ${c.status} blocks vehicle ${vehicleId}`);
        }
      }

      if (vehicle.operationalStatus === "RENTED") {
        await prisma.vehicle.update({
          where: { id: vehicleId },
          data: { operationalStatus: "AVAILABLE" },
        });
      }

      await deleteVehicleDbOnly(db, vehicleId);
      results.push({ vehicleId, ok: true, detail: `removed contracts=${contracts.length}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ vehicleId, ok: false, detail: message });
      throw new Error(`Stopped at vehicle ${vehicleId}: ${message}`);
    }
  }

  const gpsAfter = await prisma.vehicleGpsBinding.findMany({
    where: { isActive: true },
    select: { id: true, vehicleId: true },
    orderBy: { vehicleId: "asc" },
  });
  const totalAfter = await prisma.vehicle.count();

  const out = {
    database: formatSafeDatabaseTarget(target),
    vehiclesRemoved: results.filter((r) => r.detail.startsWith("removed") || r.detail === "already_absent").length,
    results,
    vehicleCountAfter: totalAfter,
    gpsBindingCountAfter: gpsAfter.length,
    gpsVehicleIdsBefore: gpsIdsBefore,
    gpsVehicleIdsAfter: gpsAfter.map((b) => b.vehicleId),
    gpsBindingIdsBefore: gpsBefore.map((b) => b.id),
    gpsBindingIdsAfter: gpsAfter.map((b) => b.id),
  };

  const fs = await import("node:fs/promises");
  await fs.writeFile("db-backups/_fleet-delete-result.json", JSON.stringify(out, null, 2), "utf8");
  process.stdout.write(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
