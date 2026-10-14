import { test } from "node:test";
import assert from "node:assert/strict";
import { archiveTotalFromCharges } from "src/modules/archive/archive-row-total";

const extrasOnly = {
  fuel: null,
  salik: null,
  parking: null,
  blackPoints: null,
  fines: null,
};

test("Test A — spec: rentalTotal ignored; extras total 1050", () => {
  assert.equal(
    archiveTotalFromCharges({
      fuel: 100,
      salik: 50,
      parking: 0,
      blackPoints: 200,
      fines: 700,
    }),
    1050,
  );
});

test("Test B — parking patch: 100 => total 100 (no rental)", () => {
  assert.equal(archiveTotalFromCharges({ ...extrasOnly, parking: 100 }), 100);
});

test("Test C — parking 100 -> 250", () => {
  assert.equal(archiveTotalFromCharges({ ...extrasOnly, parking: 100 }), 100);
  assert.equal(archiveTotalFromCharges({ ...extrasOnly, parking: 250 }), 250);
});

test("Test D — all extras null => total null", () => {
  assert.equal(archiveTotalFromCharges(extrasOnly), null);
});

test("Test E — full extras formula 680", () => {
  assert.equal(
    archiveTotalFromCharges({
      fuel: 200,
      salik: 50,
      parking: 30,
      blackPoints: 300,
      fines: 100,
    }),
    680,
  );
});

test("G — extras total 400 excludes rentalTotal", () => {
  assert.equal(
    archiveTotalFromCharges({
      fuel: 100,
      salik: 50,
      parking: 20,
      blackPoints: 200,
      fines: 30,
    }),
    400,
  );
});

test("Test F — idempotent repeat compute", () => {
  const snap = {
    fuel: 200,
    salik: 50,
    parking: 30,
    blackPoints: 300,
    fines: 100,
  };
  assert.equal(archiveTotalFromCharges(snap), 680);
  assert.equal(archiveTotalFromCharges(snap), 680);
});
