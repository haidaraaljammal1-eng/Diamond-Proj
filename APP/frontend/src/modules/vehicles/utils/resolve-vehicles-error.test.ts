import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiRequestError } from "../../../infrastructure/api/errors.ts";
import { resolveVehiclesErrorMessage } from "./resolve-vehicles-error.ts";

describe("resolveVehiclesErrorMessage", () => {
  const t = Object.assign(
    (key: string) => {
      const map: Record<string, string> = {
        "form.error.duplicatePlate": "duplicate plate",
        "form.error.duplicateVin": "duplicate vin",
        "form.error.rentedLocked": "rented locked",
        "form.error.CONFLICT": "generic conflict",
        "error.generic": "generic",
      };
      return map[key] ?? key;
    },
    {
      has: (key: string) =>
        [
          "form.error.duplicatePlate",
          "form.error.duplicateVin",
          "form.error.rentedLocked",
          "form.error.CONFLICT",
          "error.generic",
        ].includes(key),
    },
  );

  it("maps duplicate plate conflicts", () => {
    const error = new ApiRequestError(
      {
        code: "CONFLICT",
        message: "A vehicle with this plate number already exists",
      },
      409,
    );
    assert.equal(resolveVehiclesErrorMessage(t, error), "duplicate plate");
  });

  it("maps duplicate VIN conflicts", () => {
    const error = new ApiRequestError(
      {
        code: "CONFLICT",
        message: "A vehicle with this VIN already exists",
      },
      409,
    );
    assert.equal(resolveVehiclesErrorMessage(t, error), "duplicate vin");
  });

  it("maps rented vehicle lock conflicts", () => {
    const error = new ApiRequestError(
      {
        code: "CONFLICT",
        message: "Vehicle is rented and cannot be modified",
      },
      409,
    );
    assert.equal(resolveVehiclesErrorMessage(t, error), "rented locked");
  });
});
