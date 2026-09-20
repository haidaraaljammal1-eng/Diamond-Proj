import assert from "node:assert/strict";
import { test } from "node:test";
import { custodyLedgerModel } from "./custody-ledger.model.ts";
import type { CustodyDraftValues, CustodySavedValues } from "./custody-ledger.model.ts";

const EMPTY_SAVED: CustodySavedValues = { mileage: null, fuel: null, damage: [], signaturePresent: false };
const EMPTY_DRAFT: CustodyDraftValues = { mileage: "", fuel: null, damage: [], signatureDrawn: false };
const NO_PHOTOS = { required: 8, completed: 0 };

test("an untouched return shows every requirement missing", () => {
  const model = custodyLedgerModel(EMPTY_SAVED, EMPTY_DRAFT, NO_PHOTOS);
  assert.equal(model.mileage, "missing");
  assert.equal(model.fuel, "missing");
  assert.equal(model.signature, "missing");
  assert.equal(model.damage, "optional");
  assert.equal(model.done, 0);
  assert.equal(model.total, 11);
  assert.equal(model.missingCount, 11);
});

test("typed but unsaved values read as not saved, never as done", () => {
  const model = custodyLedgerModel(EMPTY_SAVED, { ...EMPTY_DRAFT, mileage: "41200", fuel: "3/4", signatureDrawn: true }, NO_PHOTOS);
  assert.equal(model.mileage, "unsaved");
  assert.equal(model.fuel, "unsaved");
  assert.equal(model.signature, "unsaved");
  assert.equal(model.done, 0);
});

test("saved values matching the draft count as done", () => {
  const saved: CustodySavedValues = { mileage: 41200, fuel: "3/4", damage: [], signaturePresent: true };
  const model = custodyLedgerModel(saved, { mileage: "41200", fuel: "3/4", damage: [], signatureDrawn: false }, { required: 8, completed: 3 });
  assert.equal(model.mileage, "done");
  assert.equal(model.fuel, "done");
  assert.equal(model.signature, "done");
  assert.equal(model.detailsDone, 3);
  assert.equal(model.done, 6);
  assert.equal(model.missingCount, 5);
});

test("damage is optional when empty and done once saved", () => {
  const mark = { zone: "FRONT_BUMPER", type: "SCRATCH" as const };
  const saved: CustodySavedValues = { ...EMPTY_SAVED, damage: [mark] };
  assert.equal(custodyLedgerModel(saved, { ...EMPTY_DRAFT, damage: [mark] }, NO_PHOTOS).damage, "done");
  assert.equal(custodyLedgerModel(saved, EMPTY_DRAFT, NO_PHOTOS).damage, "unsaved");
  // An optional requirement never counts against completion.
  assert.equal(custodyLedgerModel(saved, { ...EMPTY_DRAFT, damage: [mark] }, NO_PHOTOS).done, 0);
});

test("photo progress comes from the server evidence, never from a hardcoded count", () => {
  const model = custodyLedgerModel(EMPTY_SAVED, EMPTY_DRAFT, { required: 8, completed: 8 });
  assert.equal(model.done, 8);
  assert.equal(model.total, 11);
});
