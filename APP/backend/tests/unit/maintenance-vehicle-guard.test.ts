import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { AppError } from "src/lib/errors/app-error";
import { assertVehicleOperationalStatusAllowedWithActiveMaintenance } from "src/modules/maintenance/maintenance-vehicle-guard";

describe("maintenance vehicle guard", () => {
  it("allows no-op operational status changes", async () => {
    const db = {
      maintenanceOrder: {
        findFirst: async () => null,
      },
    } as unknown as PrismaClient;

    await assertVehicleOperationalStatusAllowedWithActiveMaintenance(
      db,
      1,
      "SERVICE",
      "SERVICE",
    );
  });

  it("blocks leaving SERVICE while maintenance is IN_SERVICE", async () => {
    const db = {
      maintenanceOrder: {
        findFirst: async () => ({ status: "IN_SERVICE" }),
      },
    } as unknown as PrismaClient;

    await assert.rejects(
      () =>
        assertVehicleOperationalStatusAllowedWithActiveMaintenance(
          db,
          1,
          "SERVICE",
          "AVAILABLE",
        ),
      (err: unknown) =>
        err instanceof AppError &&
        err.context?.reason === "VEHICLE_ACTIVE_MAINTENANCE_BLOCKS_STATUS",
    );
  });

  it("blocks RENTED while any active maintenance exists", async () => {
    const db = {
      maintenanceOrder: {
        findFirst: async () => ({ status: "SCHEDULED" }),
      },
    } as unknown as PrismaClient;

    await assert.rejects(
      () =>
        assertVehicleOperationalStatusAllowedWithActiveMaintenance(
          db,
          1,
          "AVAILABLE",
          "RENTED",
        ),
      (err: unknown) =>
        err instanceof AppError &&
        err.context?.reason === "VEHICLE_ACTIVE_MAINTENANCE_BLOCKS_STATUS",
    );
  });
});
