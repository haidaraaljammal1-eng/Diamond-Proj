import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiRequestError } from "../../../infrastructure/api/errors.ts";
import { resolveMaintenanceErrorMessage } from "./resolve-maintenance-error.ts";

describe("resolveMaintenanceErrorMessage", () => {
  const t = Object.assign(
    (key: string) => {
      const map: Record<string, string> = {
        "error.VEHICLE_NOT_AVAILABLE_FOR_MAINTENANCE": "vehicle unavailable",
        "error.ACTIVE_MAINTENANCE_EXISTS": "active exists",
        "error.CONFLICT": "conflict",
        "error.generic": "generic",
      };
      return map[key] ?? key;
    },
    {
      has: (key: string) =>
        [
          "error.VEHICLE_NOT_AVAILABLE_FOR_MAINTENANCE",
          "error.ACTIVE_MAINTENANCE_EXISTS",
          "error.CONFLICT",
          "error.generic",
        ].includes(key),
    },
  );

  it("maps context.reason before HTTP code and never returns the raw backend message", () => {
    const error = new ApiRequestError(
      {
        code: "CONFLICT",
        message: "Vehicle is not available for maintenance",
        context: { reason: "VEHICLE_NOT_AVAILABLE_FOR_MAINTENANCE" },
      },
      409,
    );
    assert.equal(resolveMaintenanceErrorMessage(t, error), "vehicle unavailable");
  });

  it("falls back to the HTTP code then generic", () => {
    const conflict = new ApiRequestError(
      { code: "CONFLICT", message: "raw stack" },
      409,
    );
    assert.equal(resolveMaintenanceErrorMessage(t, conflict), "conflict");

    const unknown = new ApiRequestError(
      { code: "HTTP_500", message: "Internal" },
      500,
    );
    assert.equal(resolveMaintenanceErrorMessage(t, unknown), "generic");
  });
});
