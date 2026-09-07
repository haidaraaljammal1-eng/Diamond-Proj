import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAcceptedVehiclePhotoFile,
  resolvePhotoPickerButtonKey,
} from "./vehicle-photo-picker.utils.ts";

describe("resolvePhotoPickerButtonKey", () => {
  it("returns uploadPhoto before a file is selected", () => {
    assert.equal(resolvePhotoPickerButtonKey(false), "uploadPhoto");
  });

  it("returns changePhoto after a file is selected", () => {
    assert.equal(resolvePhotoPickerButtonKey(true), "changePhoto");
  });
});

describe("isAcceptedVehiclePhotoFile", () => {
  it("accepts JPEG and PNG only", () => {
    assert.equal(
      isAcceptedVehiclePhotoFile({ type: "image/jpeg" } as File),
      true,
    );
    assert.equal(
      isAcceptedVehiclePhotoFile({ type: "image/png" } as File),
      true,
    );
    assert.equal(
      isAcceptedVehiclePhotoFile({ type: "application/pdf" } as File),
      false,
    );
  });
});
