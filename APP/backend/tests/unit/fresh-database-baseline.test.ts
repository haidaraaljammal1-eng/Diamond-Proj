import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { OPERATING_COMPANY_LEGAL_NAME_EN } from "src/modules/operating-companies/operating-company-legal-names";

const nodeRequire = createRequire(__filename);
const lib = nodeRequire("../../scripts/fresh-database-baseline-lib.cjs") as {
  APPROVED_COMPANIES: Array<{ code: string; legalNameEn: string; legalNameAr: string }>;
  HISTORICAL_WRONG_LEGAL_NAMES: string[];
  assertFreshDatabaseTarget: (databaseUrl: string, confirmName: string | undefined) => string;
};

test("fresh baseline uses the approved legal names and not the historical migration text", () => {
  const unique = lib.APPROVED_COMPANIES.find((row) => row.code === "UNIQUE");
  const elite = lib.APPROVED_COMPANIES.find((row) => row.code === "ELITE");
  assert.equal(unique?.legalNameEn, OPERATING_COMPANY_LEGAL_NAME_EN.UNIQUE);
  assert.equal(elite?.legalNameEn, OPERATING_COMPANY_LEGAL_NAME_EN.ELITE);
  assert.equal(unique?.legalNameEn, "Diamond Unique Car Rental CO.L.L.C.S.O.C");
  assert.equal(elite?.legalNameEn, "Diamond Elite Car Rental LLC");
  for (const wrong of lib.HISTORICAL_WRONG_LEGAL_NAMES) {
    assert.equal(
      lib.APPROVED_COMPANIES.some((row) => row.legalNameEn === wrong || row.legalNameAr === wrong),
      false,
    );
  }
});

test("fresh baseline refuses operational database names", () => {
  assert.throws(
    () => lib.assertFreshDatabaseTarget("postgresql://diamond@127.0.0.1:5432/haidara", "haidara"),
    /Refusing/,
  );
  assert.throws(
    () => lib.assertFreshDatabaseTarget("postgresql://diamond@127.0.0.1:5432/haidara_test", "haidara_test"),
    /Refusing/,
  );
  assert.throws(
    () =>
      lib.assertFreshDatabaseTarget(
        "postgresql://diamond@127.0.0.1:5432/diamond_staging",
        "diamond_fresh_other",
      ),
    /DIAMOND_FRESH_DATABASE_CONFIRM/,
  );
  assert.equal(
    lib.assertFreshDatabaseTarget(
      "postgresql://diamond@127.0.0.1:5432/diamond_fresh_phase1",
      "diamond_fresh_phase1",
    ),
    "diamond_fresh_phase1",
  );
});
