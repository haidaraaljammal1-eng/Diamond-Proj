import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computePublicContractEditableFields } from "src/modules/contracts/official-contract-editability";

describe("computePublicContractEditableFields", () => {
  it("locks OCR-populated identity fields and keeps empty manual fields editable", () => {
    const editable = computePublicContractEditableFields(
      {
        "hirer.name": "PASSPORT_OCR",
        "hirer.nationality": "PASSPORT_OCR",
        "hirer.passportNumber": "PASSPORT_OCR",
        "hirer.address": "NONE",
        "hirer.telephone": "NONE",
        "hirer.driverLicenseNumber": "DRIVER_LICENSE_OCR",
        "hirer.driverLicenseExpiryDate": "DRIVER_LICENSE_OCR",
      },
      {
        "hirer.name": "DEMO CUSTOMER",
        "hirer.nationality": "UAE",
        "hirer.passportNumber": "P1234567",
        "hirer.address": "",
        "hirer.telephone": "",
      },
    );
    assert.deepEqual(editable, [
      "address",
      "telephone",
      "additionalDriverName",
      "additionalDriverNationality",
      "additionalDriverLicenseNumber",
      "sponsorName",
      "sponsorIdNumber",
    ]);
  });

  it("keeps empty OCR-backed fields editable until populated", () => {
    const editable = computePublicContractEditableFields(
      { "hirer.name": "PASSPORT_OCR" },
      { "hirer.name": "" },
    );
    assert.ok(editable.includes("hirerName"));
  });
});
