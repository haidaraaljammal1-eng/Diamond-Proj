/* eslint-disable @typescript-eslint/no-explicit-any */
// Manual end-to-end audit for the sales-import name-matching feature. Requires the
// backend running on :4000 with the dev admin seeded. Run: npx tsx scripts/audit-import-name-matching.ts
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { normalizedNameExtension } from "src/lib/db/prisma-extensions";
import { normalizeName } from "src/lib/master-data/code";

const url = readFileSync(".env", "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith("DATABASE_URL="))!
  .slice("DATABASE_URL=".length)
  .replace(/^["']|["']$/g, "");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) }).$extends(
  normalizedNameExtension,
);

const BASE = "http://localhost:4000";
const RUN = Date.now().toString(36).toUpperCase();
// Per-run-unique mobile so the ambiguous-customer guard (matches existing contacts
// by mobile) never fires across audit runs.
const mobBase = String(Date.now()).slice(-7);
const many = (n: number) => `05${mobBase}${n}`;
const cust = (n: string) => `${n} ${RUN}`;

// Names (suffixed to stay re-runnable). Same values used to pre-seed "existing"
// records AND in the CSV, so the importer matches them by normalized name.
const existBranch = `Riyadh Main ${RUN}`;
const existModel = `Attrage ${RUN}`;
const existSp = `Sami Existing ${RUN}`;
const newBranch = `Jeddah Center ${RUN}`;
const newModel = `Xpander ${RUN}`;
const newSpNew = `Nora New ${RUN}`;
const newSpExist = `Fresh Rep ${RUN}`;
const dupSp = `Ali Hassan ${RUN}`;
const alpha = `Alpha ${RUN}`;
const beta = `Beta ${RUN}`;

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "  ✅" : "  ❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

async function masterCounts() {
  const [branches, models, salespeople] = await Promise.all([
    prisma.branch.count(),
    prisma.vehicleModel.count(),
    prisma.salesperson.count(),
  ]);
  return { branches, models, salespeople };
}

async function main() {
  console.log(`\n=== Sales-import name-matching audit (run ${RUN}) ===\n`);

  // 1) Pre-seed the "existing" master data.
  const branchRec = await prisma.branch.create({ data: { code: `AUB-${RUN}`, name: existBranch } });
  await prisma.vehicleModel.create({ data: { code: `AUM-${RUN}`, name: existModel } });
  await prisma.salesperson.create({ data: { code: `AUS-${RUN}`, name: existSp, branchId: branchRec.id } });
  console.log("Seeded existing: branch, model, salesperson.\n");

  // 2) Build the CSV (business-name columns only).
  const headers = [
    "customer_name", "mobile", "email", "vehicle_model_name", "vehicle_model_year",
    "vehicle_vin", "branch_name", "salesperson_name", "purchase_date", "delivery_date",
  ];
  const rows = [
    [cust("Cust One"), many(1), "", existModel, "2026", "", existBranch, existSp, "2026-01-10", "2026-01-12"],
    [cust("Cust Two"), many(2), "", newModel, "2026", "", newBranch, newSpNew, "2026-01-11", ""],
    [cust("Cust Three"), many(3), "", existModel, "2026", "", existBranch, newSpExist, "2026-01-12", ""],
    [cust("Cust Four"), many(4), "", existModel, "2026", "", alpha, dupSp, "2026-01-13", ""],
    [cust("Cust Five"), many(5), "", existModel, "2026", "", beta, dupSp, "2026-01-14", ""],
  ];
  const esc = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");

  // 3) Auth.
  const login: any = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@admin.com", password: "12345678" }),
  }).then((r) => r.json());
  const token = login.data.accessToken as string;
  const auth = { Authorization: `Bearer ${token}` };

  // 4) Upload (multipart).
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), `audit-${RUN}.csv`);
  const upRes = await fetch(`${BASE}/imports`, { method: "POST", headers: auth, body: form });
  const up: any = await upRes.json();
  if (!upRes.ok) throw new Error(`upload failed ${upRes.status}: ${JSON.stringify(up)}`);
  const jobId = up.data.id as number;
  console.log(`Uploaded job #${jobId} (${up.data.totalRows} rows).`);

  // 5) Map + validate.
  const mapping = {
    customer_name: "name", mobile: "mobile", email: "email",
    vehicle_model_name: "vehicleModelName", vehicle_model_year: "modelYear", vehicle_vin: "vin",
    branch_name: "branchName", salesperson_name: "salespersonName",
    purchase_date: "purchaseDate", delivery_date: "deliveryDate",
  };
  const mapRes = await fetch(`${BASE}/imports/${jobId}/mapping`, {
    method: "PUT", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ mapping }),
  });
  if (!mapRes.ok) throw new Error(`mapping failed ${mapRes.status}: ${await mapRes.text()}`);
  await fetch(`${BASE}/imports/${jobId}/validate`, { method: "POST", headers: auth });

  // 6) Snapshot BEFORE preview.
  const before = await masterCounts();

  // 7) Preview — must WRITE NOTHING.
  const prev: any = await fetch(`${BASE}/imports/${jobId}/preview?page=1&pageSize=50`, { headers: auth }).then((r) => r.json());
  const md = prev.data.masterData;
  const byStatus = (arr: any[], s: string) => arr.filter((x) => x.status === s).length;
  console.log("\n-- Preview classification --");
  check("model 'existing' = 1 (Attrage)", byStatus(md.vehicleModels, "existing") === 1);
  check("model 'will_create' = 1 (Xpander)", byStatus(md.vehicleModels, "will_create") === 1);
  check("branch 'existing' = 1 (Riyadh Main)", byStatus(md.branches, "existing") === 1);
  check("branch 'will_create' = 3 (Jeddah/Alpha/Beta)", byStatus(md.branches, "will_create") === 3);
  check("salesperson 'existing' = 1 (Sami)", byStatus(md.salespeople, "existing") === 1);
  check(
    "salesperson 'will_create' = 4 (Nora/Fresh/Ali@Alpha/Ali@Beta)",
    byStatus(md.salespeople, "will_create") === 4,
    `got ${byStatus(md.salespeople, "will_create")}`,
  );

  // 8) Zero-writes assertion.
  const afterPreview = await masterCounts();
  console.log("\n-- Preview = ZERO WRITES --");
  check(
    "master-data counts unchanged after preview",
    before.branches === afterPreview.branches &&
      before.models === afterPreview.models &&
      before.salespeople === afterPreview.salespeople,
    `before=${JSON.stringify(before)} after=${JSON.stringify(afterPreview)}`,
  );

  // 9) Confirm (empty body → auto-create all new master data).
  const confRes = await fetch(`${BASE}/imports/${jobId}/confirm`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: "{}",
  });
  const conf: any = await confRes.json();
  if (!confRes.ok) throw new Error(`confirm failed ${confRes.status}: ${JSON.stringify(conf)}`);
  console.log(`\nConfirmed → status ${conf.data.status}, imported ${conf.data.importedRows}.`);

  // 10) Assert final DB state.
  console.log("\n-- Post-confirm DB assertions --");
  const branchByName = async (n: string) =>
    prisma.branch.findMany({ where: { normalizedName: normalizeName(n) } });
  const modelByName = async (n: string) =>
    prisma.vehicleModel.findMany({ where: { normalizedName: normalizeName(n) } });
  const spByName = async (n: string) =>
    prisma.salesperson.findMany({ where: { normalizedName: normalizeName(n) } });

  check("Riyadh Main NOT duplicated (exactly 1)", (await branchByName(existBranch)).length === 1);
  check("Jeddah Center created (1)", (await branchByName(newBranch)).length === 1);
  check("Alpha created (1)", (await branchByName(alpha)).length === 1);
  check("Beta created (1)", (await branchByName(beta)).length === 1);
  check("Attrage NOT duplicated (1)", (await modelByName(existModel)).length === 1);
  check("Xpander created (1)", (await modelByName(newModel)).length === 1);

  const sami = await spByName(existSp);
  check("Sami NOT duplicated (1)", sami.length === 1);
  check("Nora created (1)", (await spByName(newSpNew)).length === 1);
  check("Fresh Rep created (1)", (await spByName(newSpExist)).length === 1);

  // The key scenario: same salesperson name in two branches → TWO people.
  const alis = await spByName(dupSp);
  const aliBranchIds = new Set(alis.map((a) => a.branchId));
  check("Ali Hassan = 2 people (dup name, 2 branches)", alis.length === 2, `got ${alis.length}`);
  check("Ali Hassan two DISTINCT branches", aliBranchIds.size === 2);
  const alphaRec = (await branchByName(alpha))[0];
  const betaRec = (await branchByName(beta))[0];
  check("Ali linked to Alpha + Beta", !!alphaRec && !!betaRec && aliBranchIds.has(alphaRec.id) && aliBranchIds.has(betaRec.id));

  // Experiences created + correctly linked (customer names are run-suffixed).
  const custNames = ["Cust One", "Cust Two", "Cust Three", "Cust Four", "Cust Five"].map(cust);
  const exps = await prisma.purchaseExperience.findMany({
    where: { customer: { name: { in: custNames } } },
    include: { customer: true, branch: true, salesperson: true, vehicle: { include: { model: true } } },
  });
  check("5 purchase experiences created", exps.length === 5, `got ${exps.length}`);
  const e1 = exps.find((e) => e.customer.name === cust("Cust One"));
  check("Cust One → existing branch + existing salesperson + existing model",
    e1?.branch.name === existBranch && e1?.salesperson?.name === existSp && e1?.vehicle.model?.name === existModel);
  const e4 = exps.find((e) => e.customer.name === cust("Cust Four"));
  const e5 = exps.find((e) => e.customer.name === cust("Cust Five"));
  check("Cust Four salesperson.branch = Alpha", e4?.branch.name === alpha && e4?.salesperson?.branchId === alphaRec?.id);
  check("Cust Five salesperson.branch = Beta", e5?.branch.name === beta && e5?.salesperson?.branchId === betaRec?.id);
  check("Cust Four & Five are DIFFERENT salespeople", !!e4?.salespersonId && e4?.salespersonId !== e5?.salespersonId);

  // 11) Idempotency / no-duplicate re-import: same master-data names, new
  // customers. Every master-data ref must now resolve as EXISTING and NO new
  // branch/model/salesperson may be created.
  console.log("\n-- Second pass (idempotent re-import) --");
  const countsAfterPass1 = await masterCounts();
  const rows2 = [
    [cust("Re One"), many(6), "", existModel, "2026", "", existBranch, existSp, "2026-02-10", ""],
    [cust("Re Two"), many(7), "", newModel, "2026", "", newBranch, newSpNew, "2026-02-11", ""],
    [cust("Re Three"), many(8), "", existModel, "2026", "", alpha, dupSp, "2026-02-12", ""],
    [cust("Re Four"), many(9), "", existModel, "2026", "", beta, dupSp, "2026-02-13", ""],
  ];
  const csv2 = [headers, ...rows2].map((r) => r.map(esc).join(",")).join("\r\n");
  const form2 = new FormData();
  form2.append("file", new Blob([csv2], { type: "text/csv" }), `audit-${RUN}-p2.csv`);
  const up2: any = await (await fetch(`${BASE}/imports`, { method: "POST", headers: auth, body: form2 })).json();
  const jobId2 = up2.data.id as number;
  await fetch(`${BASE}/imports/${jobId2}/mapping`, {
    method: "PUT", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ mapping }),
  });
  await fetch(`${BASE}/imports/${jobId2}/validate`, { method: "POST", headers: auth });
  const prev2: any = await (await fetch(`${BASE}/imports/${jobId2}/preview?page=1&pageSize=50`, { headers: auth })).json();
  const md2 = prev2.data.masterData;
  check("re-import: 0 new models", byStatus(md2.vehicleModels, "will_create") === 0);
  check("re-import: 0 new branches", byStatus(md2.branches, "will_create") === 0);
  check("re-import: 0 new salespeople", byStatus(md2.salespeople, "will_create") === 0, `got ${byStatus(md2.salespeople, "will_create")}`);
  await fetch(`${BASE}/imports/${jobId2}/confirm`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: "{}" });
  const countsAfterPass2 = await masterCounts();
  check(
    "re-import created NO new master data",
    countsAfterPass1.branches === countsAfterPass2.branches &&
      countsAfterPass1.models === countsAfterPass2.models &&
      countsAfterPass1.salespeople === countsAfterPass2.salespeople,
    `p1=${JSON.stringify(countsAfterPass1)} p2=${JSON.stringify(countsAfterPass2)}`,
  );

  console.log(`\n=== ${failures === 0 ? "ALL CHECKS PASSED ✅" : `${failures} CHECK(S) FAILED ❌`} ===\n`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("AUDIT ERROR:", e);
  await prisma.$disconnect();
  process.exit(2);
});
