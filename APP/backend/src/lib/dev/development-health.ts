/* eslint-disable no-console -- CLI output for `dev:bootstrap` / `dev:check`. */
import type { PrismaClient } from "@prisma/client";
import { PERMISSION_CATALOG } from "src/constants/permissions";
import { SYSTEM_ROLES } from "src/constants/roles";
import {
  DEMO_FLEET,
  DEMO_FLEET_EXTERNAL_ID_PREFIX,
  DEMO_FLEET_EXTERNAL_IDS,
} from "prisma/seed/demo-fleet";

export interface DevelopmentHealth {
  connected: boolean;
  environment: string;
  host: string;
  database: string;
  migrations: "UP TO DATE" | "PENDING" | "UNKNOWN";
  prismaClient: "CURRENT" | "STALE";
  permissionCatalog: { db: number; catalog: number };
  systemAdminPermissions: number;
  demoFleet: { found: number; expected: number };
  demoFleetActive: number;
  totalVehicles: number;
  activeVehicles: number;
  contractsTable: "AVAILABLE" | "MISSING";
}

export async function collectDevelopmentHealth(
  prisma: PrismaClient,
  target: { host: string; database: string; environment: string },
  migrations: DevelopmentHealth["migrations"],
): Promise<DevelopmentHealth> {
  const prismaClient: DevelopmentHealth["prismaClient"] =
    typeof prisma.contract?.count === "function" ? "CURRENT" : "STALE";

  const [
    permissionCount,
    adminPermissionCount,
    demoFleet,
    demoFleetActive,
    totalVehicles,
    activeVehicles,
    contractsTable,
  ] = await Promise.all([
    prisma.permission.count(),
    prisma.rolePermission.count({
      where: { role: { key: SYSTEM_ROLES.SYSTEM_ADMIN } },
    }),
    prisma.vehicle.count({
      where: { externalId: { in: [...DEMO_FLEET_EXTERNAL_IDS] } },
    }),
    prisma.vehicle.count({
      where: {
        isActive: true,
        externalId: { in: [...DEMO_FLEET_EXTERNAL_IDS] },
      },
    }),
    prisma.vehicle.count(),
    prisma.vehicle.count({ where: { isActive: true } }),
    prisma.contract
      .count()
      .then(() => "AVAILABLE" as const)
      .catch(() => "MISSING" as const),
  ]);

  return {
    connected: true,
    environment: target.environment,
    host: target.host,
    database: target.database,
    migrations,
    prismaClient,
    permissionCatalog: { db: permissionCount, catalog: PERMISSION_CATALOG.length },
    systemAdminPermissions: adminPermissionCount,
    demoFleet: { found: demoFleet, expected: DEMO_FLEET.length },
    demoFleetActive,
    totalVehicles,
    activeVehicles,
    contractsTable,
  };
}

export function printDevelopmentHealth(health: DevelopmentHealth): void {
  const perm =
    `${health.permissionCatalog.db}/${health.permissionCatalog.catalog}`;
  console.log(`Database:            ${health.connected ? "CONNECTED" : "DISCONNECTED"}`);
  console.log(`Environment:         ${health.environment}`);
  console.log(`Development database: ${health.host} / ${health.database}`);
  console.log(`Migrations:          ${health.migrations}`);
  console.log(`Prisma:              ${health.prismaClient}`);
  console.log(`Permission catalog:  ${perm}`);
  console.log(`system_admin grants: ${health.systemAdminPermissions}`);
  console.log(
    `Demo Fleet:          ${health.demoFleet.found}/${health.demoFleet.expected} seed records found`,
  );
  console.log(`Active Demo Fleet:   ${health.demoFleetActive}`);
  console.log(`Total Vehicles:      ${health.totalVehicles}`);
  console.log(`Active Vehicles:     ${health.activeVehicles}`);
  console.log(`Contracts table:     ${health.contractsTable}`);
  console.log(`Demo prefix:         ${DEMO_FLEET_EXTERNAL_ID_PREFIX}*`);
}

export function assertBootstrappedState(health: DevelopmentHealth): void {
  const errors: string[] = [];
  if (health.migrations === "PENDING") {
    errors.push("migrations are still PENDING");
  }
  if (health.prismaClient !== "CURRENT") {
    errors.push("Prisma Client looks STALE (missing Contract delegate)");
  }
  if (health.permissionCatalog.db < health.permissionCatalog.catalog) {
    errors.push(
      `permission catalog incomplete (${health.permissionCatalog.db}/${health.permissionCatalog.catalog})`,
    );
  }
  if (health.systemAdminPermissions < health.permissionCatalog.catalog) {
    errors.push("system_admin is missing catalog permissions");
  }
  if (health.demoFleet.found < health.demoFleet.expected) {
    errors.push(
      `Demo Fleet incomplete (${health.demoFleet.found}/${health.demoFleet.expected})`,
    );
  }
  if (health.contractsTable !== "AVAILABLE") {
    errors.push("Contracts table is not available");
  }
  if (errors.length > 0) {
    throw new Error(`[dev:bootstrap] verification failed:\n- ${errors.join("\n- ")}`);
  }
}
