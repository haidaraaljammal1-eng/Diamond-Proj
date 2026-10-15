/**
 * Synthetic checks inside the production backend image.
 * Refuses any database that is not an approved fresh/staging name.
 * Does not print passwords.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { hash, Algorithm } = require("@node-rs/argon2");
const pg = require("pg");
const { APPROVED_COMPANIES, assertFreshDatabaseTarget } = require("./fresh-database-baseline-lib.cjs");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function invoiceFixture(company) {
  const now = new Date("2026-10-01T00:00:00.000Z");
  return {
    templateVersion: "v1",
    companyDisplayNameSnapshot: company.legalNameEn,
    companyBrandKeySnapshot: company.code,
    companyAddressSnapshot: "Dubai",
    companyEmailSnapshot: "billing@example.test",
    customerNameSnapshot: "Phase 1 Synthetic",
    invoiceNumber: company.code === "ELITE" ? "DE-2026-000001" : "DU-2026-000001",
    issueDate: now,
    dueDate: now,
    termsSnapshot: "Due on receipt",
    balanceDueSnapshot: 0,
    lines: [
      {
        serviceLabel: "Rental",
        description: "Synthetic rental",
        quantity: 1,
        unitRate: 100,
        amount: 100,
      },
    ],
  };
}

function statementFixture(company) {
  const occurredAt = new Date("2026-10-02T08:00:00.000Z");
  const line = {
    id: "synthetic-line",
    occurredAt,
    businessDay: "2026-10-02",
    kind: "RENTAL_PAYMENT",
    direction: "COLLECTION",
    categoryLabel: "Rental",
    referenceId: "hidden-reference",
    contractNumber: "DE-2026-000001",
    vehicleName: "Synthetic",
    plateNumber: "TEST-1",
    description: "Synthetic collection",
    vendorName: null,
    paymentMethodLabel: "Cash",
    moneyIn: 100,
    moneyOut: 0,
    adjustment: 0,
    cumulativeNet: 100,
  };
  return {
    locale: "en",
    companyCode: company.code,
    brandKey: company.code,
    companyDisplayName: company.displayName,
    companyLegalName: company.legalNameEn,
    currency: "AED",
    period: { from: occurredAt, to: occurredAt },
    periodLabel: { from: "2026-10-01", to: "2026-10-31" },
    offsetMinutes: 240,
    timezoneLabel: "Asia/Dubai",
    generatedAt: occurredAt,
    summary: {
      totalCollections: 100,
      grossExpenses: 0,
      expenseReversals: 0,
      netExpenses: 0,
      netMovement: 100,
    },
    dayGroups: [
      {
        day: "2026-10-02",
        moneyIn: 100,
        moneyOut: 0,
        adjustment: 0,
        net: 100,
        lines: [line],
      },
    ],
    lines: [line],
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  assertFreshDatabaseTarget(databaseUrl, process.env.DIAMOND_FRESH_DATABASE_CONFIRM);
  const storageDir = process.env.FILE_STORAGE_DIR;
  if (!storageDir) throw new Error("FILE_STORAGE_DIR is required");
  fs.mkdirSync(storageDir, { recursive: true });
  const storageFile = path.join(storageDir, "phase1-synthetic.txt");
  fs.writeFileSync(storageFile, "phase1-synthetic-file\n");

  const password = process.env.SMOKE_PASSWORD ?? "";
  if (password.length < 12) throw new Error("SMOKE_PASSWORD must be at least 12 characters");
  const passwordHash = await hash(password, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO "users" ("email", "name", "status", "passwordHash", "language", "updatedAt")
       VALUES ($1, $2, 'ACTIVE', $3, 'en', CURRENT_TIMESTAMP)
       ON CONFLICT ("email") DO UPDATE
         SET "passwordHash" = EXCLUDED."passwordHash",
             "status" = 'ACTIVE',
             "updatedAt" = CURRENT_TIMESTAMP`,
      ["phase1-smoke@example.test", "Phase 1 Smoke", passwordHash],
    );
  } finally {
    await client.end();
  }

  const { renderInvoicePdfBuffer } = require(
    path.join(root, "dist", "src", "modules", "invoices", "invoice-pdf.service.js"),
  );
  const { renderFinanceStatementPdf } = require(
    path.join(root, "dist", "src", "modules", "finance", "finance-statement-pdf.service.js"),
  );
  for (const company of APPROVED_COMPANIES) {
    const invoice = await renderInvoicePdfBuffer(invoiceFixture(company));
    const statement = await renderFinanceStatementPdf(statementFixture(company));
    if (!invoice.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("invoice pdf header missing");
    if (!statement.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("statement pdf header missing");
    if (invoice.length < 1000 || statement.length < 1000) throw new Error("pdf output is too small");
    const outDir = "/tmp/phase1-pdf";
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `${company.code}-invoice.pdf`), invoice);
    fs.writeFileSync(path.join(outDir, `${company.code}-statement.pdf`), statement);
    console.log(`pdf-ok ${company.code} invoice=${invoice.length} statement=${statement.length}`);
  }
  console.log(`storage-ok ${storageFile}`);
  console.log("smoke-user-ready phase1-smoke@example.test");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
