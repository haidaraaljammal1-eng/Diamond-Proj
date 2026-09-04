import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { normalizeName } from "src/lib/master-data/code";
import { ImportErrorReason, rowIssue, type RowIssue } from "src/modules/imports/imports.errors";
import type { ParsedRow } from "src/modules/imports/row-parse";

/**
 * Read-only evaluation of a parsed row against the authoritative tables: resolves
 * master data by immutable code / externalId, decides the customer / vehicle /
 * experience match plan, and classifies the row. NEVER writes — it is shared by
 * the (write-free) preview and by confirm (which re-evaluates inside a tx and
 * then executes the plan). Matching is exact only: no fuzzy logic, no name-based
 * customer merging.
 */

export type RowStatus =
  | "NEW"
  | "SKIPPED"
  | "DUPLICATE"
  | "CONFLICT"
  | "MANUAL_REVIEW"
  | "INVALID";

/**
 * How a referenced master-data value (vehicle model / branch / salesperson)
 * resolves during the write-free evaluation:
 *  - `existing`     — an active record was matched → link to it.
 *  - `will_create`  — nothing matched; it is safe to create one at confirm (or,
 *                     for model/branch, the user may link it to an existing record).
 *  - `needs_review` — a record exists but is inactive (a real conflict) → import
 *                     is blocked until a human resolves it.
 */
export type MasterRefStatus = "existing" | "will_create" | "needs_review";

export interface MasterRefResult {
  /** Stable fold/resolution key across rows (canonical code or name key). */
  code: string;
  /** How this ref was matched: ERP `code`/externalId, or business `name`. */
  by: "code" | "name";
  /** Verbatim supplied value (name or code) — the display + create value. */
  value: string;
  status: MasterRefStatus;
  matchedId: number | null;
  matchedName: string | null;
}

export interface RowMasterData {
  vehicleModel: MasterRefResult | null;
  branch: MasterRefResult | null;
  salesperson: MasterRefResult | null;
}

export interface CustomerPlan {
  mode: "existing" | "create";
  id?: number;
}
export interface VehiclePlan {
  mode: "existing" | "create";
  id?: number;
  modelId: number;
}
export interface ExperiencePlan {
  mode: "create" | "skip";
  id?: number;
  branchId: number;
  salespersonId: number | null;
  /**
   * Set when the salesperson was matched by name and none exists yet: create one
   * in this branch at write time (needs the resolved branchId, hence deferred to
   * executeRow rather than the write-free evaluation).
   */
  salespersonCreate?: { name: string };
}
export interface RowEvaluation {
  status: RowStatus;
  issues: RowIssue[];
  masterData: RowMasterData;
  customer?: CustomerPlan;
  vehicle?: VehiclePlan;
  experience?: ExperiencePlan;
}

type Db = Prisma.TransactionClient;

interface MasterRef {
  id: number;
  isActive: boolean;
  name?: string | null;
}

/** Per-pass caches: cut repeated master-data lookups and track within-file sale ids.
 *  Model/branch are cached by both code and normalized name (confirm seeds the
 *  name/code cache after creating an approved record). Salespeople matched by name
 *  are read fresh every time — they are created per-row during confirm, so a cache
 *  would go stale within the pass. */
export interface EvalContext {
  modelByCode: Map<string, MasterRef | null>;
  modelByName: Map<string, MasterRef | null>;
  branchByCode: Map<string, MasterRef | null>;
  branchByName: Map<string, MasterRef | null>;
  salespersonByCode: Map<string, MasterRef | null>;
  salespersonByExt: Map<string, MasterRef | null>;
  seenSaleIds: Set<string>;
}

export function newEvalContext(): EvalContext {
  return {
    modelByCode: new Map(),
    modelByName: new Map(),
    branchByCode: new Map(),
    branchByName: new Map(),
    salespersonByCode: new Map(),
    salespersonByExt: new Map(),
    seenSaleIds: new Set(),
  };
}

const MASTER_SELECT = { id: true, isActive: true, name: true } as const;

async function lookupModelByCode(db: Db, ctx: EvalContext, code: string): Promise<MasterRef | null> {
  if (ctx.modelByCode.has(code)) return ctx.modelByCode.get(code) ?? null;
  const row = await db.vehicleModel.findUnique({ where: { code }, select: MASTER_SELECT });
  ctx.modelByCode.set(code, row);
  return row;
}
async function lookupModelByName(db: Db, ctx: EvalContext, nn: string): Promise<MasterRef | null> {
  if (ctx.modelByName.has(nn)) return ctx.modelByName.get(nn) ?? null;
  const row = await db.vehicleModel.findFirst({ where: { normalizedName: nn }, select: MASTER_SELECT });
  ctx.modelByName.set(nn, row);
  return row;
}
async function lookupBranchByCode(db: Db, ctx: EvalContext, code: string): Promise<MasterRef | null> {
  if (ctx.branchByCode.has(code)) return ctx.branchByCode.get(code) ?? null;
  const row = await db.branch.findUnique({ where: { code }, select: MASTER_SELECT });
  ctx.branchByCode.set(code, row);
  return row;
}
async function lookupBranchByName(db: Db, ctx: EvalContext, nn: string): Promise<MasterRef | null> {
  if (ctx.branchByName.has(nn)) return ctx.branchByName.get(nn) ?? null;
  const row = await db.branch.findFirst({ where: { normalizedName: nn }, select: MASTER_SELECT });
  ctx.branchByName.set(nn, row);
  return row;
}
async function resolveSalespersonByKey(
  db: Db,
  ctx: EvalContext,
  byExt: string | null,
  byCode: string | null,
): Promise<MasterRef | null> {
  if (byExt) {
    if (ctx.salespersonByExt.has(byExt)) return ctx.salespersonByExt.get(byExt) ?? null;
    const row = await db.salesperson.findUnique({ where: { externalId: byExt }, select: MASTER_SELECT });
    ctx.salespersonByExt.set(byExt, row);
    return row;
  }
  if (byCode) {
    if (ctx.salespersonByCode.has(byCode)) return ctx.salespersonByCode.get(byCode) ?? null;
    const row = await db.salesperson.findUnique({ where: { code: byCode }, select: MASTER_SELECT });
    ctx.salespersonByCode.set(byCode, row);
    return row;
  }
  return null;
}

/** Turn a master-data lookup result + ref descriptor into a classified MasterRefResult.
 *  An inactive record is a real conflict (needs_review + issue); a miss is a safe
 *  will_create (no issue → never blocks the row). */
function classifyMaster(
  rec: MasterRef | null,
  desc: { by: "code" | "name"; value: string; key: string },
  field: string,
  inactiveCode: string,
  inactiveMsg: string,
  issues: RowIssue[],
): { id: number; ref: MasterRefResult } {
  const base = { code: desc.key, by: desc.by, value: desc.value } as const;
  if (!rec) {
    return { id: 0, ref: { ...base, status: "will_create", matchedId: null, matchedName: null } };
  }
  if (!rec.isActive) {
    issues.push(rowIssue(field, inactiveCode, ImportErrorReason.INACTIVE_REFERENCE, inactiveMsg));
    return { id: 0, ref: { ...base, status: "needs_review", matchedId: rec.id, matchedName: rec.name ?? null } };
  }
  return { id: rec.id, ref: { ...base, status: "existing", matchedId: rec.id, matchedName: rec.name ?? null } };
}

/**
 * Evaluate one parsed row. `structuralIssues` are the format/required issues from
 * {@link parseRow}; resolution + matching issues are added here.
 */
export async function evaluateRow(
  db: Db,
  ctx: EvalContext,
  parsed: ParsedRow,
  structuralIssues: RowIssue[],
): Promise<RowEvaluation> {
  const issues: RowIssue[] = [...structuralIssues];

  // --- Master-data resolution (smart classification, write-free) ---
  // Primary match is by business NAME (normalized); an ERP `code`, when supplied,
  // is an exact override. An unmatched name/code is NOT an error: it is a candidate
  // to CREATE (or, for model/branch, link) at confirm, so the row still imports.
  // Only an inactive record is a real conflict a human must resolve. No fuzzy match.
  let modelId = 0;
  let vehicleModel: MasterRefResult | null = null;
  if (parsed.vehicle.vehicleModelCode) {
    const code = parsed.vehicle.vehicleModelCode;
    const rec = await lookupModelByCode(db, ctx, code);
    const r = classifyMaster(rec, { by: "code", value: code, key: code }, "vehicleModelCode", "inactive_model", "Vehicle model is inactive", issues);
    modelId = r.id;
    vehicleModel = r.ref;
  } else if (parsed.vehicle.vehicleModelName) {
    const value = parsed.vehicle.vehicleModelName;
    const nn = normalizeName(value);
    const rec = await lookupModelByName(db, ctx, nn);
    const r = classifyMaster(rec, { by: "name", value, key: `name:${nn}` }, "vehicleModelName", "inactive_model", "Vehicle model is inactive", issues);
    modelId = r.id;
    vehicleModel = r.ref;
  }

  let branchId = 0;
  let branch: MasterRefResult | null = null;
  if (parsed.experience.branchCode) {
    const code = parsed.experience.branchCode;
    const rec = await lookupBranchByCode(db, ctx, code);
    const r = classifyMaster(rec, { by: "code", value: code, key: code }, "branchCode", "inactive_branch", "Branch is inactive", issues);
    branchId = r.id;
    branch = r.ref;
  } else if (parsed.experience.branchName) {
    const value = parsed.experience.branchName;
    const nn = normalizeName(value);
    const rec = await lookupBranchByName(db, ctx, nn);
    const r = classifyMaster(rec, { by: "name", value, key: `name:${nn}` }, "branchName", "inactive_branch", "Branch is inactive", issues);
    branchId = r.id;
    branch = r.ref;
  }

  // Salesperson: ERP externalId/code must resolve to an EXISTING active record (a
  // bad key is an error). A business name is matched within the branch and, if
  // absent, created there at confirm — hence deferred to executeRow (needs branchId).
  let salespersonId: number | null = null;
  let salesperson: MasterRefResult | null = null;
  let salespersonCreate: { name: string } | undefined;
  const exp = parsed.experience;
  if (exp.salespersonExternalId || exp.salespersonCode) {
    const sp = await resolveSalespersonByKey(db, ctx, exp.salespersonExternalId, exp.salespersonCode);
    if (!sp) {
      issues.push(rowIssue("salespersonCode", "unknown_salesperson", ImportErrorReason.INVALID_PARENT, "Salesperson does not exist"));
    } else if (!sp.isActive) {
      issues.push(rowIssue("salespersonCode", "inactive_salesperson", ImportErrorReason.INACTIVE_REFERENCE, "Salesperson is inactive"));
    } else {
      salespersonId = sp.id;
    }
  } else if (exp.salespersonName) {
    const value = exp.salespersonName;
    const nn = normalizeName(value);
    const spKey = `${branch?.code ?? "-"}::sp:${nn}`;
    const base = { code: spKey, by: "name", value } as const;
    // Only look up an existing salesperson once the branch is known (an existing
    // branch, or one seeded by confirm's phase-2). Otherwise it is a new person in
    // a not-yet-created branch → will_create.
    const rec = branchId > 0
      ? await db.salesperson.findFirst({ where: { branchId, normalizedName: nn }, select: MASTER_SELECT })
      : null;
    if (!rec) {
      salesperson = { ...base, status: "will_create", matchedId: null, matchedName: null };
      salespersonCreate = { name: value };
    } else if (!rec.isActive) {
      salesperson = { ...base, status: "needs_review", matchedId: rec.id, matchedName: rec.name ?? null };
      issues.push(rowIssue("salespersonName", "inactive_salesperson", ImportErrorReason.INACTIVE_REFERENCE, "Salesperson is inactive"));
    } else {
      salespersonId = rec.id;
      salesperson = { ...base, status: "existing", matchedId: rec.id, matchedName: rec.name ?? null };
    }
  }
  const masterData: RowMasterData = { vehicleModel, branch, salesperson };

  // --- Customer match (exact by externalId; else ambiguity guard, never merge) ---
  let customer: CustomerPlan | undefined;
  if (parsed.customer.externalId) {
    const existing = await db.customer.findUnique({
      where: { externalId: parsed.customer.externalId },
      select: { id: true },
    });
    customer = existing ? { mode: "existing", id: existing.id } : { mode: "create" };
  } else {
    // No business key. Do NOT merge on mobile/email — only detect ambiguity.
    const or: Prisma.CustomerWhereInput[] = [];
    if (parsed.customer.mobile) or.push({ mobile: parsed.customer.mobile });
    if (parsed.customer.email) or.push({ email: parsed.customer.email });
    let ambiguous = false;
    if (or.length > 0) {
      const hit = await db.customer.findFirst({ where: { OR: or }, select: { id: true } });
      ambiguous = hit !== null;
    }
    if (ambiguous) {
      issues.push(
        rowIssue(
          "externalCustomerId",
          "ambiguous_customer",
          ImportErrorReason.AMBIGUOUS_CUSTOMER_MATCH,
          "Customer has no external id and matches an existing contact; resolve manually",
          "Provide externalCustomerId to disambiguate",
        ),
      );
    }
    customer = { mode: "create" };
  }

  // --- Vehicle match (externalId, then VIN; VIN immutable — mismatch = conflict) ---
  let vehicle: VehiclePlan | undefined;
  let vehicleConflict = false;
  if (parsed.vehicle.externalId) {
    const existing = await db.vehicle.findUnique({
      where: { externalId: parsed.vehicle.externalId },
      select: { id: true, vin: true },
    });
    if (existing) {
      if (parsed.vehicle.vin && existing.vin !== parsed.vehicle.vin) {
        vehicleConflict = true;
        issues.push(rowIssue("vin", "vin_conflict", ImportErrorReason.DUPLICATE_RECORD, "VIN does not match the existing vehicle and cannot be changed"));
      }
      vehicle = { mode: "existing", id: existing.id, modelId };
    } else if (parsed.vehicle.vin) {
      // New externalVehicleId but the VIN may belong to another vehicle.
      const byVin = await db.vehicle.findUnique({ where: { vin: parsed.vehicle.vin }, select: { id: true } });
      if (byVin) {
        vehicleConflict = true;
        issues.push(rowIssue("vin", "duplicate_vin", ImportErrorReason.DUPLICATE_RECORD, "VIN already belongs to a different vehicle"));
        vehicle = { mode: "existing", id: byVin.id, modelId };
      } else {
        vehicle = { mode: "create", modelId };
      }
    } else {
      vehicle = { mode: "create", modelId };
    }
  } else if (parsed.vehicle.vin) {
    const existing = await db.vehicle.findUnique({
      where: { vin: parsed.vehicle.vin },
      select: { id: true },
    });
    vehicle = existing ? { mode: "existing", id: existing.id, modelId } : { mode: "create", modelId };
  } else {
    // No externalId, no VIN — cannot dedup; always a new vehicle (documented risk).
    vehicle = { mode: "create", modelId };
  }

  // --- Experience match (externalSaleId is the strong idempotency key) ---
  let experience: ExperiencePlan | undefined;
  let duplicateInFile = false;
  let existingSale = false;
  if (parsed.experience.externalSaleId) {
    const saleId = parsed.experience.externalSaleId;
    if (ctx.seenSaleIds.has(saleId)) {
      duplicateInFile = true;
      experience = { mode: "skip", branchId, salespersonId };
    } else {
      ctx.seenSaleIds.add(saleId);
      const existing = await db.purchaseExperience.findUnique({
        where: { externalSaleId: saleId },
        select: { id: true },
      });
      if (existing) {
        existingSale = true;
        experience = { mode: "skip", id: existing.id, branchId, salespersonId };
      } else {
        experience = { mode: "create", branchId, salespersonId, salespersonCreate };
      }
    }
  } else {
    // No externalSaleId — it is OPTIONAL. Import still
    // proceeds and a fresh experience is created; duplicate protection continues
    // to come from the customer (externalId) and vehicle (externalId/VIN) keys.
    experience = { mode: "create", branchId, salespersonId, salespersonCreate };
  }

  // --- Classify (precedence: invalid > manual review > conflict > dup > existing > new) ---
  // "Soft" reasons don't force INVALID; one of them routes to manual review.
  // A `will_create` master-data reference emits NO issue, so it never blocks the
  // row — the record is created (or linked) at confirm.
  const SOFT_REASONS: ReadonlySet<string> = new Set([
    ImportErrorReason.AMBIGUOUS_CUSTOMER_MATCH,
    ImportErrorReason.DUPLICATE_RECORD,
  ]);
  const MANUAL_REASONS: ReadonlySet<string> = new Set([
    ImportErrorReason.AMBIGUOUS_CUSTOMER_MATCH,
  ]);
  let status: RowStatus;
  if (issues.some((i) => !SOFT_REASONS.has(i.reason))) {
    status = "INVALID";
  } else if (issues.some((i) => MANUAL_REASONS.has(i.reason))) {
    status = "MANUAL_REVIEW";
  } else if (vehicleConflict) {
    status = "CONFLICT";
  } else if (duplicateInFile) {
    status = "DUPLICATE";
  } else if (existingSale) {
    status = "SKIPPED";
  } else {
    status = "NEW";
  }

  return { status, issues, masterData, customer, vehicle, experience };
}

export interface RowWriteResult {
  result: "IMPORTED" | "SKIPPED";
  customerId: number;
  vehicleId: number;
  experienceId: number | null;
}

/**
 * Execute a NEW row's plan inside an already-open transaction. Idempotent by
 * construction: every identity key (customer externalId, vehicle externalId/VIN,
 * sale externalSaleId) is guarded by an advisory lock + find-before-create and a
 * P2002 fallback, so a concurrent/repeated run reuses the existing row instead of
 * duplicating it. Never mutates an already-existing customer/vehicle (no
 * destructive overwrite; VIN stays immutable).
 */
export async function executeRow(
  tx: Db,
  parsed: ParsedRow,
  evaluation: RowEvaluation,
): Promise<RowWriteResult> {
  const customerId = await getOrCreateCustomer(tx, parsed, evaluation.customer!);
  const vehicleId = await getOrCreateVehicle(tx, parsed, evaluation.vehicle!);
  const plan = evaluation.experience!;
  // A name-matched salesperson with no existing record is created in its branch
  // now that the branchId is resolved (idempotent get-or-create).
  const salespersonId =
    plan.salespersonCreate && plan.branchId > 0
      ? await getOrCreateSalesperson(tx, plan.branchId, plan.salespersonCreate.name)
      : plan.salespersonId;
  const exp = await createExperienceIdempotent(tx, parsed, { ...plan, salespersonId }, customerId, vehicleId);
  return {
    result: exp.created ? "IMPORTED" : "SKIPPED",
    customerId,
    vehicleId,
    experienceId: exp.id,
  };
}

async function getOrCreateCustomer(tx: Db, parsed: ParsedRow, plan: CustomerPlan): Promise<number> {
  if (plan.mode === "existing" && plan.id) return plan.id;
  const c = parsed.customer;
  if (c.externalId) {
    await acquireAdvisoryLock(tx, "import_customer", c.externalId);
    const found = await tx.customer.findUnique({ where: { externalId: c.externalId }, select: { id: true } });
    if (found) return found.id;
    try {
      const created = await tx.customer.create({ data: customerData(parsed), select: { id: true } });
      return created.id;
    } catch (err) {
      if (isUniqueViolation(err)) {
        const again = await tx.customer.findUnique({ where: { externalId: c.externalId }, select: { id: true } });
        if (again) return again.id;
      }
      throw err;
    }
  }
  // No business key — never dedup by mobile/email; create a fresh customer.
  const created = await tx.customer.create({ data: customerData(parsed), select: { id: true } });
  return created.id;
}

function customerData(parsed: ParsedRow) {
  const c = parsed.customer;
  return {
    name: c.name,
    mobile: c.mobile,
    email: c.email,
    type: c.type,
    optOutEmail: c.optOutEmail,
    optOutSms: c.optOutSms,
    optOutPhone: c.optOutPhone,
    optOutWhatsApp: c.optOutWhatsApp,
    externalId: c.externalId,
  };
}

async function getOrCreateVehicle(tx: Db, parsed: ParsedRow, plan: VehiclePlan): Promise<number> {
  if (plan.mode === "existing" && plan.id) return plan.id;
  const v = parsed.vehicle;
  const data = {
    vin: v.vin,
    modelId: plan.modelId,
    modelYear: v.modelYear,
    color: v.color,
    externalId: v.externalId,
  };
  if (v.externalId) {
    await acquireAdvisoryLock(tx, "import_vehicle_ext", v.externalId);
    const found = await tx.vehicle.findUnique({ where: { externalId: v.externalId }, select: { id: true } });
    if (found) return found.id;
  }
  if (v.vin) {
    await acquireAdvisoryLock(tx, "import_vehicle_vin", v.vin);
    const found = await tx.vehicle.findUnique({ where: { vin: v.vin }, select: { id: true } });
    if (found) return found.id;
  }
  try {
    const created = await tx.vehicle.create({ data, select: { id: true } });
    return created.id;
  } catch (err) {
    if (isUniqueViolation(err)) {
      const where = v.externalId ? { externalId: v.externalId } : v.vin ? { vin: v.vin } : null;
      if (where) {
        const again = await tx.vehicle.findUnique({ where, select: { id: true } });
        if (again) return again.id;
      }
    }
    throw err;
  }
}

async function createExperienceIdempotent(
  tx: Db,
  parsed: ParsedRow,
  plan: ExperiencePlan,
  customerId: number,
  vehicleId: number,
): Promise<{ created: boolean; id: number | null }> {
  const e = parsed.experience;
  const data = {
    customerId,
    vehicleId,
    branchId: plan.branchId,
    salespersonId: plan.salespersonId,
    purchaseDate: e.purchaseDate,
    deliveryDate: e.deliveryDate,
    externalSaleId: e.externalSaleId,
    financingType: e.financingType,
    insuranceType: e.insuranceType,
    salesChannel: e.salesChannel,
  };
  if (e.externalSaleId) {
    await acquireAdvisoryLock(tx, "import_sale", e.externalSaleId);
    const found = await tx.purchaseExperience.findUnique({
      where: { externalSaleId: e.externalSaleId },
      select: { id: true },
    });
    if (found) return { created: false, id: found.id };
    try {
      const created = await tx.purchaseExperience.create({ data, select: { id: true } });
      return { created: true, id: created.id };
    } catch (err) {
      if (isUniqueViolation(err)) {
        const again = await tx.purchaseExperience.findUnique({
          where: { externalSaleId: e.externalSaleId },
          select: { id: true },
        });
        if (again) return { created: false, id: again.id };
      }
      throw err;
    }
  }
  const created = await tx.purchaseExperience.create({ data, select: { id: true } });
  return { created: true, id: created.id };
}

/** How an approved master-data record is (re)created at confirm: by ERP `code`
 *  (name defaults to the code) or by business `name` (a unique `code` is minted). */
export interface MasterCreateRef {
  by: "code" | "name";
  value: string;
}

/** Mint a unique internal `code` (the column stays a unique key, no longer
 *  user-facing) for a name-created master-data record. Pre-checks freeness rather
 *  than relying on a P2002 loop so a name-collision never masquerades as a code one. */
async function mintCode(
  prefix: string,
  isTaken: (code: string) => Promise<boolean>,
): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const code = `${prefix}-${randomBytes(4).toString("hex").toUpperCase()}`;
    if (!(await isTaken(code))) return code;
  }
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Idempotently get-or-create a {@link VehicleModel} at confirm, by ERP `code` or by
 * business `name` (globally unique after normalization). Guarded by an advisory
 * lock (on the matching key) + find-before-create + P2002 fallback, so a
 * repeated/retried/concurrent confirm reuses the existing record, never duplicates.
 */
export async function getOrCreateVehicleModel(
  tx: Db,
  ref: MasterCreateRef,
): Promise<{ id: number; name: string }> {
  const select = { id: true, name: true } as const;
  if (ref.by === "code") {
    await acquireAdvisoryLock(tx, "master_model_code", ref.value);
    const found = await tx.vehicleModel.findUnique({ where: { code: ref.value }, select });
    if (found) return found;
    try {
      return await tx.vehicleModel.create({
        data: { code: ref.value, name: ref.value, normalizedName: normalizeName(ref.value) },
        select,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const again = await tx.vehicleModel.findUnique({ where: { code: ref.value }, select });
        if (again) return again;
      }
      throw err;
    }
  }
  const nn = normalizeName(ref.value);
  await acquireAdvisoryLock(tx, "master_model_name", nn);
  const found = await tx.vehicleModel.findFirst({ where: { normalizedName: nn }, select });
  if (found) return found;
  const code = await mintCode("MDL", async (c) =>
    (await tx.vehicleModel.findUnique({ where: { code: c }, select: { id: true } })) !== null,
  );
  try {
    return await tx.vehicleModel.create({ data: { code, name: ref.value, normalizedName: nn }, select });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const again = await tx.vehicleModel.findFirst({ where: { normalizedName: nn }, select });
      if (again) return again;
    }
    throw err;
  }
}

/** Idempotently get-or-create a {@link Branch} at confirm, by ERP `code` or by
 *  business `name` (globally unique after normalization). See getOrCreateVehicleModel. */
export async function getOrCreateBranch(
  tx: Db,
  ref: MasterCreateRef,
): Promise<{ id: number; name: string }> {
  const select = { id: true, name: true } as const;
  if (ref.by === "code") {
    await acquireAdvisoryLock(tx, "master_branch_code", ref.value);
    const found = await tx.branch.findUnique({ where: { code: ref.value }, select });
    if (found) return found;
    try {
      return await tx.branch.create({
        data: { code: ref.value, name: ref.value, normalizedName: normalizeName(ref.value) },
        select,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const again = await tx.branch.findUnique({ where: { code: ref.value }, select });
        if (again) return again;
      }
      throw err;
    }
  }
  const nn = normalizeName(ref.value);
  await acquireAdvisoryLock(tx, "master_branch_name", nn);
  const found = await tx.branch.findFirst({ where: { normalizedName: nn }, select });
  if (found) return found;
  const code = await mintCode("BR", async (c) =>
    (await tx.branch.findUnique({ where: { code: c }, select: { id: true } })) !== null,
  );
  try {
    return await tx.branch.create({ data: { code, name: ref.value, normalizedName: nn }, select });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const again = await tx.branch.findFirst({ where: { normalizedName: nn }, select });
      if (again) return again;
    }
    throw err;
  }
}

/**
 * Idempotently get-or-create a {@link Salesperson} in a resolved branch, matched by
 * (branchId, normalized name) — the logical identity, so the SAME name in two
 * branches yields two people. A unique internal `code` is minted. Guarded by an
 * advisory lock + find-before-create + P2002 fallback (on the composite unique
 * index), so concurrent/repeated rows reuse the record instead of duplicating.
 */
export async function getOrCreateSalesperson(
  tx: Db,
  branchId: number,
  name: string,
): Promise<number> {
  const nn = normalizeName(name);
  await acquireAdvisoryLock(tx, "master_salesperson", `${branchId}:${nn}`);
  const found = await tx.salesperson.findFirst({
    where: { branchId, normalizedName: nn },
    select: { id: true },
  });
  if (found) return found.id;
  const code = await mintCode("SP", async (c) =>
    (await tx.salesperson.findUnique({ where: { code: c }, select: { id: true } })) !== null,
  );
  try {
    const created = await tx.salesperson.create({
      data: { code, name, normalizedName: nn, branchId },
      select: { id: true },
    });
    return created.id;
  } catch (err) {
    if (isUniqueViolation(err)) {
      const again = await tx.salesperson.findFirst({
        where: { branchId, normalizedName: nn },
        select: { id: true },
      });
      if (again) return again.id;
    }
    throw err;
  }
}
