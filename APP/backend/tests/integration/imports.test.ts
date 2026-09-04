import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

/**
 * End-to-end import-pipeline tests (upload → map → validate → preview → confirm →
 * results). Builds the real app + hits the DB; only runs when RUN_INTEGRATION=true
 * with a disposable test DATABASE_URL. All external keys/codes are run-suffixed to
 * stay re-runnable against a shared dev DB.
 */
const RUN = process.env.RUN_INTEGRATION === "true";

if (!RUN) {
  test("imports integration skipped (set RUN_INTEGRATION=true + a test DATABASE_URL)", {
    skip: true,
  });
} else {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  const run = Date.now().toString(36).toUpperCase();
  const digits = run.replace(/[^0-9]/g, "0").slice(0, 8).padEnd(8, "0");
  const ambigMobile = `05${digits}`;

  const admin = { email: `imp-admin-${run}@example.test`, password: "imp-admin-pass-123" };
  const reader = { email: `imp-reader-${run}@example.test`, password: "imp-reader-pass-123" };
  let adminToken = "";
  let readerToken = "";

  const MODEL = `ATTRAGE-${run}`;
  const DEAD_MODEL = `DEADMDL-${run}`;
  const BRANCH = `RUH1-${run}`;
  const SP = `SP1-${run}`;
  const EXIST_CUST = `CUST-EXIST-${run}`;

  const ADMIN_PERMS = ["imports.read", "imports.manage"];

  async function seedUser(email: string, password: string, roleKey: string, perms: string[]) {
    const { hashPassword } = await import("src/lib/security/password");
    const { normalizeEmail } = await import("src/lib/security/normalize");
    const canonicalEmail = normalizeEmail(email);
    const role = await prisma.role.upsert({
      where: { key: roleKey },
      update: {},
      create: { key: roleKey, name: roleKey },
    });
    for (const key of perms) {
      const perm = await prisma.permission.upsert({
        where: { key },
        update: {},
        create: { key, category: key.split(".")[0], description: key },
      });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.upsert({
      where: { email: canonicalEmail },
      update: { status: "ACTIVE", passwordHash },
      create: { email: canonicalEmail, name: roleKey, status: "ACTIVE", passwordHash },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }

  async function login(creds: { email: string; password: string }) {
    const res = await app.inject({ method: "POST", url: "/auth/login", payload: creds });
    assert.equal(res.statusCode, 200);
    return res.json().data.accessToken as string;
  }

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  function multipart(filename: string, mime: string, content: string | Buffer) {
    const boundary = `----importboundary${run}`;
    const head =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${mime}\r\n\r\n`;
    const tail = `\r\n--${boundary}--\r\n`;
    const body = typeof content === "string" ? Buffer.from(content) : content;
    return {
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: Buffer.concat([Buffer.from(head), body, Buffer.from(tail)]),
    };
  }

  async function upload(token: string, filename: string, mime: string, content: string | Buffer) {
    const { headers, payload } = multipart(filename, mime, content);
    return app.inject({
      method: "POST",
      url: "/imports",
      headers: { ...auth(token), ...headers },
      payload,
    });
  }

  const HEADER =
    "name,mobile,email,externalCustomerId,type,vin,vehicleModelCode,modelYear,branchCode,salespersonCode,externalSaleId";

  // Unique-content salt so re-uploads differ by fileHash (dup-upload guard). Appended
  // as an extra trailing cell on the first row — sliced off at the header width, so
  // parsed data is identical while the bytes (and sha256) differ.
  let seq = 0;
  const nonce = () => `N${run}${++seq}`;

  // A single CSV exercising new / existing / invalid / conflict / duplicate / manual-review.
  function mainCsv(uniq = "") {
    const rows = [
      HEADER,
      `Ali,,,,,VIN-A-${run},${MODEL},2024,${BRANCH},${SP},SALE-1-${run}${uniq ? `,${uniq}` : ""}`,
      `Existing Co,,,${EXIST_CUST},,VIN-B-${run},${MODEL},,${BRANCH},,SALE-2-${run}`,
      `Bad Branch,,,,,VIN-C-${run},${MODEL},,NOPE-${run},,SALE-3-${run}`,
      `Bad Model,,,,,VIN-D-${run},NOPE-${run},,${BRANCH},,SALE-4-${run}`,
      `Dead Model,,,,,VIN-E-${run},${DEAD_MODEL},,${BRANCH},,SALE-5-${run}`,
      `Dup Sale,,,,,VIN-F-${run},${MODEL},,${BRANCH},,SALE-1-${run}`,
      `Ambiguous,${ambigMobile},,,,VIN-G-${run},${MODEL},,${BRANCH},,SALE-7-${run}`,
      `,,,,,VIN-H-${run},${MODEL},,${BRANCH},,SALE-8-${run}`,
      `NoKeys,,,,,,${MODEL},,${BRANCH},,`,
    ];
    return rows.join("\n") + "\n";
  }

  const identityMapping = {
    mapping: Object.fromEntries(HEADER.split(",").map((h) => [h, h])),
  };

  async function xlsxBuffer(rows: string[][]) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    for (const r of rows) ws.addRow(r);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async function fullyImport(token: string) {
    const up = await upload(token, "data.csv", "text/csv", mainCsv(nonce()));
    assert.equal(up.statusCode, 201);
    const id = up.json().data.id as number;
    const map = await app.inject({
      method: "PUT",
      url: `/imports/${id}/mapping`,
      headers: auth(token),
      payload: identityMapping,
    });
    assert.equal(map.statusCode, 200);
    const val = await app.inject({ method: "POST", url: `/imports/${id}/validate`, headers: auth(token) });
    assert.equal(val.statusCode, 200);
    return id;
  }

  before(async () => {
    const { buildApp } = await import("src/app");
    app = await buildApp();
    prisma = app.prisma;
    await seedUser(admin.email, admin.password, `imp_admin_${run}`, ADMIN_PERMS);
    await seedUser(reader.email, reader.password, `imp_reader_${run}`, ["imports.read"]);
    adminToken = await login(admin);
    readerToken = await login(reader);

    const { normalizePhone } = await import("src/lib/security/normalize");
    // Names are run-suffixed: branch / vehicle-model / salesperson normalizedName is
    // now uniquely constrained, so fixtures must not collide across runs/files.
    const model = await prisma.vehicleModel.create({ data: { code: MODEL, name: `Attrage ${run}` } });
    await prisma.vehicleModel.create({ data: { code: DEAD_MODEL, name: `Retired ${run}`, isActive: false } });
    await prisma.branch.create({ data: { code: BRANCH, name: `Riyadh 1 ${run}` } });
    await prisma.salesperson.create({ data: { code: SP, name: `Rep ${run}`, externalId: `SPX-${run}` } });
    await prisma.customer.create({ data: { name: "Existing Co", externalId: EXIST_CUST } });
    // A customer whose mobile collides with an un-keyed import row → ambiguity.
    await prisma.customer.create({ data: { name: "Phone Owner", mobile: normalizePhone(ambigMobile) } });
    // A pre-existing vehicle to drive VIN-conflict / VIN-immutability on import.
    await prisma.vehicle.create({
      data: { vin: `VINX-${run}`, externalId: `EXTVEH-${run}`, modelId: model.id },
    });
  });

  after(async () => {
    if (app) await app.close();
  });

  test("valid CSV upload creates a MAPPING_REQUIRED job; storageKey is never exposed", async () => {
    const up = await upload(adminToken, "sales.csv", "text/csv", mainCsv(nonce()));
    assert.equal(up.statusCode, 201);
    const job = up.json().data;
    assert.equal(job.status, "MAPPING_REQUIRED");
    assert.equal(job.sourceType, "CSV");
    assert.equal(job.totalRows, 9);
    assert.equal(job.mapping, null);
    assert.equal("storageKey" in job, false);
  });

  test("invalid file type is rejected (422 invalid_file_type) for wrong ext and XLSX", async () => {
    const png = await upload(adminToken, "evil.png", "image/png", "\x89PNG\r\n");
    assert.equal(png.statusCode, 422);
    assert.equal(png.json().error.context.reason, "invalid_file_type");

    const xlsx = await upload(adminToken, "book.xlsx", "text/csv", "a,b\n1,2\n");
    assert.equal(xlsx.statusCode, 422);
    assert.equal(xlsx.json().error.context.reason, "invalid_file_type");
  });

  test("mapping fields expose the catalog + file headers", async () => {
    const up = await upload(adminToken, "data.csv", "text/csv", mainCsv(nonce()));
    const id = up.json().data.id;
    const res = await app.inject({ method: "GET", url: `/imports/${id}/mapping`, headers: auth(adminToken) });
    assert.equal(res.statusCode, 200);
    const body = res.json().data;
    assert.ok(body.fields.find((f: { key: string }) => f.key === "vehicleModelCode"));
    assert.ok(body.headers.includes("externalSaleId"));
    assert.equal(body.mapping, null);
  });

  test("missing required column mapping is rejected (422 missing_required_column)", async () => {
    const up = await upload(adminToken, "data.csv", "text/csv", mainCsv(nonce()));
    const id = up.json().data.id;
    const noBranch = Object.fromEntries(
      HEADER.split(",").filter((h) => h !== "branchCode").map((h) => [h, h]),
    );
    const res = await app.inject({
      method: "PUT",
      url: `/imports/${id}/mapping`,
      headers: auth(adminToken),
      payload: { mapping: noBranch },
    });
    assert.equal(res.statusCode, 422);
    assert.equal(res.json().error.context.reason, "missing_required_column");
  });

  test("invalid mapping (unknown target field) is rejected (422 invalid_mapping)", async () => {
    const up = await upload(adminToken, "data.csv", "text/csv", mainCsv(nonce()));
    const id = up.json().data.id;
    const res = await app.inject({
      method: "PUT",
      url: `/imports/${id}/mapping`,
      headers: auth(adminToken),
      payload: { mapping: { ...identityMapping.mapping, name: "bogusField" } },
    });
    assert.equal(res.statusCode, 422);
    assert.equal(res.json().error.context.reason, "invalid_mapping");
  });

  test("validate + preview classify rows and write NO business data", async () => {
    const id = await fullyImport(adminToken);

    const job = await app.inject({ method: "GET", url: `/imports/${id}`, headers: auth(adminToken) });
    assert.equal(job.json().data.status, "READY");

    const preview = await app.inject({
      method: "GET",
      url: `/imports/${id}/preview?pageSize=50`,
      headers: auth(adminToken),
    });
    assert.equal(preview.statusCode, 200);
    const { counts, rows, masterData } = preview.json().data;
    assert.equal(counts.total, 9);
    // Smart resolution: unknown model/branch are creatable (NEW), not INVALID; a
    // missing externalSaleId is optional (NEW). New = Ali, Existing Co, Bad Branch,
    // Bad Model, NoKeys.
    assert.equal(counts.newRows, 5);
    assert.equal(counts.duplicates, 1); // second SALE-1
    assert.equal(counts.manualReview, 1); // ambiguous mobile
    // job-level "invalid" = won't-import = 2 bad rows (dead model, missing name) + conflicts(0) + manualReview(1)
    assert.equal(counts.invalid, 3);
    assert.equal(counts.valid, 6); // 5 new + 1 duplicate (idempotent skip)
    // The unknown model/branch are surfaced as creatable master data (not errors).
    assert.ok(
      masterData.vehicleModels.some((m: { code: string; status: string }) => m.code === `NOPE-${run}` && m.status === "will_create"),
    );
    assert.ok(
      masterData.branches.some((b: { code: string; status: string }) => b.code === `NOPE-${run}` && b.status === "will_create"),
    );
    // Row-level detail is present and actionable.
    const badBranch = rows.find((r: { externalSaleId: string }) => r.externalSaleId === `SALE-3-${run}`);
    assert.equal(badBranch.status, "NEW");
    assert.equal(badBranch.branchStatus, "will_create");
    assert.ok(!badBranch.issues.some((i: { code: string }) => i.code === "unknown_branch"));
    const ambiguous = rows.find((r: { externalSaleId: string }) => r.externalSaleId === `SALE-7-${run}`);
    assert.equal(ambiguous.status, "MANUAL_REVIEW");
    assert.equal(ambiguous.issues[0].reason, "ambiguous_customer_match");
    // Keyless experience (no externalSaleId) is now OPTIONAL → imports normally.
    const keyless = rows.find((r: { externalSaleId: string | null }) => r.externalSaleId === null);
    assert.equal(keyless.status, "NEW");
    assert.ok(!keyless.issues.some((i: { reason: string }) => i.reason === "missing_experience_identity"));

    // Preview wrote nothing — none of this import's keyed rows exist yet.
    // (Key-specific checks stay correct even if other test files write concurrently.)
    assert.equal(
      await prisma.purchaseExperience.findUnique({ where: { externalSaleId: `SALE-1-${run}` } }),
      null,
    );
    assert.equal(
      await prisma.purchaseExperience.findUnique({ where: { externalSaleId: `SALE-2-${run}` } }),
      null,
    );
    assert.equal(await prisma.vehicle.findUnique({ where: { vin: `VIN-A-${run}` } }), null);
  });

  test("confirm imports valid rows, skips duplicates, records failures; counts accurate", async () => {
    const id = await fullyImport(adminToken);
    const res = await app.inject({ method: "POST", url: `/imports/${id}/confirm`, headers: auth(adminToken), payload: {} });
    assert.equal(res.statusCode, 200);
    const job = res.json().data;
    assert.equal(job.status, "COMPLETED_WITH_ERRORS");
    // No-body confirm defaults unknown codes to "create": Bad Branch + Bad Model now
    // import (their master data is created); keyless row imports (saleId optional).
    assert.equal(job.importedRows, 5); // Ali, Existing Co, Bad Branch, Bad Model, NoKeys
    assert.equal(job.skippedRows, 1); // duplicate SALE-1 within file
    assert.equal(job.failedRows, 2); // inactive (dead) model, missing name
    assert.equal(job.manualReviewRows, 1); // ambiguous mobile
    // The unknown model/branch were created during confirm.
    assert.ok(await prisma.vehicleModel.findUnique({ where: { code: `NOPE-${run}` } }));
    assert.ok(await prisma.branch.findUnique({ where: { code: `NOPE-${run}` } }));

    // Authoritative rows were written.
    const sale1 = await prisma.purchaseExperience.findUnique({ where: { externalSaleId: `SALE-1-${run}` } });
    assert.ok(sale1);
    const veh = await prisma.vehicle.findUnique({ where: { vin: `VIN-A-${run}` } });
    assert.ok(veh);

    // Existing customer (by externalId) was reused, NOT duplicated.
    const existing = await prisma.customer.findMany({ where: { externalId: EXIST_CUST } });
    assert.equal(existing.length, 1);
    const existingCustomer = existing[0];
    assert.ok(existingCustomer);
    const sale2 = await prisma.purchaseExperience.findUnique({ where: { externalSaleId: `SALE-2-${run}` } });
    assert.equal(sale2?.customerId, existingCustomer.id);

    // Per-row results are retrievable.
    const results = await app.inject({
      method: "GET",
      url: `/imports/${id}/results?pageSize=50`,
      headers: auth(adminToken),
    });
    assert.equal(results.statusCode, 200);
    const rrows = results.json().data.rows;
    assert.equal(rrows.length, 9);
    assert.ok(rrows.some((r: { status: string }) => r.status === "IMPORTED"));
    assert.ok(rrows.some((r: { status: string }) => r.status === "NEEDS_MANUAL_REVIEW"));
    assert.ok(rrows.some((r: { status: string }) => r.status === "FAILED"));
  });

  test("repeated confirm of the same job is rejected (409 import_already_processed)", async () => {
    const id = await fullyImport(adminToken);
    const first = await app.inject({ method: "POST", url: `/imports/${id}/confirm`, headers: auth(adminToken), payload: {} });
    assert.equal(first.statusCode, 200);
    const second = await app.inject({ method: "POST", url: `/imports/${id}/confirm`, headers: auth(adminToken), payload: {} });
    assert.equal(second.statusCode, 409);
    assert.equal(second.json().error.context.reason, "import_already_processed");
  });

  test("re-importing the same file is idempotent on externalSaleId (no duplicate sales)", async () => {
    const id = await fullyImport(adminToken);
    await app.inject({ method: "POST", url: `/imports/${id}/confirm`, headers: auth(adminToken), payload: {} });

    // A brand-new job over identical content: prior sales already exist → skipped.
    const id2 = await fullyImport(adminToken);
    const res = await app.inject({ method: "POST", url: `/imports/${id2}/confirm`, headers: auth(adminToken), payload: {} });
    const job = res.json().data;
    // The keyed sales (SALE-1..SALE-4) already exist → skipped. The keyless row has
    // no idempotency key by design, so it re-imports (documented; externalSaleId is
    // the only strong dedup key for experiences).
    assert.equal(job.importedRows, 1);
    // No duplicate experiences for the keyed sales.
    assert.equal(await prisma.purchaseExperience.count({ where: { externalSaleId: `SALE-1-${run}` } }), 1);
    assert.equal(await prisma.purchaseExperience.count({ where: { externalSaleId: `SALE-2-${run}` } }), 1);
  });

  test("confirm before validate is rejected (409 import_not_ready)", async () => {
    const up = await upload(adminToken, "data.csv", "text/csv", mainCsv(nonce()));
    const id = up.json().data.id;
    // No mapping/validate yet → not READY.
    const res = await app.inject({ method: "POST", url: `/imports/${id}/confirm`, headers: auth(adminToken), payload: {} });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error.context.reason, "import_not_ready");
  });

  test("cancel a fresh job; then confirm/cancel are rejected", async () => {
    const up = await upload(adminToken, "data.csv", "text/csv", mainCsv(nonce()));
    const id = up.json().data.id;
    const cancelled = await app.inject({ method: "POST", url: `/imports/${id}/cancel`, headers: auth(adminToken) });
    assert.equal(cancelled.statusCode, 200);
    assert.equal(cancelled.json().data.status, "CANCELLED");
    const confirm = await app.inject({ method: "POST", url: `/imports/${id}/confirm`, headers: auth(adminToken), payload: {} });
    assert.equal(confirm.statusCode, 409);
  });

  test("VIN conflict on a matched vehicle is a CONFLICT and never mutates the VIN", async () => {
    const header = "name,vehicleModelCode,branchCode,externalVehicleId,vin,externalSaleId";
    const csv =
      `${header}\nConflict,${MODEL},${BRANCH},EXTVEH-${run},VINDIFF-${run},SALE-CONF-${run}\n`;
    const up = await upload(adminToken, "conflict.csv", "text/csv", csv);
    assert.equal(up.statusCode, 201);
    const id = up.json().data.id as number;
    await app.inject({
      method: "PUT",
      url: `/imports/${id}/mapping`,
      headers: auth(adminToken),
      payload: { mapping: Object.fromEntries(header.split(",").map((h) => [h, h])) },
    });
    await app.inject({ method: "POST", url: `/imports/${id}/validate`, headers: auth(adminToken) });

    const preview = await app.inject({
      method: "GET",
      url: `/imports/${id}/preview`,
      headers: auth(adminToken),
    });
    const { counts, rows } = preview.json().data;
    assert.equal(counts.conflicts, 1);
    assert.equal(rows[0].status, "CONFLICT");
    assert.equal(rows[0].issues[0].reason, "duplicate_record");

    const confirm = await app.inject({ method: "POST", url: `/imports/${id}/confirm`, headers: auth(adminToken), payload: {} });
    assert.equal(confirm.json().data.failedRows, 1);
    assert.equal(confirm.json().data.importedRows, 0);

    // The existing vehicle's VIN is untouched (VIN immutable during import).
    const veh = await prisma.vehicle.findUnique({ where: { externalId: `EXTVEH-${run}` } });
    assert.equal(veh?.vin, `VINX-${run}`);
    // No conflicting experience was written.
    assert.equal(
      await prisma.purchaseExperience.findUnique({ where: { externalSaleId: `SALE-CONF-${run}` } }),
      null,
    );
  });

  test("valid XLSX flows through the same pipeline and imports", async () => {
    const header = HEADER.split(",");
    const dataRow = [
      "Xlsx Buyer", "", "", "", "",
      `VIN-XLSX-${run}`, MODEL, "2023", BRANCH, "", `SALE-XLSX-${run}`,
    ];
    const buf = await xlsxBuffer([header, dataRow]);
    const up = await upload(
      adminToken,
      "book.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buf,
    );
    assert.equal(up.statusCode, 201);
    const job = up.json().data;
    assert.equal(job.sourceType, "XLSX");
    assert.equal(job.totalRows, 1);
    const id = job.id as number;

    await app.inject({
      method: "PUT",
      url: `/imports/${id}/mapping`,
      headers: auth(adminToken),
      payload: identityMapping,
    });
    await app.inject({ method: "POST", url: `/imports/${id}/validate`, headers: auth(adminToken) });
    const confirm = await app.inject({ method: "POST", url: `/imports/${id}/confirm`, headers: auth(adminToken), payload: {} });
    assert.equal(confirm.statusCode, 200);
    assert.equal(confirm.json().data.status, "COMPLETED");
    assert.equal(confirm.json().data.importedRows, 1);
    assert.ok(await prisma.purchaseExperience.findUnique({ where: { externalSaleId: `SALE-XLSX-${run}` } }));
  });

  test("corrupted XLSX is rejected (422 invalid_xlsx_content)", async () => {
    // Valid ZIP signature but not a real workbook → parse failure. The container type
    // is right (it *is* a .xlsx/ZIP), so this is a content problem, not a type problem.
    const corrupt = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from("this is not a real xlsx workbook payload".repeat(4)),
    ]);
    const up = await upload(
      adminToken,
      "broken.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      corrupt,
    );
    assert.equal(up.statusCode, 422);
    assert.equal(up.json().error.context.reason, "invalid_xlsx_content");
  });

  test("valid XLSX is accepted with a generic/empty MIME (magic bytes decide the type)", async () => {
    const header = HEADER.split(",");
    const mkRow = (sale: string) => [
      "Mime Buyer", "", "", "", "",
      `VIN-${sale}`, MODEL, "2023", BRANCH, "", sale,
    ];

    // application/octet-stream — what many browsers/clients send for .xlsx.
    const octet = await upload(
      adminToken,
      "octet.xlsx",
      "application/octet-stream",
      await xlsxBuffer([header, mkRow(`SALE-OCTET-${run}`)]),
    );
    assert.equal(octet.statusCode, 201);
    assert.equal(octet.json().data.sourceType, "XLSX");

    // Empty content-type — still accepted on the ZIP signature alone.
    const empty = await upload(
      adminToken,
      "empty-mime.xlsx",
      "",
      await xlsxBuffer([header, mkRow(`SALE-EMPTY-${run}`)]),
    );
    assert.equal(empty.statusCode, 201);
    assert.equal(empty.json().data.sourceType, "XLSX");
  });

  test("identical file re-upload is blocked while a live job exists; cancel supersedes", async () => {
    const content = mainCsv(`DUP-${run}`); // fixed content → stable sha256
    const first = await upload(adminToken, "dup.csv", "text/csv", content);
    assert.equal(first.statusCode, 201);
    const firstId = first.json().data.id as number;

    const second = await upload(adminToken, "dup.csv", "text/csv", content);
    assert.equal(second.statusCode, 409);
    assert.equal(second.json().error.context.reason, "duplicate_upload");
    assert.equal(second.json().error.context.importJobId, firstId);

    // Cancelling the live job supersedes it → the identical file may be re-uploaded.
    await app.inject({ method: "POST", url: `/imports/${firstId}/cancel`, headers: auth(adminToken) });
    const third = await upload(adminToken, "dup.csv", "text/csv", content);
    assert.equal(third.statusCode, 201);
    // ...but now THAT live job blocks a further identical upload again.
    const fourth = await upload(adminToken, "dup.csv", "text/csv", content);
    assert.equal(fourth.statusCode, 409);
  });

  // A `force` field placed before the file bypasses the duplicate-upload guard.
  async function uploadForce(token: string, filename: string, mime: string, content: string) {
    const boundary = `----forceboundary${run}`;
    const field =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="force"\r\n\r\n` +
      `true\r\n`;
    const head =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${mime}\r\n\r\n`;
    const tail = `\r\n--${boundary}--\r\n`;
    const payload = Buffer.concat([
      Buffer.from(field),
      Buffer.from(head),
      Buffer.from(content),
      Buffer.from(tail),
    ]);
    return app.inject({
      method: "POST",
      url: "/imports",
      headers: { ...auth(token), "content-type": `multipart/form-data; boundary=${boundary}` },
      payload,
    });
  }

  test("force upload bypasses the duplicate guard and starts a fresh job", async () => {
    const content = mainCsv(`FORCE-${run}`); // fixed content → stable sha256
    const first = await upload(adminToken, "force.csv", "text/csv", content);
    assert.equal(first.statusCode, 201);
    const firstId = first.json().data.id as number;

    // Non-forced identical upload is blocked (the guard still applies by default).
    const blocked = await upload(adminToken, "force.csv", "text/csv", content);
    assert.equal(blocked.statusCode, 409);
    assert.equal(blocked.json().error.context.reason, "duplicate_upload");

    // Forced identical upload creates a NEW, distinct job.
    const forced = await uploadForce(adminToken, "force.csv", "text/csv", content);
    assert.equal(forced.statusCode, 201);
    assert.notEqual(forced.json().data.id, firstId);
  });

  test("RBAC: reader cannot upload or confirm; unauthenticated is rejected", async () => {
    const up = await upload(readerToken, "data.csv", "text/csv", mainCsv(nonce()));
    assert.equal(up.statusCode, 403);

    const id = await fullyImport(adminToken);
    const confirm = await app.inject({ method: "POST", url: `/imports/${id}/confirm`, headers: auth(readerToken), payload: {} });
    assert.equal(confirm.statusCode, 403);

    const unauth = await app.inject({ method: "GET", url: "/imports" });
    assert.ok(unauth.statusCode === 401 || unauth.statusCode === 403);

    // Reader CAN read (imports.read).
    const list = await app.inject({ method: "GET", url: "/imports", headers: auth(readerToken) });
    assert.equal(list.statusCode, 200);
  });

  // --- Manual-review row resolution (merge / create-new / skip) ---

  // 4 customers sharing ONE email, no externalCustomerId — the exact case that
  // strands rows on the results screen: row 1 imports, rows 2-4 match it by email at
  // confirm time and land in NEEDS_MANUAL_REVIEW (email is not unique, so the pipeline
  // refuses to auto-merge). Each row carries a distinct VIN + saleId so only the
  // customer is ambiguous.
  function sameEmailCsv(uniq: string) {
    // Lowercased up front: the pipeline normalizes email at write time
    // (`normalizeEmail`), so a mixed-case `run`/`uniq` (base36 timestamps,
    // upper-cased for readability) would otherwise never match what's actually
    // stored when a test later queries `prisma.customer.count({ where: { email } })`.
    const email = `dup-${run}-${uniq}@example.test`.toLowerCase();
    const rows = [
      HEADER,
      `SameEmail One,,${email},,,VIN-SE1-${run}-${uniq},${MODEL},,${BRANCH},,SALE-SE1-${run}-${uniq}`,
      `SameEmail Two,,${email},,,VIN-SE2-${run}-${uniq},${MODEL},,${BRANCH},,SALE-SE2-${run}-${uniq}`,
      `SameEmail Three,,${email},,,VIN-SE3-${run}-${uniq},${MODEL},,${BRANCH},,SALE-SE3-${run}-${uniq}`,
      `SameEmail Four,,${email},,,VIN-SE4-${run}-${uniq},${MODEL},,${BRANCH},,SALE-SE4-${run}-${uniq}`,
    ];
    return { csv: rows.join("\n") + "\n", email };
  }

  async function confirmSameEmail(uniq: string) {
    const { csv, email } = sameEmailCsv(uniq);
    const up = await upload(adminToken, `same-email-${uniq}.csv`, "text/csv", csv);
    assert.equal(up.statusCode, 201);
    const id = up.json().data.id as number;
    await app.inject({ method: "PUT", url: `/imports/${id}/mapping`, headers: auth(adminToken), payload: identityMapping });
    await app.inject({ method: "POST", url: `/imports/${id}/validate`, headers: auth(adminToken) });
    const confirm = await app.inject({ method: "POST", url: `/imports/${id}/confirm`, headers: auth(adminToken), payload: {} });
    assert.equal(confirm.statusCode, 200);
    return { id, email, job: confirm.json().data };
  }

  async function resultRows(id: number) {
    const res = await app.inject({ method: "GET", url: `/imports/${id}/results?pageSize=50`, headers: auth(adminToken) });
    assert.equal(res.statusCode, 200);
    return res.json().data.rows as Array<{
      rowNumber: number;
      status: string;
      customerId: number | null;
      sourceCustomerName: string | null;
    }>;
  }

  const resolve = (
    id: number,
    rowNumber: number,
    body: { decision: string; customerId?: number },
    token = adminToken,
  ) =>
    app.inject({
      method: "POST",
      url: `/imports/${id}/rows/${rowNumber}/resolve`,
      headers: auth(token),
      payload: body,
    });

  test("4 same-email rows confirm to 1 IMPORTED + 3 NEEDS_MANUAL_REVIEW", async () => {
    const { id, job } = await confirmSameEmail(nonce());
    assert.equal(job.status, "COMPLETED_WITH_ERRORS");
    assert.equal(job.importedRows, 1);
    assert.equal(job.manualReviewRows, 3);
    assert.equal(job.failedRows, 0);

    const rows = await resultRows(id);
    assert.equal(rows.filter((r) => r.status === "IMPORTED").length, 1);
    assert.equal(rows.filter((r) => r.status === "NEEDS_MANUAL_REVIEW").length, 3);
    // Review rows wrote no customer, but the source name is still surfaced.
    const review = rows.find((r) => r.status === "NEEDS_MANUAL_REVIEW");
    assert.ok(review);
    assert.equal(review.customerId, null);
    assert.ok(review.sourceCustomerName?.startsWith("SameEmail"));
  });

  test("resolve create_new forces a separate customer (same email allowed)", async () => {
    const { id, email } = await confirmSameEmail(nonce());
    const before = await prisma.customer.count({ where: { email } });
    assert.equal(before, 1);

    const review = (await resultRows(id)).find((r) => r.status === "NEEDS_MANUAL_REVIEW");
    assert.ok(review);
    const res = await resolve(id, review.rowNumber, { decision: "create_new" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().data.importedRows, 2);
    assert.equal(res.json().data.manualReviewRows, 2);

    // A second, separate customer now shares the email (the "full freedom" case).
    assert.equal(await prisma.customer.count({ where: { email } }), 2);
    const resolved = (await resultRows(id)).find((r) => r.rowNumber === review.rowNumber);
    assert.equal(resolved?.status, "IMPORTED");
  });

  test("confirm rowDecisions resolves review rows before execution", async () => {
    const uniq = nonce();
    const { csv, email } = sameEmailCsv(uniq);
    const up = await upload(adminToken, `pre-resolve-${uniq}.csv`, "text/csv", csv);
    assert.equal(up.statusCode, 201);
    const id = up.json().data.id as number;
    await app.inject({ method: "PUT", url: `/imports/${id}/mapping`, headers: auth(adminToken), payload: identityMapping });
    await app.inject({ method: "POST", url: `/imports/${id}/validate`, headers: auth(adminToken) });

    // Row 1 is NEW; decide rows 2 & 3 create-new, row 4 skip -> nothing left for review.
    const confirm = await app.inject({
      method: "POST",
      url: `/imports/${id}/confirm`,
      headers: auth(adminToken),
      payload: {
        rowDecisions: [
          { rowNumber: 2, decision: "create_new" },
          { rowNumber: 3, decision: "create_new" },
          { rowNumber: 4, decision: "skip" },
        ],
      },
    });
    assert.equal(confirm.statusCode, 200);
    const job = confirm.json().data;
    assert.equal(job.status, "COMPLETED");
    assert.equal(job.importedRows, 3);
    assert.equal(job.skippedRows, 1);
    assert.equal(job.manualReviewRows, 0);
    assert.equal(job.failedRows, 0);

    // Three separate customers now share the email (row1 + the two create-new rows).
    assert.equal(await prisma.customer.count({ where: { email } }), 3);

    const rows = await resultRows(id);
    assert.equal(rows.filter((r) => r.status === "IMPORTED").length, 3);
    assert.equal(rows.filter((r) => r.status === "SKIPPED").length, 1);
    assert.equal(rows.filter((r) => r.status === "NEEDS_MANUAL_REVIEW").length, 0);
  });

  test("confirm rowDecisions leaves undecided review rows for the results screen", async () => {
    const uniq = nonce();
    const { csv } = sameEmailCsv(uniq);
    const up = await upload(adminToken, `partial-${uniq}.csv`, "text/csv", csv);
    const id = up.json().data.id as number;
    await app.inject({ method: "PUT", url: `/imports/${id}/mapping`, headers: auth(adminToken), payload: identityMapping });
    await app.inject({ method: "POST", url: `/imports/${id}/validate`, headers: auth(adminToken) });

    // Decide only row 2; rows 3 & 4 stay ambiguous.
    const confirm = await app.inject({
      method: "POST",
      url: `/imports/${id}/confirm`,
      headers: auth(adminToken),
      payload: { rowDecisions: [{ rowNumber: 2, decision: "create_new" }] },
    });
    assert.equal(confirm.statusCode, 200);
    const job = confirm.json().data;
    assert.equal(job.status, "COMPLETED_WITH_ERRORS");
    assert.equal(job.importedRows, 2); // row1 + row2
    assert.equal(job.manualReviewRows, 2); // rows 3 & 4 still need review
  });

  test("resolve merge links the row to the chosen existing customer (no new customer)", async () => {
    const { id, email } = await confirmSameEmail(nonce());
    const rows = await resultRows(id);
    const imported = rows.find((r) => r.status === "IMPORTED");
    const review = rows.find((r) => r.status === "NEEDS_MANUAL_REVIEW");
    assert.ok(imported?.customerId && review);

    const res = await resolve(id, review.rowNumber, { decision: "merge", customerId: imported.customerId });
    assert.equal(res.statusCode, 200);
    // No extra customer created — still exactly one with this email.
    assert.equal(await prisma.customer.count({ where: { email } }), 1);
    const resolved = (await resultRows(id)).find((r) => r.rowNumber === review.rowNumber);
    assert.equal(resolved?.status, "IMPORTED");
    assert.equal(resolved?.customerId, imported.customerId);
  });

  test("resolving the last review row flips the job back to COMPLETED", async () => {
    const { id } = await confirmSameEmail(nonce());
    const reviews = (await resultRows(id)).filter((r) => r.status === "NEEDS_MANUAL_REVIEW");
    assert.equal(reviews.length, 3);
    for (const r of reviews) {
      const res = await resolve(id, r.rowNumber, { decision: "skip" });
      assert.equal(res.statusCode, 200);
    }
    const job = await app.inject({ method: "GET", url: `/imports/${id}`, headers: auth(adminToken) });
    assert.equal(job.json().data.status, "COMPLETED");
    assert.equal(job.json().data.manualReviewRows, 0);
    assert.equal(job.json().data.skippedRows, 3);
  });

  test("resolve guards: already-resolved row 409, reader 403, missing merge target 400/422", async () => {
    const { id } = await confirmSameEmail(nonce());
    const review = (await resultRows(id)).find((r) => r.status === "NEEDS_MANUAL_REVIEW");
    assert.ok(review);

    // Reader lacks imports.manage.
    const forbidden = await resolve(id, review.rowNumber, { decision: "skip" }, readerToken);
    assert.equal(forbidden.statusCode, 403);

    // Resolve once, then again → the row is no longer resolvable.
    assert.equal((await resolve(id, review.rowNumber, { decision: "skip" })).statusCode, 200);
    const again = await resolve(id, review.rowNumber, { decision: "skip" });
    assert.equal(again.statusCode, 409);
    assert.equal(again.json().error.context.reason, "row_not_resolvable");

    // Merge without a target customer is rejected by validation.
    const other = (await resultRows(id)).find((r) => r.status === "NEEDS_MANUAL_REVIEW");
    assert.ok(other);
    const bad = await resolve(id, other.rowNumber, { decision: "merge" });
    assert.ok(bad.statusCode === 400 || bad.statusCode === 422);
  });
}
