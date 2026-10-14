/**
 * One-off: clean fake fleet on local `diamond`, keep GPS-bound vehicles, seed 20 demo.
 * Run: REBUILD_DEV_FLEET_EXECUTE=true npx tsx scripts/rebuild-dev-fleet-gps-safe.ts
 * Do not commit. Temporary operational script.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "src/config/env";
import { assertDevelopmentDatabase } from "src/lib/dev/development-database";
import { normalizePlateNumber } from "src/lib/master-data/code";
import {
  OPERATING_COMPANY_CODES,
  resolveSeedCompanyId,
  runOperatingCompanySeed,
} from "prisma/seed/operating-companies";

const EXECUTE = process.env.REBUILD_DEV_FLEET_EXECUTE === "true";
const DEMO_PREFIX = "DEMO-TEST-";
const PROTECTED_GPS_BINDING_COUNT = 27;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function loadProtectedVehicleIds(prisma: PrismaClient): Promise<number[]> {
  const bindings = await prisma.vehicleGpsBinding.findMany({
    where: { isActive: true },
    select: { vehicleId: true, externalDeviceId: true, providerKey: true },
    orderBy: { vehicleId: "asc" },
  });
  const ids = [...new Set(bindings.map((b) => b.vehicleId))].sort((a, b) => a - b);
  if (bindings.length !== PROTECTED_GPS_BINDING_COUNT || ids.length !== PROTECTED_GPS_BINDING_COUNT) {
    throw new Error(
      `Safety gate failed: expected ${PROTECTED_GPS_BINDING_COUNT} active GPS bindings, got rows=${bindings.length} uniqueVehicles=${ids.length}`,
    );
  }
  return ids;
}

async function snapshotGps(prisma: PrismaClient) {
  return {
    bindings: await prisma.vehicleGpsBinding.findMany({
      orderBy: { vehicleId: "asc" },
      select: {
        id: true,
        vehicleId: true,
        externalDeviceId: true,
        providerKey: true,
        providerAccountId: true,
        isActive: true,
      },
    }),
    providerAccounts: await prisma.gpsProviderAccount.findMany({
      select: {
        id: true,
        providerKey: true,
        accountKey: true,
        enabled: true,
        secretEncrypted: true,
        config: true,
      },
    }),
  };
}

async function purgeNonProtectedFleet(prisma: PrismaClient, protectedIds: number[]) {
  const vehicleIdFilter = { notIn: protectedIds };

  const contracts = await prisma.contract.findMany({
    where: { vehicleId: vehicleIdFilter },
    select: { id: true, vehicleId: true, contractNumber: true, status: true },
  });
  const contractIds = contracts.map((c) => c.id);

  const archiveDeleted = await prisma.archiveRow.deleteMany({ where: { vehicleId: vehicleIdFilter } });

  const ledgerDeleted = await prisma.financialLedgerEntry.deleteMany({
    where: {
      OR: [{ vehicleId: vehicleIdFilter }, { contractId: { in: contractIds } }],
    },
  });

  const liabilityIds = (
    await prisma.roadLiability.findMany({
      where: {
        OR: [{ vehicleId: vehicleIdFilter }, { attributedContractId: { in: contractIds } }],
      },
      select: { id: true },
    })
  ).map((r) => r.id);

  const offSessionDeleted = await prisma.contractPaymentOffSessionAttempt.deleteMany({
    where: { customerCharge: { contractId: { in: contractIds } } },
  });

  const postCloseDeleted = await prisma.contractPostCloseReceivable.deleteMany({
    where: { contractId: { in: contractIds } },
  });

  if (liabilityIds.length > 0) {
    await prisma.contractReconciliationLine.updateMany({
      where: { roadLiabilityId: { in: liabilityIds } },
      data: { roadLiabilityId: null },
    });
  }

  const customerChargesDeleted = await prisma.roadLiabilityCustomerCharge.deleteMany({
    where: { OR: [{ contractId: { in: contractIds } }, { roadLiabilityId: { in: liabilityIds } }] },
  });

  const observationsDeleted = await prisma.roadLiabilityObservation.deleteMany({
    where: {
      OR: [{ vehicleId: vehicleIdFilter }, { liabilityId: { in: liabilityIds } }],
    },
  });

  const liabilitiesDeleted = await prisma.roadLiability.deleteMany({
    where: {
      OR: [{ vehicleId: vehicleIdFilter }, { attributedContractId: { in: contractIds } }, { id: { in: liabilityIds } }],
    },
  });

  await prisma.contractReconciliation.updateMany({
    where: { contractId: { in: contractIds } },
    data: { settledPaymentId: null },
  });
  await prisma.contractRenewal.updateMany({
    where: { contractId: { in: contractIds } },
    data: { settledPaymentId: null },
  });
  await prisma.roadLiabilityCustomerCharge.updateMany({
    where: { contractPaymentId: { not: null } },
    data: { contractPaymentId: null },
  });

  const paymentAttemptsDeleted = await prisma.contractPaymentAttempt.deleteMany({
    where: { contractPayment: { contractId: { in: contractIds } } },
  });

  const authorizationsDeleted = await prisma.contractPaymentAuthorization.deleteMany({
    where: { contractId: { in: contractIds } },
  });

  const paymentsDeleted = await prisma.contractPayment.deleteMany({
    where: { contractId: { in: contractIds } },
  });

  const acceptanceDeleted = await prisma.contractAcceptance.deleteMany({
    where: { contractId: { in: contractIds } },
  });

  let contractsDeleted = 0;
  for (const batch of chunk(contractIds, 40)) {
    const res = await prisma.contract.deleteMany({ where: { id: { in: batch } } });
    contractsDeleted += res.count;
  }

  const purchaseDeleted = await prisma.purchaseExperience.deleteMany({ where: { vehicleId: vehicleIdFilter } });
  const photosDeleted = await prisma.vehiclePhoto.deleteMany({ where: { vehicleId: vehicleIdFilter } });

  const vehiclesBefore = await prisma.vehicle.findMany({
    where: { id: vehicleIdFilter },
    select: { id: true, plateNumber: true, vin: true, externalId: true, vehicleName: true },
  });

  const vehiclesDeleted = await prisma.vehicle.deleteMany({ where: { id: vehicleIdFilter } });

  return {
    contractsFound: contracts.length,
    contractsDeleted,
    vehiclesDeleted: vehiclesDeleted.count,
    vehiclesBefore,
    dependentDeletes: {
      archiveDeleted: archiveDeleted.count,
      ledgerDeleted: ledgerDeleted.count,
      offSessionDeleted: offSessionDeleted.count,
      postCloseDeleted: postCloseDeleted.count,
      customerChargesDeleted: customerChargesDeleted.count,
      observationsDeleted: observationsDeleted.count,
      liabilitiesDeleted: liabilitiesDeleted.count,
      paymentAttemptsDeleted: paymentAttemptsDeleted.count,
      authorizationsDeleted: authorizationsDeleted.count,
      paymentsDeleted: paymentsDeleted.count,
      acceptanceDeleted: acceptanceDeleted.count,
      purchaseDeleted: purchaseDeleted.count,
      photosDeleted: photosDeleted.count,
    },
  };
}

function fleetDerivedRates(dailyRate: number, monthlyRate: number) {
  return {
    hourlyRate: Math.round(dailyRate / 8),
    dailyRate,
    weeklyRate: Math.round(dailyRate * 7 * 0.88),
    monthlyRate,
  };
}

async function seedDemoFleet(
  prisma: PrismaClient,
  companyId: number,
  adminUserId: number,
) {
  const rentedSpecs = Array.from({ length: 10 }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return {
      externalId: `${DEMO_PREFIX}RENTED-${n}`,
      vehicleName: `[Demo Test] Rented Sedan ${n}`,
      plateNumber: normalizePlateNumber(`DXB DEMO R${n} ${10000 + i}`),
      vin: `DEMOVINR${n}0000000001`.slice(0, 17),
      dailyRate: 200 + i * 10,
      monthlyRate: 4000 + i * 100,
    };
  });

  const availableSpecs = Array.from({ length: 10 }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return {
      externalId: `${DEMO_PREFIX}AVAIL-${n}`,
      vehicleName: `[Demo Test] Available SUV ${n}`,
      plateNumber: normalizePlateNumber(`DXB DEMO A${n} ${20000 + i}`),
      vin: `DEMOVINA${n}0000000001`.slice(0, 17),
      dailyRate: 300 + i * 15,
      monthlyRate: 5500 + i * 120,
    };
  });

  const created: {
    rented: Array<{ vehicleId: number; contractId: string; externalId: string; plate: string }>;
    available: Array<{ vehicleId: number; externalId: string; plate: string }>;
  } = { rented: [], available: [] };

  const year = new Date().getUTCFullYear();
  let contractSeq = await prisma.contractNumberSequence.findUnique({ where: { year } });
  if (!contractSeq) {
    contractSeq = await prisma.contractNumberSequence.create({ data: { year, lastValue: 0 } });
  }

  for (let i = 0; i < rentedSpecs.length; i++) {
    const spec = rentedSpecs[i];
    const rates = fleetDerivedRates(spec.dailyRate, spec.monthlyRate);
    const vehicle = await prisma.vehicle.create({
      data: {
        companyId,
        externalId: spec.externalId,
        vehicleName: spec.vehicleName,
        plateNumber: spec.plateNumber,
        vin: spec.vin,
        modelYear: 2024,
        color: "Demo White",
        operationalStatus: "AVAILABLE",
        isActive: true,
        ...rates,
      },
    });

    const customer = await prisma.customer.create({
      data: {
        name: `[Demo Test] Renter ${spec.externalId}`,
        mobile: `+97150000${String(1000 + i).slice(-4)}`,
        externalId: `DEMO-CUST-RENTED-${String(i + 1).padStart(2, "0")}`,
        drivingLicenseExpiry: new Date("2028-12-31"),
      },
    });

    contractSeq = await prisma.contractNumberSequence.update({
      where: { year },
      data: { lastValue: { increment: 1 } },
    });
    const contractNumber = `DE-${year}-${String(contractSeq.lastValue).padStart(6, "0")}`;

    const now = new Date();
    const startAt = new Date(now);
    startAt.setUTCDate(startAt.getUTCDate() - 1);
    const endAt = new Date(now);
    endAt.setUTCDate(endAt.getUTCDate() + 2);

    const contract = await prisma.contract.create({
      data: {
        contractNumber,
        status: "ACTIVE",
        vehicleId: vehicle.id,
        companyId,
        customerId: customer.id,
        createdByUserId: adminUserId,
        collectionMode: "CASH",
        collectionModeSelectedAt: now,
        collectionModeSelectedByUserId: adminUserId,
        priceType: "DAILY",
        rentalDays: 3,
        durationValue: 3,
        durationUnit: "DAY",
        agreedAmount: spec.dailyRate * 3,
        startAt,
        endAt,
        activatedAt: now,
        carOut: {
          create: {
            performedByUserId: adminUserId,
            occurredAt: startAt,
            mileageOut: 1000 + i,
            fuelOut: "F",
          },
        },
      },
    });

    await prisma.contractPayment.create({
      data: {
        contractId: contract.id,
        purpose: "RENTAL",
        targetId: contract.id,
        method: "CASH",
        status: "CONFIRMED",
        amount: spec.dailyRate * 3,
        currency: "AED",
        confirmedAt: now,
        createdByUserId: adminUserId,
      },
    });

    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { operationalStatus: "RENTED" },
    });

    created.rented.push({
      vehicleId: vehicle.id,
      contractId: contract.id,
      externalId: spec.externalId,
      plate: spec.plateNumber,
    });
  }

  for (const spec of availableSpecs) {
    const rates = fleetDerivedRates(spec.dailyRate, spec.monthlyRate);
    const vehicle = await prisma.vehicle.create({
      data: {
        companyId,
        externalId: spec.externalId,
        vehicleName: spec.vehicleName,
        plateNumber: spec.plateNumber,
        vin: spec.vin,
        modelYear: 2025,
        color: "Demo Silver",
        operationalStatus: "AVAILABLE",
        isActive: true,
        ...rates,
      },
    });
    created.available.push({
      vehicleId: vehicle.id,
      externalId: spec.externalId,
      plate: spec.plateNumber,
    });
  }

  return created;
}

async function verify(prisma: PrismaClient, protectedIds: number[], gpsBefore: Awaited<ReturnType<typeof snapshotGps>>) {
  const gpsAfter = await snapshotGps(prisma);
  const bindingJsonBefore = JSON.stringify(gpsBefore.bindings);
  const bindingJsonAfter = JSON.stringify(gpsAfter.bindings);
  const accountsBefore = JSON.stringify(gpsBefore.providerAccounts);
  const accountsAfter = JSON.stringify(gpsAfter.providerAccounts);

  const activeBindings = await prisma.vehicleGpsBinding.count({ where: { isActive: true } });
  const demoRented = await prisma.vehicle.count({
    where: { externalId: { startsWith: `${DEMO_PREFIX}RENTED-` }, operationalStatus: "RENTED" },
  });
  const demoAvail = await prisma.vehicle.count({
    where: { externalId: { startsWith: `${DEMO_PREFIX}AVAIL-` }, operationalStatus: "AVAILABLE" },
  });
  const demoContracts = await prisma.contract.count({
    where: { vehicle: { externalId: { startsWith: `${DEMO_PREFIX}RENTED-` } }, status: "ACTIVE" },
  });
  const availActiveContracts = await prisma.contract.count({
    where: {
      vehicle: { externalId: { startsWith: `${DEMO_PREFIX}AVAIL-` } },
      status: { in: ["PAID", "ACTIVE", "RETOUT", "REVIEW", "AWAITING", "FORM", "SIGNED"] },
    },
  });
  const orphanArchive = await prisma.archiveRow.count({
    where: { OR: [{ contractId: { not: null }, contract: null }] },
  });

  return {
    gpsBindingsUnchanged: bindingJsonBefore === bindingJsonAfter,
    gpsAccountsUnchanged: accountsBefore === accountsAfter,
    activeGpsBindings: activeBindings,
    protectedVehicleCount: protectedIds.length,
    totalVehicles: await prisma.vehicle.count(),
    demoRented,
    demoAvail,
    demoActiveContracts: demoContracts,
    availActiveContracts,
    orphanArchiveRows: orphanArchive,
    oldDemoFleetRemaining: await prisma.vehicle.count({ where: { externalId: { startsWith: "DEMO-FLEET-" } } }),
    contractsOnDeletedVehicles: await prisma.contract.count({ where: { vehicleId: { notIn: protectedIds }, vehicle: { gpsBinding: null } } }),
  };
}

async function main() {
  const target = assertDevelopmentDatabase({
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
  });
  if (target.database === "haidara_test") {
    throw new Error("Refusing haidara_test");
  }
  if (target.database !== "diamond") {
    throw new Error(`Expected database diamond, got ${target.database}`);
  }

  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const protectedIds = await loadProtectedVehicleIds(prisma);
  const gpsBefore = await snapshotGps(prisma);

  const beforeVehicles = await prisma.vehicle.count();
  const beforeContracts = await prisma.contract.count({
    where: { vehicleId: { notIn: protectedIds } },
  });

  const backupDir = join(process.cwd(), ".tmp");
  await mkdir(backupDir, { recursive: true });
  const backupPath = join(backupDir, `rebuild-fleet-backup-${Date.now()}.json`);

  const candidateVehicles = await prisma.vehicle.findMany({
    where: { id: { notIn: protectedIds } },
    select: { id: true, plateNumber: true, vin: true, externalId: true, vehicleName: true },
    orderBy: { id: "asc" },
  });

  await writeFile(
    backupPath,
    JSON.stringify(
      {
        database: target.database,
        protectedGpsVehicleIds: protectedIds,
        gpsSnapshot: gpsBefore,
        before: { vehicles: beforeVehicles, contractsOnCandidates: beforeContracts },
        candidateVehicles,
        dependentCounts: {
          archiveRow: await prisma.archiveRow.count({ where: { vehicleId: { notIn: protectedIds } } }),
          contractPayment: await prisma.contractPayment.count({
            where: { contract: { vehicleId: { notIn: protectedIds } } },
          }),
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  const plan = {
    mode: EXECUTE ? "execute" : "dry-run",
    database: `${target.host}:${target.port}/${target.database}`,
    protectedGpsVehicleIds: protectedIds,
    beforeVehicles,
    candidateDeleteVehicles: candidateVehicles.length,
    beforeContractsOnCandidates: beforeContracts,
    backupPath,
  };

  if (!EXECUTE) {
    console.log(JSON.stringify(plan, null, 2));
    await prisma.$disconnect();
    return;
  }

  const purge = await purgeNonProtectedFleet(prisma, protectedIds);

  await runOperatingCompanySeed(prisma);
  const companyId = await resolveSeedCompanyId(prisma, OPERATING_COMPANY_CODES.UNIQUE);
  const admin =
    (await prisma.user.findFirst({
      where: { roles: { some: { role: { key: "system_admin" } } }, status: "ACTIVE" },
      orderBy: { id: "asc" },
      select: { id: true, email: true },
    })) ??
    (await prisma.user.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { id: "asc" },
      select: { id: true, email: true },
    }));
  if (!admin) {
    throw new Error("No active user found for contract createdByUserId");
  }

  const seeded = await seedDemoFleet(prisma, companyId, admin.id);
  const verification = await verify(prisma, protectedIds, gpsBefore);

  const report = {
    ...plan,
    purge,
    seeded,
    verification,
  };

  const reportPath = join(backupDir, `rebuild-fleet-report-${Date.now()}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify({ reportPath, verification }, null, 2));

  const pass =
    verification.gpsBindingsUnchanged &&
    verification.gpsAccountsUnchanged &&
    verification.activeGpsBindings === PROTECTED_GPS_BINDING_COUNT &&
    verification.demoRented === 10 &&
    verification.demoAvail === 10 &&
    verification.demoActiveContracts === 10 &&
    verification.availActiveContracts === 0 &&
    verification.orphanArchiveRows === 0 &&
    verification.oldDemoFleetRemaining === 0 &&
    verification.totalVehicles === protectedIds.length + 20;

  if (!pass) {
    throw new Error("Final verification failed — see report");
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
