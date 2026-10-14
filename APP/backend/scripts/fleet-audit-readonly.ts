/**
 * Read-only fleet inventory for haidara classification. No writes.
 * Run: npx tsx scripts/fleet-audit-readonly.ts
 */
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { parseDatabaseTarget, formatSafeDatabaseTarget } from "src/lib/dev/development-database";
import { normalizedNameExtension } from "src/lib/db/prisma-extensions";
import { DEMO_FLEET_EXTERNAL_ID_PREFIX } from "../prisma/seed/demo-fleet";

dotenv.config();

const REQUIRED_DB = "haidara";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const target = parseDatabaseTarget(url);
  if (target.database !== REQUIRED_DB) {
    throw new Error(
      `Refusing audit: expected database ${REQUIRED_DB}, got ${formatSafeDatabaseTarget(target)}`,
    );
  }

  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter }).$extends(normalizedNameExtension);
  await prisma.$connect();

  const dbIdentity = await prisma.$queryRaw<
    [{ current_database: string; inet_server_addr: string | null; inet_server_port: number | null }]
  >`SELECT current_database(), inet_server_addr(), inet_server_port()`;

  const total = await prisma.vehicle.count();
  const byCompany = await prisma.vehicle.groupBy({
    by: ["companyId"],
    _count: true,
  });
  const companies = await prisma.operatingCompany.findMany({
    select: { id: true, code: true, displayName: true },
  });
  const companyMap = new Map(companies.map((c) => [c.id, c]));

  const byOps = await prisma.vehicle.groupBy({
    by: ["operationalStatus"],
    _count: true,
  });
  const activeCount = await prisma.vehicle.count({ where: { isActive: true } });
  const inactiveCount = total - activeCount;

  const gpsBindings = await prisma.vehicleGpsBinding.findMany({
    where: { isActive: true },
    select: {
      id: true,
      vehicleId: true,
      externalDeviceId: true,
      providerKey: true,
      providerAccount: {
        select: {
          id: true,
          providerKey: true,
          accountKey: true,
          displayName: true,
        },
      },
    },
    orderBy: { vehicleId: "asc" },
  });

  const gpsVehicleIds = new Set(gpsBindings.map((b) => b.vehicleId));
  const vehicles = await prisma.vehicle.findMany({
    select: {
      id: true,
      externalId: true,
      vehicleName: true,
      plateNumber: true,
      vin: true,
      operationalStatus: true,
      isActive: true,
      companyId: true,
      createdAt: true,
    },
    orderBy: { id: "asc" },
  });

  const contractCounts = await prisma.contract.groupBy({
    by: ["vehicleId"],
    _count: true,
  });
  const contractByVehicle = new Map(contractCounts.map((r) => [r.vehicleId, r._count]));

  const demoPrefixCount = vehicles.filter(
    (v) => v.externalId?.startsWith(DEMO_FLEET_EXTERNAL_ID_PREFIX),
  ).length;

  const testNamePatterns = [
    /^Zero Rate/i,
    /^Ignored Status/i,
    /^First Fleet Car$/i,
    /^RN-/i,
    /^RG-/i,
    /^CT-/i,
    /^RCC /i,
    /^OCI-/i,
    /^E2E-/i,
    /^QA-/i,
    /^Bad /i,
    /^Blocked /i,
    /MV6AVH94/i,
    /MV6AUZJL/i,
    /MV66/i,
  ];

  const classified = vehicles.map((v) => {
    let bucket: "PROTECTED_GPS" | "VERIFIED_TEST" | "UNCERTAIN" = "UNCERTAIN";
    const reasons: string[] = [];
    const hasGps = gpsVehicleIds.has(v.id);
    if (hasGps) {
      bucket = "PROTECTED_GPS";
      reasons.push("active_gps_binding");
    } else if (v.externalId?.startsWith(DEMO_FLEET_EXTERNAL_ID_PREFIX)) {
      bucket = "VERIFIED_TEST";
      reasons.push("demo_fleet_external_id");
    } else if (
      (v.externalId ?? "").startsWith("INV-") ||
      (v.plateNumber ?? "").includes("INV ") ||
      (v.vehicleName ?? "").startsWith("INV-") ||
      testNamePatterns.some((re) => re.test(v.vehicleName ?? "")) ||
      testNamePatterns.some((re) => re.test(v.externalId ?? "")) ||
      testNamePatterns.some((re) => re.test(v.plateNumber ?? "")) ||
      (v.vin ?? "").includes("MV6AVH94")
    ) {
      bucket = "VERIFIED_TEST";
      reasons.push("integration_or_fixture_pattern");
    } else if (v.externalId && /^DEMO-FLEET-/i.test(v.externalId)) {
      bucket = "VERIFIED_TEST";
      reasons.push("demo_fleet_prefix");
    }

    return {
      id: v.id,
      externalId: v.externalId,
      vehicleName: v.vehicleName,
      plateNumber: v.plateNumber,
      vin: v.vin,
      operationalStatus: v.operationalStatus,
      isActive: v.isActive,
      company: companyMap.get(v.companyId)?.code ?? String(v.companyId),
      contractCount: contractByVehicle.get(v.id) ?? 0,
      bucket,
      reasons,
    };
  });

  const summary = {
    database: formatSafeDatabaseTarget(target),
    pgIdentity: dbIdentity[0],
    total,
    activeCount,
    inactiveCount,
    byOperationalStatus: byOps,
    byCompany: byCompany.map((r) => ({
      company: companyMap.get(r.companyId)?.code,
      count: r._count,
    })),
    gpsBindingCount: gpsBindings.length,
    vehiclesWithGps: gpsVehicleIds.size,
    vehiclesWithoutGps: total - gpsVehicleIds.size,
    vehiclesWithContracts: contractByVehicle.size,
    demoFleetExternalIdCount: demoPrefixCount,
    classification: {
      PROTECTED_GPS: classified.filter((c) => c.bucket === "PROTECTED_GPS").length,
      VERIFIED_TEST: classified.filter((c) => c.bucket === "VERIFIED_TEST").length,
      UNCERTAIN: classified.filter((c) => c.bucket === "UNCERTAIN").length,
    },
    gpsBindings,
    verifiedTestIds: classified.filter((c) => c.bucket === "VERIFIED_TEST").map((c) => c.id),
    uncertain: classified.filter((c) => c.bucket === "UNCERTAIN"),
    protectedGpsIds: [...gpsVehicleIds],
    all: classified,
  };

  const outPath = process.env.FLEET_AUDIT_OUT ?? "db-backups/_fleet-audit-haidara.json";
  const fs = await import("node:fs/promises");
  await fs.writeFile(outPath, JSON.stringify(summary, null, 2), "utf8");
  process.stdout.write(`Wrote ${outPath}\n`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
