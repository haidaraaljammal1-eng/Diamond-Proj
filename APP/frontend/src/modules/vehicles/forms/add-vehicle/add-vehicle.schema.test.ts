import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addVehicleFormSchema } from "./add-vehicle.schema.ts";
import { toCreateVehiclePayload } from "./add-vehicle.types.ts";

describe("addVehicleFormSchema", () => {
  it("requires vehicleName", () => {
    const result = addVehicleFormSchema.safeParse({
      vehicleName: "",
      modelYear: "",
      plateNumber: "",
      color: "",
      dailyRate: "",
      monthlyRate: "",
      vin: "",
    });
    assert.equal(result.success, false);
  });

  it("accepts minimal valid payload", () => {
    const result = addVehicleFormSchema.safeParse({
      vehicleName: "Toyota Land Cruiser",
      modelYear: "",
      plateNumber: "",
      color: "",
      dailyRate: "",
      monthlyRate: "",
      vin: "",
    });
    assert.equal(result.success, true);
  });

  it("rejects negative daily rate", () => {
    const result = addVehicleFormSchema.safeParse({
      vehicleName: "Toyota Land Cruiser",
      modelYear: "",
      plateNumber: "",
      color: "",
      dailyRate: "-5",
      monthlyRate: "",
      vin: "",
    });
    assert.equal(result.success, false);
  });

  it("rejects invalid model year", () => {
    const result = addVehicleFormSchema.safeParse({
      vehicleName: "Toyota Land Cruiser",
      modelYear: "1800",
      plateNumber: "",
      color: "",
      dailyRate: "",
      monthlyRate: "",
      vin: "",
    });
    assert.equal(result.success, false);
  });

  it("does not include operationalStatus", () => {
    assert.equal("operationalStatus" in addVehicleFormSchema.shape, false);
  });

  it("does not include modelId", () => {
    assert.equal("modelId" in addVehicleFormSchema.shape, false);
  });

  it("does not include isActive", () => {
    assert.equal("isActive" in addVehicleFormSchema.shape, false);
  });
});

describe("toCreateVehiclePayload", () => {
  it("maps form values to API payload without modelId", () => {
    const payload = toCreateVehiclePayload({
      vehicleName: "Toyota Land Cruiser",
      modelYear: "2024",
      plateNumber: "A 12345",
      color: "White",
      dailyRate: "1200",
      monthlyRate: "24000",
      vin: "VIN123",
    });
    assert.deepEqual(payload, {
      vehicleName: "Toyota Land Cruiser",
      modelYear: 2024,
      plateNumber: "A 12345",
      color: "White",
      dailyRate: 1200,
      monthlyRate: 24000,
      vin: "VIN123",
    });
    assert.equal("modelId" in payload, false);
  });
});
