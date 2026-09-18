import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import type { OfficialContractView } from "../types/official-contract.types.ts";
import type { PublicRentalContext } from "../types/public-rental.types.ts";
import {
  buildOfficialContractDocument,
  buildReviewPatch,
  formatCalendarDate,
  invalidReviewFields,
  resolveLayoutValue,
} from "./official-contract-document.ts";
import { withNormalizedIdentity } from "./official-contract-identity.ts";
import {
  CONTRACT_CARD_AUTHORIZATION,
  CONTRACT_FIELD_CATALOG,
  CONTRACT_SIGNATURES,
  CONTRACT_TERMS,
} from "./official-contract-template.ts";

const here = import.meta.dirname;
const read = (rel: string) => readFileSync(path.join(here, rel), "utf8");

/** Mirrors the Backend OFFICIAL_CONTRACT_INFO_GRID. */
const INFO_GRID = [
  [["vehicle.plateCode"], ["vehicle.vehicleType"], ["hirer.name"]],
  [["vehicle.yearMade"], ["vehicle.plateNumber"], ["hirer.nationality"]],
  [["vehicle.notes"], ["vehicle.color"], ["hirer.passportNumber"]],
  [["vehicleOut.occurredAt|rental.plannedStartAt@time"], ["vehicleOut.occurredAt|rental.plannedStartAt@date"], ["hirer.address", "hirer.telephone"]],
  [["vehicleIn.occurredAt|rental.plannedEndAt@time"], ["vehicleIn.occurredAt|rental.plannedEndAt@date"], ["hirer.driverLicenseExpiryDate", "hirer.driverLicenseNumber"]],
  [["additionalDriver.driverLicenseNumber"], ["additionalDriver.name"], ["additionalDriver.nationality", "sponsor.name"]],
  [[], ["rental.numberOfDays"], ["sponsor.idNumber"]],
];

const EDITABLE = [
  "hirerName",
  "nationality",
  "passportNumber",
  "address",
  "telephone",
  "additionalDriverName",
  "additionalDriverNationality",
  "additionalDriverLicenseNumber",
  "sponsorName",
  "sponsorIdNumber",
];

const LOCKED_CUSTODY = {
  canEditDamage: false,
  canEditMileage: false,
  canEditFuel: false,
  canSign: false,
};

function view(overrides: Partial<OfficialContractView> = {}): OfficialContractView {
  const custody = { status: "NOT_AVAILABLE" as const, occurredAt: null, mileage: null, fuel: null, inspectionAngles: [], damage: [], signatureStatus: "NOT_SIGNED" as const };
  const unsigned = { status: "NOT_SIGNED" as const, signedAt: null, hasImage: false, required: false };
  return {
    header: { officeDisplayName: "Diamond Rent Car" },
    contract: { agreementNumber: "DE-2026-000391", status: "FORM", templateVersion: "DIAMOND_CONTRACT_V1", termsVersion: "diamond-rental-terms-v1" },
    vehicle: { plateCode: null, plateNumber: "Q 12345", vehicleType: "Nissan Patrol", yearMade: 2025, color: "White", notes: null },
    hirer: {
      name: "TEST PERSON",
      nationality: "TEST",
      passportNumber: "TEST123456",
      address: null,
      telephone: null,
      driverLicenseNumber: "DL-1",
      driverLicenseExpiryDate: "2031-06-01",
    },
    additionalDriver: { name: null, nationality: null, driverLicenseNumber: null },
    sponsor: { name: null, idNumber: null },
    rental: {
      plannedStartAt: "2026-09-20T06:00:00.000Z",
      plannedEndAt: "2026-09-27T06:00:00.000Z",
      numberOfDays: 7,
      periodConsistent: true,
      includedKmPerDay: 250,
      extraKmRate: 0.75,
    },
    vehicleOut: custody,
    vehicleIn: custody,
    card: { last4: null },
    signatures: {
      hirer: { ...unsigned, required: true },
      additionalDriver: unsigned,
      sponsor: unsigned,
      vehicleOutHirer: unsigned,
      vehicleInHirer: unsigned,
    },
    identity: { identityReady: true },
    permissions: {
      canEdit: true,
      editableFields: [...EDITABLE],
      vehicleOut: LOCKED_CUSTODY,
      vehicleIn: LOCKED_CUSTODY,
      signableSlots: ["HIRER", "ADDITIONAL_DRIVER", "SPONSOR"],
      canSign: false,
      missingRequirements: ["SIGNATURE_HIRER"],
    },
    layout: { sections: [], infoGrid: INFO_GRID },
    ...overrides,
  };
}

function fields(doc: ReturnType<typeof buildOfficialContractDocument>) {
  return Object.fromEntries(doc.grid.flat().flatMap((cell) => cell.fields).map((f) => [f.path, f]));
}

describe("official contract document — data", () => {
  it("renders agreement, vehicle, passport identity, license, days and mileage terms from the single DTO", () => {
    const doc = buildOfficialContractDocument(view(), { mode: "REVIEW" });
    const f = fields(doc);
    assert.equal(doc.agreementNumber, "DE-2026-000391");
    assert.equal(f["vehicle.vehicleType"]!.value, "Nissan Patrol");
    assert.equal(f["vehicle.plateNumber"]!.value, "Q 12345");
    assert.equal(f["vehicle.yearMade"]!.value, "2025");
    assert.equal(f["vehicle.color"]!.value, "White");
    assert.equal(f["hirer.name"]!.value, "TEST PERSON");
    assert.equal(f["hirer.nationality"]!.value, "TEST");
    assert.equal(f["hirer.passportNumber"]!.value, "TEST123456");
    assert.equal(f["hirer.driverLicenseNumber"]!.value, "DL-1");
    assert.equal(f["hirer.driverLicenseExpiryDate"]!.value, "01/06/2031");
    assert.equal(f["rental.numberOfDays"]!.value, "7");
    assert.equal(doc.mileageTerms.includedKmPerDay, "250");
    assert.equal(doc.mileageTerms.extraKmRate, "0.75");
    // Planned period shown in Dubai time until Car-Out/Car-In exist.
    assert.equal(f["vehicleOut.occurredAt|rental.plannedStartAt@date"]!.value, "20/09/2026");
    assert.equal(f["vehicleOut.occurredAt|rental.plannedStartAt@time"]!.value, "10:00");
  });

  it("null values render as empty cells, never placeholders", () => {
    const doc = buildOfficialContractDocument(
      view({
        vehicle: { plateCode: null, plateNumber: null, vehicleType: null, yearMade: null, color: null, notes: null },
        rental: { plannedStartAt: null, plannedEndAt: null, numberOfDays: 3, periodConsistent: null, includedKmPerDay: null, extraKmRate: null },
      }),
      { mode: "READONLY" },
    );
    const json = JSON.stringify(doc);
    for (const bad of ["N/A", "Unknown", "undefined", "null", "—"]) {
      assert.equal(json.includes(`"value":"${bad}"`), false, bad);
    }
    const f = fields(doc);
    assert.equal(f["vehicle.plateCode"]!.value, "");
    assert.equal(f["vehicle.notes"]!.value, "");
    assert.equal(doc.mileageTerms.includedKmPerDay, "");
    assert.equal(doc.mileageTerms.extraKmRate, "");
  });

  it("notes come only from the contract DTO field", () => {
    const f = fields(buildOfficialContractDocument(view({ vehicle: { ...view().vehicle, notes: "LEGAL NOTE" } }), { mode: "READONLY" }));
    assert.equal(f["vehicle.notes"]!.value, "LEGAL NOTE");
  });

  it("custody: blank before Car-Out/Car-In, actual values after", () => {
    const before = buildOfficialContractDocument(view(), { mode: "REVIEW" });
    assert.equal(before.vehicleOut.status, "NOT_AVAILABLE");
    assert.equal(before.vehicleOut.mileage, "");
    assert.equal(before.vehicleOut.fuelFill, null);
    assert.equal(before.vehicleOut.fuelLabel, "");
    const after = buildOfficialContractDocument(
      view({
        vehicleOut: { status: "RECORDED", occurredAt: "2026-09-20T07:15:00.000Z", mileage: 15000, fuel: "3/4", inspectionAngles: ["FRONT"], damage: [], signatureStatus: "NOT_SIGNED" },
      }),
      { mode: "READONLY" },
    );
    assert.equal(after.vehicleOut.mileage, "15000");
    assert.equal(after.vehicleOut.fuelFill, 0.75);
    assert.equal(after.vehicleOut.fuelLabel, "3/4");
    assert.equal(fields(after)["vehicleOut.occurredAt|rental.plannedStartAt@time"]!.value, "11:15");
  });

  it("the removed Deposit column is absorbed; No. of Days spans it", () => {
    const doc = buildOfficialContractDocument(view(), { mode: "REVIEW" });
    const last = doc.grid.at(-1)!;
    assert.equal(last.length, 2);
    assert.equal(last[0]!.span, 2);
    assert.equal(last[0]!.fields[0]!.path, "rental.numberOfDays");
  });
});

describe("official contract — rental price policy", () => {
  const priceLabels = ["Daily Rate", "Weekly Rate", "Monthly Rate", "السعر اليومي", "السعر الإسبوعي", "السعر الشهري", "Deposit", "ضمان"];

  it("no vehicle rental price, rate boxes, agreed amount or deposit in the model, template or renderer", () => {
    const leaky = { ...view(), rental: { ...view().rental, agreedAmount: 4321, rateAmount: 617, currency: "AED" } } as unknown as OfficialContractView;
    const docJson = JSON.stringify(buildOfficialContractDocument(leaky, { mode: "REVIEW" }));
    for (const banned of ["agreedAmount", "rateAmount", "4321", "617", "priceType", "dailyRate", "weeklyRate", "monthlyRate"]) {
      assert.equal(docJson.includes(banned), false, banned);
    }
    const sources = [
      read("official-contract-template.ts"),
      read("../components/official-contract-a4/official-contract-a4.tsx"),
    ].join("\n");
    for (const label of priceLabels) assert.equal(sources.includes(`"${label}"`), false, label);
    assert.equal(/agreedAmount|rateAmount|formatRentalAmount/.test(read("../components/official-contract-a4/official-contract-a4.tsx")), false);
    assert.equal(/agreedAmount|rateAmount/.test(read("../components/contract-review-step/contract-review-step.tsx")), false);
  });

  it("but extra-km rate, included km, days and other approved charges remain", () => {
    const doc = buildOfficialContractDocument(view(), { mode: "REVIEW" });
    assert.equal(doc.mileageTerms.extraKmRate, "0.75");
    assert.equal(doc.mileageTerms.includedKmPerDay, "250");
    assert.equal(fields(doc)["rental.numberOfDays"]!.value, "7");
    const terms = JSON.stringify(CONTRACT_TERMS);
    assert.ok(terms.includes("50 AED for each violation received"));
    assert.ok(terms.includes("30 AED Administration charges"));
  });

  it("card section: authorization wording + number boxes only; no expiry, CVV or card-holder grid", () => {
    const template = read("official-contract-template.ts");
    const component = read("../components/official-contract-a4/official-contract-a4.tsx");
    for (const banned of ["Expire Date", "CVV", "cvv", "expiryDate=", "Name:"]) {
      assert.equal(template.includes(banned) || component.includes(banned), false, banned);
    }
    assert.ok(CONTRACT_CARD_AUTHORIZATION.en.startsWith("I'm authorizing"));
  });
});

describe("official contract — editing", () => {
  it("only Backend-permitted personal fields are editable; system fields and license stay locked", () => {
    const f = fields(buildOfficialContractDocument(view(), { mode: "REVIEW" }));
    assert.equal(f["hirer.name"]!.editableField, "hirerName");
    assert.equal(f["hirer.telephone"]!.editableField, "telephone");
    for (const locked of ["vehicle.vehicleType", "vehicle.plateNumber", "rental.numberOfDays", "hirer.driverLicenseNumber", "hirer.driverLicenseExpiryDate"]) {
      assert.equal(f[locked]!.editableField, null, locked);
    }
    const restricted = fields(
      buildOfficialContractDocument(view({ permissions: { ...view().permissions, editableFields: ["address"] } }), { mode: "REVIEW" }),
    );
    assert.equal(restricted["hirer.name"]!.editableField, null);
    assert.equal(restricted["hirer.address"]!.editableField, "address");
    const readOnly = fields(buildOfficialContractDocument(view(), { mode: "READONLY" }));
    assert.equal(readOnly["hirer.name"]!.editableField, null);
    const signed = fields(buildOfficialContractDocument(view({ permissions: { ...view().permissions, canEdit: false, editableFields: [] } }), { mode: "REVIEW" }));
    assert.equal(signed["hirer.name"]!.editableField, null);
    assert.equal(JSON.stringify(CONTRACT_FIELD_CATALOG).includes('"reviewField":"agreementNumber"'), false);
  });

  it("local edits display in the document; PATCH carries changed allowed fields only", () => {
    const base = view({ permissions: { ...view().permissions, editableFields: ["hirerName", "address", "telephone"] } });
    const edits = { hirerName: "  TEST  PERSON  CORRECTED ", address: "", telephone: "", sponsorName: "SNEAKY" };
    const doc = buildOfficialContractDocument(base, { mode: "REVIEW", edits });
    assert.equal(fields(doc)["hirer.name"]!.value, "  TEST  PERSON  CORRECTED ");
    const patch = buildReviewPatch(base, edits);
    assert.deepEqual(patch, { hirerName: "TEST PERSON CORRECTED" });

    const withAddress = view({ hirer: { ...base.hirer, address: "OLD ADDRESS" }, permissions: base.permissions });
    assert.deepEqual(buildReviewPatch(withAddress, { address: "" }), { address: null });
    assert.deepEqual(buildReviewPatch(view(), { hirerName: "TEST PERSON" }), {});
  });

  it("reconciled Backend view replaces local values after save", () => {
    const reconciled = view({ hirer: { ...view().hirer, name: "TEST PERSON CORRECTED" } });
    const doc = buildOfficialContractDocument(reconciled, { mode: "REVIEW", edits: {} });
    assert.equal(fields(doc)["hirer.name"]!.value, "TEST PERSON CORRECTED");
  });

  it("value validation flags bad input without a frontend whitelist", () => {
    assert.deepEqual(invalidReviewFields({ telephone: "call me" }), ["telephone"]);
    assert.deepEqual(invalidReviewFields({ hirerName: "x".repeat(201) }), ["hirerName"]);
    assert.deepEqual(invalidReviewFields({ address: null, telephone: "+971 50 000 0000" }), []);
  });

  it("store keeps edits on failure and submits review before signing", () => {
    const store = read("../stores/official-contract.store.ts");
    assert.ok(store.includes('set({ saveStatus: "error", saveError: normalizeApiError(error) })'));
    assert.ok(store.includes("set({ view: reconciled, edits: {}, damageOut: undefined })"));
    const imports = /import \{([^}]*)\} from "\.\.\/api\/public-rental\.api"/.exec(store)![1]!;
    assert.deepEqual(imports.split(",").map((s) => s.trim()).filter(Boolean).sort(), [
      "clearPublicOfficialSignature",
      "getPublicOfficialContract",
      "reviewPublicOfficialContract",
      "savePublicOfficialSignature",
      "signPublicOfficialContract",
      "submitPublicOfficialContractReview",
    ]);
    const api = read("../api/public-rental.api.ts");
    assert.ok(api.includes("/official-contract`,\n    { publicRequest: true }") || api.includes("/official-contract`,\r\n    { publicRequest: true }"));
    assert.ok(api.includes('method: "PATCH", body: patch, publicRequest: true'));
    assert.ok(api.includes('method: "POST", publicRequest: true'));
    assert.ok(store.includes("await submitPublicOfficialContractReview(token)"));
    assert.equal(/fetch\(|apiRequest/.test(read("../components/official-contract-a4/official-contract-a4.tsx")), false);
  });
});

describe("official contract — content and i18n", () => {
  it("vehicle OUT/IN with demo diagrams, legal terms, bilingual acknowledgement, three signature boxes", () => {
    const a4 = read("../components/official-contract-a4/official-contract-a4.tsx");
    for (const token of ['custody("out"', 'custody("in"', "<TopView />", "<SideView />", "<EndView />", "<FuelBar", "CONTRACT_TERMS.map", "CONTRACT_ACKNOWLEDGEMENT.ar", "CONTRACT_ACKNOWLEDGEMENT.en"]) {
      assert.ok(a4.includes(token), token);
    }
    assert.deepEqual(CONTRACT_SIGNATURES.map((s) => s.id), ["hirer", "additionalDriver", "sponsor"]);
    const diagrams = read("../components/official-contract-a4/vehicle-condition-diagrams.tsx");
    assert.ok(diagrams.includes("M74 20 L250 20 C272 20 288 26 296 40"), "demo top-view artwork");
    for (const entry of Object.values(CONTRACT_FIELD_CATALOG)) {
      assert.ok(entry.en.length > 0 && /[؀-ۿ]/.test(entry.ar), entry.en);
    }
    assert.ok(CONTRACT_TERMS.every((term) => term.en.length > 0));
  });

  it("A4 portrait sizing and print rules", () => {
    const css = read("../components/official-contract-a4/official-contract-a4.module.css");
    assert.ok(css.includes("width: 210mm;"));
    assert.ok(css.includes("min-height: 297mm;"));
    assert.ok(css.includes("page: diamond-contract;"));
    const globals = readFileSync(path.join(here, "../../../styles/globals.css"), "utf8");
    assert.ok(globals.includes("size: A4 portrait;"));
    assert.ok(globals.includes("[data-official-contract-print]"));
  });

  it("formats calendar dates without timezone shift", () => {
    assert.equal(formatCalendarDate("2031-06-01"), "01/06/2031");
    assert.equal(formatCalendarDate(null), "");
    assert.equal(resolveLayoutValue(view(), "vehicle.unknown"), "");
  });

  it("surrounding review UI copy exists in Arabic and English; progress shows the 3-step journey", () => {
    const load = (locale: string) =>
      JSON.parse(readFileSync(path.join(here, `../../../../messages/${locale}.json`), "utf8")).PublicRental;
    const en = load("en");
    const ar = load("ar");
    assert.deepEqual(Object.keys(ar.review).sort(), Object.keys(en.review).sort());
    assert.equal(en.review.save, "Save Changes");
    assert.equal(ar.review.save, "حفظ التعديلات");
    assert.equal(en.review.continue, "Continue");
    assert.equal(ar.review.continue, "متابعة");
    assert.deepEqual([en.progress.license, en.progress.contract, en.progress.signature], ["Document Verification", "Contract Review", "Signature"]);
    assert.ok(ar.progress.signature && ar.progress.contract);
    assert.equal(ar.link.CONTRACT_LINK_INVALID.title, "الرابط غير صالح");
  });
});

import {
  buildReviewPatch as buildPatch,
  requiredSignatureSlots,
  valueSize,
} from "./official-contract-document.ts";
import { DAMAGE_ZONE_MAP, toggleDamageMark } from "./official-contract-damage-zones.ts";

describe("official contract — interactive completion", () => {
  it("full-value visibility: long values wrap and shrink, never ellipsis", () => {
    const long = view({
      hirer: { ...view().hirer, driverLicenseNumber: "DXB-DEMO-482731-ABCDEFGHIJ-0001", driverLicenseExpiryDate: "2028-06-15" },
    });
    const f = fields(buildOfficialContractDocument(long, { mode: "READONLY" }));
    assert.equal(f["hirer.driverLicenseNumber"]!.value, "DXB-DEMO-482731-ABCDEFGHIJ-0001");
    assert.equal(f["hirer.driverLicenseNumber"]!.size, "xs");
    assert.equal(f["hirer.driverLicenseExpiryDate"]!.value, "15/06/2028");
    assert.equal(valueSize("DL-1"), "md");
    assert.equal(valueSize("A".repeat(20)), "sm");
    const css = read("../components/official-contract-a4/official-contract-a4.module.css");
    assert.equal(css.includes("text-overflow: ellipsis"), false);
    assert.ok(css.includes("overflow-wrap: anywhere"));
    assert.ok(css.includes('.val[data-size="xs"]'));
    assert.ok(css.includes(".fld.stacked"));
  });

  it("staff terms render read-only: plate code, notes, included km, extra-km rate", () => {
    const withTerms = view({
      vehicle: { ...view().vehicle, plateCode: "DUBAI T", notes: "No smoking" },
    });
    const f = fields(buildOfficialContractDocument(withTerms, { mode: "REVIEW" }));
    assert.equal(f["vehicle.plateCode"]!.value, "DUBAI T");
    assert.equal(f["vehicle.plateCode"]!.editableField, null);
    assert.equal(f["vehicle.notes"]!.value, "No smoking");
    assert.equal(f["vehicle.notes"]!.editableField, null);
  });

  it("damage map: zones exist, but OUT and IN are locked during contract signing", () => {
    let marks = toggleDamageMark([], "TOP.HOOD", "SCRATCH");
    marks = toggleDamageMark(marks, "LEFT.FRONT_DOOR", "DENT");
    marks = toggleDamageMark(marks, "TOP.HOOD", "BROKEN");
    assert.deepEqual(marks, [{ zone: "LEFT.FRONT_DOOR", type: "DENT" }, { zone: "TOP.HOOD", type: "BROKEN" }]);
    assert.deepEqual(toggleDamageMark(marks, "TOP.HOOD", "BROKEN"), [{ zone: "LEFT.FRONT_DOOR", type: "DENT" }]);
    const ids = Object.values(DAMAGE_ZONE_MAP).flat().map((z) => z.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.includes("FRONT_REAR.BUMPER"));

    const doc = buildOfficialContractDocument(view(), { mode: "REVIEW", damageOut: marks });
    assert.equal(doc.vehicleOut.damageEditable, false);
    assert.equal(doc.vehicleIn.damageEditable, false);
    assert.deepEqual(doc.vehicleOut.damage, marks);
    assert.equal(buildOfficialContractDocument(view(), { mode: "READONLY", damageOut: marks }).vehicleOut.damageEditable, false);
    assert.equal("damageOut" in buildPatch(view(), {}), false);
  });

  it("card boxes: display-only masked Stripe card reference, no Diamond PAN input", () => {
    const doc = buildOfficialContractDocument(view(), { mode: "REVIEW" });
    assert.equal(doc.card.boxes.join(""), "");
    assert.equal(JSON.stringify(buildPatch(view(), {})).includes("cardNumberLast4"), false);
    const masked = buildOfficialContractDocument(view({ card: { last4: "4817" } }), { mode: "READONLY" });
    assert.equal(masked.card.boxes.join(""), "••••••••••••4817");
    const component = read("../components/official-contract-a4/contract-paper-widgets.tsx");
    assert.equal(component.includes("<input"), false);
    assert.equal(/Card digit|inputMode|autoComplete/i.test(component), false);
    assert.equal(/cvv|expir/i.test(component), false);
  });

  it("fuel bar: horizontal level with readable text", () => {
    const at = (fuel: string) =>
      buildOfficialContractDocument(
        view({ vehicleOut: { ...view().vehicleOut, status: "RECORDED", fuel } }),
        { mode: "READONLY" },
      ).vehicleOut;
    assert.deepEqual([at("F").fuelFill, at("F").fuelLabel], [1, "Full"]);
    assert.deepEqual([at("1/2").fuelFill, at("1/2").fuelLabel], [0.5, "1/2"]);
    assert.deepEqual([at("E").fuelFill, at("E").fuelLabel], [0, "Empty"]);
    const widgets = read("../components/official-contract-a4/contract-paper-widgets.tsx");
    assert.ok(widgets.includes("export function FuelBar"));
    assert.equal(read("../components/official-contract-a4/vehicle-condition-diagrams.tsx").includes("FuelGauge"), false);
  });

  it("signatures: required rules mirror the Backend; pads editable only when allowed; Vehicle IN not signable", () => {
    assert.deepEqual(requiredSignatureSlots(view()), ["hirer"]);
    assert.deepEqual(requiredSignatureSlots(view(), { sponsorName: "TEST SPONSOR" }), ["hirer", "sponsor"]);
    assert.deepEqual(
      requiredSignatureSlots(view({ additionalDriver: { name: "X", nationality: null, driverLicenseNumber: null } })),
      ["hirer", "additionalDriver"],
    );
    const doc = buildOfficialContractDocument(view(), { mode: "REVIEW", pendingSignatures: { hirer: "DRAWN" } });
    assert.equal(doc.signatures.hirer.status, "SIGNED");
    assert.equal(doc.signatures.hirer.required, true);
    assert.equal(doc.signatures.hirer.editable, true);
    assert.equal(doc.signatures.vehicleOutHirer.editable, false);
    assert.equal(doc.signatures.vehicleInHirer.editable, false);
    const readonly = buildOfficialContractDocument(view(), { mode: "READONLY" });
    assert.equal(readonly.signatures.hirer.editable, false);
    const pad = read("../components/official-contract-a4/signature-pad.tsx");
    for (const token of ["onPointerDown", "toBlob", '"image/png"', "setPointerCapture"]) assert.ok(pad.includes(token), token);
  });

  it("normalized OCR identity never overrides Backend edit permission", () => {
    const locked = view({
      contract: { ...view().contract, status: "AWAITING" },
      identity: { identityReady: false },
      permissions: { ...view().permissions, canEdit: false },
    });
    const ctx = {
      identity: { licenseStatus: "LICENSE_VALID", passport: { status: "READY", fields: null }, identityReady: true },
      licenseVerification: { status: "VALID", licenseNumber: "DXB-DEV-482731", licenseNumberMasked: null, expiryDate: "2099-12-31", confidence: 0.99 },
    } as unknown as PublicRentalContext;
    const opened = withNormalizedIdentity(locked, ctx);
    assert.equal(opened.permissions.canEdit, false);
    assert.equal(opened.permissions.vehicleOut.canEditDamage, false);
    const doc = buildOfficialContractDocument(opened, { mode: "REVIEW" });
    assert.equal(doc.signatures.hirer.editable, false);
    const signed = withNormalizedIdentity(
      view({ contract: { ...view().contract, status: "SIGNED" }, permissions: { ...view().permissions, canEdit: false, editableFields: [], signableSlots: [] } }),
      ctx,
    );
    assert.equal(signed.permissions.canEdit, false, "signed agreements never reopen");
    const screen = read("../components/public-rental-screen/public-rental-screen.tsx");
    assert.ok(screen.includes("rental.simulatePayment"));
    assert.equal(screen.includes("simulateRequiredSignatures"), false);
    assert.equal(/simulat/i.test(read("../components/official-contract-a4/official-contract-a4.tsx")), false);
  });

  it("AR/EN review copy for signing and signature slots", () => {
    const load = (locale: string) =>
      JSON.parse(readFileSync(path.join(here, `../../../../messages/${locale}.json`), "utf8")).PublicRental;
    const en = load("en");
    const ar = load("ar");
    assert.deepEqual(Object.keys(ar.review.signatureSlots).sort(), Object.keys(en.review.signatureSlots).sort());
    assert.equal(en.review.sign, "Sign Contract");
    assert.equal(ar.review.sign, "توقيع العقد");
    for (const key of ["OFFICIAL_CONTRACT_INCOMPLETE", "OFFICIAL_CONTRACT_REVIEW_LOCKED", "OFFICIAL_SIGNATURE_SLOT_UNAVAILABLE"]) {
      assert.ok(en.error[key] && ar.error[key], key);
    }
  });
});
