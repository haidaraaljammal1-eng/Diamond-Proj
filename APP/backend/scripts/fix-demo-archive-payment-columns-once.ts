/**
 * One-off: clear transfer/remaining polluted by mistaken RECONCILIATION sync mapping
 * on Demo Test archive rows only (no manual override on those fields).
 */
import dotenv from "dotenv";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  isManualOverride,
  parseManualOverrides,
  serializeManualOverrides,
  setManualOverride,
} from "src/modules/archive/archive-manual-overrides";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const demoVehicles = await prisma.vehicle.findMany({
    where: {
      isActive: true,
      OR: [
        { vehicleName: { contains: "[Demo Test]", mode: "insensitive" } },
        { plateNumber: { contains: "DEMO", mode: "insensitive" } },
      ],
    },
    select: { id: true, vehicleName: true },
  });
  const vehicleIds = demoVehicles.map((v) => v.id);
  if (vehicleIds.length === 0) {
    console.log("No demo vehicles found — nothing to fix.");
    return;
  }

  const rows = await prisma.archiveRow.findMany({
    where: { vehicleId: { in: vehicleIds }, contractId: { not: null } },
  });

  let clearedTransferRemaining = 0;
  let clearedTotalOverride = 0;

  for (const row of rows) {
    const overrides = parseManualOverrides(row.manualOverrides);
    const data: {
      transfer?: null;
      remaining?: null;
      total?: number | null;
      manualOverrides?: ReturnType<typeof serializeManualOverrides>;
    } = {};

    const raw = row.manualOverrides as Record<string, boolean> | null;
    const transferManual = raw?.transfer === true;
    const remainingManual = raw?.remaining === true;

    if (
      (row.transfer != null || row.remaining != null) &&
      !transferManual &&
      !remainingManual
    ) {
      data.transfer = null;
      data.remaining = null;
      clearedTransferRemaining += 1;
    }

    const hasExtras =
      row.fuel != null ||
      row.salik != null ||
      row.parking != null ||
      row.blackPoints != null ||
      row.fines != null;

    if (
      isManualOverride(overrides, "total") &&
      !hasExtras &&
      row.total === row.rentalTotal &&
      row.rentalTotal != null
    ) {
      const nextOverrides = setManualOverride(overrides, "total", false);
      data.manualOverrides = serializeManualOverrides(nextOverrides);
      data.total = null;
      clearedTotalOverride += 1;
    }

    if (Object.keys(data).length > 0) {
      await prisma.archiveRow.update({ where: { id: row.id }, data });
      console.log(`Fixed archive row ${row.id} (contract ${row.contractId})`, data);
    }
  }

  console.log(
    `Done. demoVehicles=${vehicleIds.length} clearedTransferRemaining=${clearedTransferRemaining} clearedTotalOverride=${clearedTotalOverride}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
