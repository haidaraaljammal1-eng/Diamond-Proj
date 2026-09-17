import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildOfficialContractView,
  OFFICIAL_CONTRACT_EDITABLE_FIELDS,
  type OfficialContractRow,
} from "src/modules/contracts/official-contract";
import { OfficialContractReviewPatchSchema } from "src/modules/contracts/contracts.schema";

const now = new Date("2026-09-17T08:00:00.000Z");
const start = new Date("2026-09-20T09:00:00.000Z");

function row(overrides: Partial<Record<keyof OfficialContractRow, unknown>> = {}): OfficialContractRow {
  return {
    id: "c1",
    contractNumber: "DE-2026-000391",
    status: "AWAITING",
    vehicleId: 7,
    customerId: null,
    createdByUserId: 1,
    assignedEmployeeUserId: null,
    priceType: "DAILY",
    rentalDays: 3,
    agreedAmount: 900,
    currency: "AED",
    startAt: start,
    endAt: new Date(start.getTime() + 3 * 86_400_000),
    depositAmount: 5000,
    snapshot: null,
    termsVersion: "diamond-rental-terms-v1",
    activatedAt: null,
    closedAt: null,
    createdAt: now,
    updatedAt: now,
    revision: 0,
    vehicle: {
      id: 7,
      vehicleName: "Nissan Patrol",
      plateNumber: "Q 12345",
      modelYear: 2025,
      color: "White",
      dailyRate: 999,
      monthlyRate: 9999,
      model: null,
    },
    customer: null,
    acceptance: null,
    licenseVerifications: [
      { status: "VALID", licenseNumber: "DL-1", expiryDate: new Date("2031-06-01T12:00:00.000Z"), updatedAt: now },
    ],
    passportExtractions: [
      {
        status: "READY",
        fullName: "TEST PERSON",
        nationality: "TEST",
        passportNumber: "TEST123456",
        dateOfBirth: null,
        sex: null,
        passportIssueDate: null,
        passportExpiryDate: null,
        issuingCountry: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    officialReviewDraft: null,
    officialSignatures: [],
    carOut: null,
    carIn: null,
    ...overrides,
  } as unknown as OfficialContractRow;
}

const build = (r: OfficialContractRow) => buildOfficialContractView(r, { officeDisplayName: "Diamond Rent Car", now });

test("source mapping: agreement, vehicle, passport hirer, license", () => {
  const { view, provenance } = build(row());
  assert.equal(view.contract.agreementNumber, "DE-2026-000391");
  assert.equal(view.vehicle.vehicleType, "Nissan Patrol");
  assert.equal(view.vehicle.plateNumber, "Q 12345");
  assert.equal(view.vehicle.yearMade, 2025);
  assert.equal(view.vehicle.color, "White");
  assert.equal(view.vehicle.plateCode, null, "plate code is never parsed from plate text");
  assert.equal(view.vehicle.notes, null);
  assert.equal(view.hirer.name, "TEST PERSON");
  assert.equal(view.hirer.nationality, "TEST");
  assert.equal(view.hirer.passportNumber, "TEST123456");
  assert.equal(view.hirer.driverLicenseNumber, "DL-1");
  assert.equal(view.hirer.driverLicenseExpiryDate, "2031-06-01");
  assert.equal(view.hirer.address, null);
  assert.equal(view.hirer.telephone, null);
  assert.deepEqual(view.additionalDriver, { name: null, nationality: null, driverLicenseNumber: null });
  assert.deepEqual(view.sponsor, { name: null, idNumber: null });
  assert.equal(provenance["contract.agreementNumber"], "CONTRACT");
  assert.equal(provenance["vehicle.vehicleType"], "VEHICLE");
  assert.equal(provenance["hirer.name"], "PASSPORT_OCR");
  assert.equal(provenance["hirer.driverLicenseNumber"], "DRIVER_LICENSE_OCR");
  assert.equal(view.contract.templateVersion, "DIAMOND_CONTRACT_V1");
});

test("price policy: no rental price, rate amount, rate basis or vehicle rates in the official view", () => {
  for (const priceType of ["DAILY", "WEEKLY", "MONTHLY", "CUSTOM"] as const) {
    const { view } = build(row({ priceType, agreedAmount: 4321 }));
    const json = JSON.stringify(view);
    for (const banned of [
      "rateAmount",
      "agreedAmount",
      "rateType",
      "dailyRate",
      "weeklyRate",
      "monthlyRate",
      "priceType",
      "currency",
      "4321",
      "999",
      priceType,
    ]) {
      assert.equal(json.includes(banned), false, `${priceType}: ${banned}`);
    }
  }
});

test("rental: server days and period; no invented km", () => {
  const { view, provenance } = build(row());
  assert.equal(view.rental.numberOfDays, 3);
  assert.equal(view.rental.periodConsistent, true);
  assert.equal(view.rental.includedKmPerDay, null);
  assert.equal(view.rental.extraKmRate, null);
  assert.equal(provenance["rental.includedKmPerDay"], "NONE");
  assert.equal(view.rental.plannedStartAt?.toISOString(), start.toISOString());

  const mismatched = build(row({ endAt: new Date(start.getTime() + 5 * 86_400_000) })).view;
  assert.equal(mismatched.rental.periodConsistent, false);
});

test("custody: before events null/read-only, after events actual values", () => {
  const before = build(row({ status: "PAID" })).view;
  assert.equal(before.vehicleOut.status, "NOT_AVAILABLE");
  assert.equal(before.vehicleOut.mileage, null);
  assert.equal(before.vehicleOut.occurredAt, null);
  assert.equal(before.vehicleIn.status, "NOT_AVAILABLE");

  const outAt = new Date("2026-09-20T10:15:00.000Z");
  const inAt = new Date("2026-09-23T08:40:00.000Z");
  const after = build(
    row({
      status: "REVIEW",
      carOut: { occurredAt: outAt, mileageOut: 12000, fuelOut: "F", photos: [{ angle: "FRONT" }] },
      carIn: { occurredAt: inAt, mileageIn: 12650, fuelIn: "3/4", photos: [] },
    }),
  );
  assert.equal(after.view.vehicleOut.status, "RECORDED");
  assert.equal(after.view.vehicleOut.mileage, 12000);
  assert.equal(after.view.vehicleOut.fuel, "F");
  assert.deepEqual(after.view.vehicleOut.inspectionAngles, ["FRONT"]);
  assert.equal(after.view.vehicleIn.occurredAt?.toISOString(), inAt.toISOString());
  assert.equal(after.view.vehicleIn.mileage, 12650);
  assert.equal(after.view.vehicleIn.fuel, "3/4");
  assert.equal(after.provenance["vehicleIn.mileage"], "CAR_IN");
  assert.equal(after.view.permissions.canEdit, false);
});

test("review override wins over OCR; OCR remains the fallback", () => {
  const { view, provenance } = build(
    row({
      officialReviewDraft: {
        hirerName: "TEST PERSON CORRECTED",
        nationality: null,
        passportNumber: null,
        address: "Dubai Marina",
        telephone: "+971500000000",
        additionalDriverName: null,
        additionalDriverNationality: null,
        additionalDriverLicenseNumber: null,
        sponsorName: "TEST SPONSOR",
        sponsorIdNumber: null,
      },
    }),
  );
  assert.equal(view.hirer.name, "TEST PERSON CORRECTED");
  assert.equal(provenance["hirer.name"], "CUSTOMER_REVIEW");
  assert.equal(view.hirer.nationality, "TEST");
  assert.equal(provenance["hirer.nationality"], "PASSPORT_OCR");
  assert.equal(view.hirer.address, "Dubai Marina");
  assert.equal(view.sponsor.name, "TEST SPONSOR");
});

test("existing FORM contract without passport falls back to its record, stays editable", () => {
  const { view, provenance } = build(
    row({
      status: "FORM",
      passportExtractions: [],
      customer: {
        name: "Legacy Hirer",
        nationality: "AE",
        passportNumber: null,
        identityNumber: "784-1",
        address: null,
        mobile: "+971500000001",
        drivingLicenseNumber: "DL-LEGACY",
        drivingLicenseExpiry: null,
      },
    }),
  );
  assert.equal(view.hirer.name, "Legacy Hirer");
  assert.equal(provenance["hirer.name"], "CUSTOMER_RECORD");
  assert.equal(view.hirer.passportNumber, "784-1");
  assert.equal(view.identity.identityReady, false);
  assert.equal(view.permissions.canEdit, true);
});

test("AWAITING is editable only once identity is ready; signed contracts are locked", () => {
  assert.equal(build(row()).view.permissions.canEdit, true);
  assert.equal(build(row({ passportExtractions: [] })).view.permissions.canEdit, false);
  const signed = build(row({ status: "SIGNED", acceptance: { acceptedAt: now } })).view;
  assert.equal(signed.permissions.canEdit, false);
  assert.deepEqual(signed.permissions.editableFields, []);
  assert.equal(signed.signatures.hirer.status, "SIGNED");
  assert.equal(signed.signatures.sponsor.status, "NOT_SIGNED");
});

test("no deposit, no payment-card fields, no raw OCR/provider fields in the view", () => {
  const json = JSON.stringify(build(row()).view);
  for (const banned of ["deposit", "cardNumber\"", "fullCardNumber", "cvv", "cardExpiry", "provider", "confidence", "5000"]) {
    assert.equal(json.toLowerCase().includes(banned.toLowerCase()), false, banned);
  }
});

test("patch schema rejects system-locked fields (mass assignment)", () => {
  for (const locked of [
    { agreementNumber: "X" },
    { vehicleType: "X" },
    { rateAmount: 1 },
    { numberOfDays: 999 },
    { plannedStartAt: "2026-01-01" },
    { vehicleOut: { mileage: 1 } },
    { driverLicenseNumber: "X" },
    { depositAmount: 1 },
  ]) {
    assert.equal(OfficialContractReviewPatchSchema.safeParse({ hirerName: "OK", ...locked }).success, false);
  }
  assert.equal(OfficialContractReviewPatchSchema.safeParse({}).success, false);
  assert.equal(OfficialContractReviewPatchSchema.safeParse({ hirerName: "  " }).success, false);
  assert.equal(OfficialContractReviewPatchSchema.safeParse({ telephone: "abc" }).success, false);
  // The review link accepts the payment-card boxes only; the server rejects every other key.
  assert.deepEqual([...OFFICIAL_CONTRACT_EDITABLE_FIELDS], ["cardNumberLast4"]);
  assert.equal(OfficialContractReviewPatchSchema.safeParse({ cardNumberLast4: "4242" }).success, true);
  assert.equal(OfficialContractReviewPatchSchema.safeParse({ address: null }).success, true);
});
