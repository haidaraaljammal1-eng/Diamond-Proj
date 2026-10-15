"use strict";

/**
 * Guards and master-data constants for a brand-new PostgreSQL database.
 * Historical migration SQL is never edited. This module does not connect.
 */

const APPROVED_COMPANIES = [
  {
    code: "UNIQUE",
    displayName: "UNIQUE",
    legalNameAr: "شركة دايموند يونيك لتأجير السيارات ذ.م.م ش.ش.و",
    legalNameEn: "Diamond Unique Car Rental CO.L.L.C.S.O.C",
    accentColor: "#C9A15C",
  },
  {
    code: "ELITE",
    displayName: "ELITE",
    legalNameAr: "شركة دايموند إيليت لتأجير السيارات ذ.م.م ش.ش.و",
    legalNameEn: "Diamond Elite Car Rental LLC",
    accentColor: "#3E5C76",
  },
];

const FORBIDDEN_DATABASES = new Set([
  "haidara",
  "haidara_test",
  "postgres",
  "template0",
  "template1",
]);

const HISTORICAL_WRONG_LEGAL_NAMES = [
  "DIAMOND UNIQUE CAR RENTALS CO. LLC S.O.C",
  "DIAMOND ELITE CAR RENTALS CO. LLC S.O.C",
];

function databaseNameFromUrl(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, "")).split("?")[0];
  if (!name) throw new Error("DATABASE_URL has no database name");
  return name;
}

function assertFreshDatabaseTarget(databaseUrl, confirmName) {
  if (!databaseUrl || !databaseUrl.trim()) {
    throw new Error("DATABASE_URL is required and is not read from .env by this tool");
  }
  const name = databaseNameFromUrl(databaseUrl);
  if (FORBIDDEN_DATABASES.has(name)) {
    throw new Error(`Refusing to initialize database "${name}"`);
  }
  if (!/^diamond_(staging|fresh)(_[a-z0-9]+)?$/.test(name)) {
    throw new Error(
      `Database "${name}" is not an approved fresh target. Use diamond_staging or diamond_fresh_<suffix>.`,
    );
  }
  if (confirmName !== name) {
    throw new Error(
      "DIAMOND_FRESH_DATABASE_CONFIRM must exactly match the database name in DATABASE_URL",
    );
  }
  return name;
}

module.exports = {
  APPROVED_COMPANIES,
  FORBIDDEN_DATABASES,
  HISTORICAL_WRONG_LEGAL_NAMES,
  databaseNameFromUrl,
  assertFreshDatabaseTarget,
};
