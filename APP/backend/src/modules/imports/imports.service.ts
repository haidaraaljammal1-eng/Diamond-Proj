import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import { Prisma } from "@prisma/client";
import type { ImportJob } from "@prisma/client";
import type { z } from "zod";
import { env } from "src/config/env";
import { t, type Language } from "src/config/i18n";
import { AppError } from "src/lib/errors/app-error";
import { withTransaction } from "src/lib/db/transaction";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { buildPageMeta, paginate, parseSort } from "src/lib/http/pagination";
import { normalizeName } from "src/lib/master-data/code";
import { generateStorageKey, resolveStoragePath } from "src/lib/files/storage-key";
import { IMPORT_FIELDS, IMPORT_FIELD_KEYS } from "src/modules/imports/import-fields";
import {
  duplicateUploadError,
  fileTooLargeError,
  importAlreadyProcessedError,
  importNotReadyError,
  invalidFileTypeError,
  invalidMappingError,
  invalidResolutionTargetError,
  invalidXlsxContentError,
  missingRequiredColumnError,
  rowIssue,
  rowNotResolvableError,
  rowResolutionFailedError,
  ImportErrorReason,
  type RowIssue,
} from "src/modules/imports/imports.errors";
import { CsvParseError, parseCsv, type ParsedTable } from "src/modules/imports/csv-parser";
import { parseXlsx, XlsxParseError } from "src/modules/imports/xlsx-parser";
import { detectAndParseImport } from "src/modules/imports/detect-source";
import { buildFieldExtractor, parseRow, type ColumnMapping } from "src/modules/imports/row-parse";
import {
  evaluateRow,
  executeRow,
  getOrCreateBranch,
  getOrCreateVehicleModel,
  newEvalContext,
  type EvalContext,
  type MasterRefResult,
  type RowEvaluation,
} from "src/modules/imports/row-evaluate";
import type {
  ConfirmImportBody,
  ImportRowsQuerySchema,
  ListImportsQuerySchema,
  SaveMappingBodySchema,
} from "src/modules/imports/imports.schema";

const IMPORT_JOB_SORTABLE = ["createdAt", "status"] as const;

/** Statuses from which a job may still be mapped/validated/cancelled. */
const PRE_IMPORT: ReadonlySet<string> = new Set([
  "UPLOADED",
  "MAPPING_REQUIRED",
  "VALIDATING",
  "READY",
]);

export function createImportsService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function loadOrThrow(id: number) {
    const job = await prisma.importJob.findUnique({ where: { id } });
    if (!job) throw AppError.notFound("Import job not found");
    return job;
  }

  function jobMapping(job: { mapping: Prisma.JsonValue | null }): ColumnMapping | null {
    return (job.mapping as ColumnMapping | null) ?? null;
  }

  /** Map a raw ImportJob row to the public shape (omits storageKey; types mapping). */
  function toPublicJob(job: ImportJob) {
    return {
      id: job.id,
      sourceType: job.sourceType,
      originalFileName: job.originalFileName,
      fileHash: job.fileHash,
      status: job.status,
      mapping: jobMapping(job),
      totalRows: job.totalRows,
      validRows: job.validRows,
      invalidRows: job.invalidRows,
      importedRows: job.importedRows,
      updatedRows: job.updatedRows,
      skippedRows: job.skippedRows,
      failedRows: job.failedRows,
      manualReviewRows: job.manualReviewRows,
      createdById: job.createdById,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  async function readTable(job: {
    storageKey: string;
    sourceType: ImportJob["sourceType"];
  }): Promise<ParsedTable> {
    const bytes = await readFile(resolveStoragePath(env.FILE_STORAGE_DIR, job.storageKey));
    try {
      return job.sourceType === "XLSX" ? await parseXlsx(bytes) : parseCsv(bytes.toString("utf8"));
    } catch (err) {
      // A stored file that no longer parses: an unreadable workbook is a content
      // problem; a bad CSV keeps the generic invalid-type reason.
      if (err instanceof XlsxParseError) throw invalidXlsxContentError();
      if (err instanceof CsvParseError) throw invalidFileTypeError("Import file could not be parsed");
      throw err;
    }
  }

  // --- Upload ---

  /**
   * Read the optional `force` multipart text field (sent BEFORE the file, so it is
   * already parsed when `request.file()` resolves). `force=true` lets the operator
   * bypass the duplicate-upload guard and start a fresh job for an identical file.
   */
  function readForceFlag(file: MultipartFile): boolean {
    const raw = (file.fields as Record<string, unknown> | undefined)?.force;
    const field = Array.isArray(raw) ? raw[0] : raw;
    return (
      !!field &&
      typeof field === "object" &&
      "value" in field &&
      (field as { value: unknown }).value === "true"
    );
  }

  async function createFromUpload(file: MultipartFile, userId: number) {
    const filename = file.filename ?? "upload";
    const force = readForceFlag(file);
    const buffer = await file.toBuffer();
    if (file.file.truncated) throw fileTooLargeError();

    // Content-driven format detection + parse (throws typed invalid-file errors).
    const { sourceType, table } = await detectAndParseImport(filename, file.mimetype, buffer);

    const fileHash = createHash("sha256").update(buffer).digest("hex");
    // Duplicate-upload guard: an identical file that already has a LIVE job blocks a
    // second processing run and points the client at it. FAILED/CANCELLED jobs are
    // terminal-dead and superseded, so an identical file may be re-uploaded. `force`
    // (an explicit operator choice) skips the guard and starts a fresh job anyway.
    if (!force) {
      const dup = await prisma.importJob.findFirst({
        where: { fileHash, status: { notIn: ["FAILED", "CANCELLED"] } },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true },
      });
      if (dup) throw duplicateUploadError(dup.id, dup.status);
    }

    const storageKey = generateStorageKey(filename);
    await mkdir(path.resolve(env.FILE_STORAGE_DIR), { recursive: true });
    await writeFile(resolveStoragePath(env.FILE_STORAGE_DIR, storageKey), buffer);

    const job = await prisma.importJob.create({
      data: {
        sourceType,
        originalFileName: filename,
        storageKey,
        fileHash,
        status: "MAPPING_REQUIRED",
        totalRows: table.rows.length,
        createdById: userId,
      },
    });
    return toPublicJob(job);
  }

  async function get(id: number) {
    return toPublicJob(await loadOrThrow(id));
  }

  async function list(query: z.infer<typeof ListImportsQuerySchema>) {
    const where: Prisma.ImportJobWhereInput = query.status ? { status: query.status } : {};
    const { field, direction } = parseSort(query.sort, IMPORT_JOB_SORTABLE, {
      field: "createdAt",
      direction: "desc",
    });
    return paginate({
      page: query.page,
      pageSize: query.pageSize,
      count: () => prisma.importJob.count({ where }),
      findMany: async (skip, take) => {
        const rows = await prisma.importJob.findMany({
          where,
          orderBy: { [field]: direction } as Prisma.ImportJobOrderByWithRelationInput,
          skip,
          take,
        });
        return rows.map(toPublicJob);
      },
    });
  }

  // --- Mapping ---

  async function mappingFields(id: number, lng: Language = "en") {
    const job = await loadOrThrow(id);
    const table = await readTable(job);
    return {
      // Localize the column-matching option labels to the request language.
      fields: IMPORT_FIELDS.map((f) => ({ ...f, label: t(f.label, { lng }) })),
      headers: table.headers,
      mapping: jobMapping(job),
    };
  }

  /** Validate mapping STRUCTURE (throws) against the file headers. */
  function assertMappingStructure(headers: string[], mapping: ColumnMapping): void {
    const headerSet = new Set(headers);
    const usedFields = new Set<string>();
    for (const [header, fieldKey] of Object.entries(mapping)) {
      if (!headerSet.has(header)) {
        throw invalidMappingError("Mapping references a column not present in the file", { header });
      }
      if (!IMPORT_FIELD_KEYS.includes(fieldKey)) {
        throw invalidMappingError("Mapping references an unknown target field", { fieldKey });
      }
      if (usedFields.has(fieldKey)) {
        throw invalidMappingError("A target field is mapped more than once", { fieldKey });
      }
      usedFields.add(fieldKey);
    }
    // Business name is the promoted mapping contract, but an ERP file may map the
    // technical `code` instead — so branch + vehicle model require EITHER their name
    // OR their code. The missing-column error names the business field.
    const missing: string[] = [];
    if (!usedFields.has("name")) missing.push("name");
    if (!usedFields.has("vehicleModelName") && !usedFields.has("vehicleModelCode")) {
      missing.push("vehicleModelName");
    }
    if (!usedFields.has("branchName") && !usedFields.has("branchCode")) {
      missing.push("branchName");
    }
    if (missing.length > 0) throw missingRequiredColumnError(missing);
  }

  async function saveMapping(id: number, body: z.infer<typeof SaveMappingBodySchema>) {
    const job = await loadOrThrow(id);
    if (!PRE_IMPORT.has(job.status)) throw importAlreadyProcessedError(job.status);
    const table = await readTable(job);
    assertMappingStructure(table.headers, body.mapping);
    const updated = await prisma.importJob.update({
      where: { id },
      data: {
        mapping: body.mapping as Prisma.InputJsonValue,
        // Mapping changed → prior validation is stale; require a re-validate.
        status: "MAPPING_REQUIRED",
        validRows: 0,
        invalidRows: 0,
      },
    });
    return toPublicJob(updated);
  }

  // --- Evaluation (shared, write-free) ---

  interface EvaluatedRow {
    rowNumber: number;
    evaluation: RowEvaluation;
    customerName: string;
    externalSaleId: string | null;
    externalCustomerId: string | null;
    vin: string | null;
  }

  async function evaluateAll(job: {
    storageKey: string;
    sourceType: ImportJob["sourceType"];
    mapping: Prisma.JsonValue | null;
  }): Promise<EvaluatedRow[]> {
    const mapping = jobMapping(job);
    if (!mapping) throw invalidMappingError("Import mapping has not been saved yet");
    const table = await readTable(job);
    assertMappingStructure(table.headers, mapping);
    const extract = buildFieldExtractor(table.headers, mapping);
    const ctx = newEvalContext();
    const out: EvaluatedRow[] = [];
    for (const [i, rawRow] of table.rows.entries()) {
      const fields = extract(rawRow);
      const { row, issues } = parseRow(fields);
      const evaluation = await evaluateRow(prisma, ctx, row, issues);
      out.push({
        rowNumber: i + 1,
        evaluation,
        customerName: row.customer.name,
        externalSaleId: row.experience.externalSaleId,
        externalCustomerId: row.customer.externalId,
        vin: row.vehicle.vin,
      });
    }
    return out;
  }

  function tallyCounts(rows: EvaluatedRow[]) {
    const c = {
      total: rows.length,
      valid: 0,
      invalid: 0,
      newRows: 0,
      existingRows: 0,
      conflicts: 0,
      manualReview: 0,
      duplicates: 0,
      skipped: 0,
    };
    for (const r of rows) {
      switch (r.evaluation.status) {
        case "NEW":
          c.newRows++;
          break;
        case "SKIPPED":
          c.existingRows++;
          break;
        case "DUPLICATE":
          c.duplicates++;
          break;
        case "CONFLICT":
          c.conflicts++;
          break;
        case "MANUAL_REVIEW":
          c.manualReview++;
          break;
        case "INVALID":
          c.invalid++;
          break;
      }
    }
    c.skipped = c.existingRows + c.duplicates;
    c.valid = c.newRows + c.existingRows + c.duplicates;
    // Job-level "invalid" = anything that will not import (bad + conflict + manual).
    c.invalid = c.invalid + c.conflicts + c.manualReview;
    return c;
  }

  // --- Validate ---

  async function validate(id: number) {
    const job = await loadOrThrow(id);
    if (!PRE_IMPORT.has(job.status)) throw importAlreadyProcessedError(job.status);
    const rows = await evaluateAll(job);
    const c = tallyCounts(rows);
    const updated = await prisma.importJob.update({
      where: { id },
      data: {
        status: "READY",
        totalRows: c.total,
        validRows: c.valid,
        invalidRows: c.invalid,
      },
    });
    return toPublicJob(updated);
  }

  // --- Preview / row issues (write nothing) ---

  /**
   * Deduplicate the master-data references across ALL rows into distinct lists
   * (vehicle models, branches, salespeople), so the UI can show "what's new"
   * summary cards and one control per distinct value (not per row). `needs_review`
   * beats `will_create` beats `existing` when the same value appears with mixed
   * statuses — surface the most-blocking classification. Folds on the ref's stable
   * key (normalized code or name; salespeople keyed per branch).
   */
  function buildMasterDataSummary(rows: EvaluatedRow[]) {
    const rank: Record<MasterRefResult["status"], number> = {
      existing: 0,
      will_create: 1,
      needs_review: 2,
    };
    const fold = (pick: (r: EvaluatedRow) => MasterRefResult | null) => {
      const map = new Map<string, MasterRefResult>();
      for (const r of rows) {
        const ref = pick(r);
        if (!ref) continue;
        const prev = map.get(ref.code);
        if (!prev || rank[ref.status] > rank[prev.status]) map.set(ref.code, ref);
      }
      return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
    };
    return {
      vehicleModels: fold((r) => r.evaluation.masterData.vehicleModel),
      branches: fold((r) => r.evaluation.masterData.branch),
      salespeople: fold((r) => r.evaluation.masterData.salesperson),
    };
  }

  async function preview(id: number, query: z.infer<typeof ImportRowsQuerySchema>) {
    const job = await loadOrThrow(id);
    const evaluated = await evaluateAll(job);
    const counts = tallyCounts(evaluated);
    const masterData = buildMasterDataSummary(evaluated);
    const filtered = query.onlyIssues
      ? evaluated.filter((r) => r.evaluation.issues.length > 0 || r.evaluation.status === "CONFLICT")
      : evaluated;
    const total = filtered.length;
    const skip = (query.page - 1) * query.pageSize;
    // Display name for a ref: the matched record's name (existing) or the verbatim
    // supplied value (will_create / needs_review).
    const display = (ref: MasterRefResult | null) => ref?.matchedName ?? ref?.value ?? null;
    const pageRows = filtered.slice(skip, skip + query.pageSize).map((r) => {
      const md = r.evaluation.masterData;
      return {
        rowNumber: r.rowNumber,
        status: r.evaluation.status,
        customerName: r.customerName,
        externalSaleId: r.externalSaleId,
        externalCustomerId: r.externalCustomerId,
        vin: r.vin,
        vehicleModelName: display(md.vehicleModel),
        vehicleModelStatus: md.vehicleModel?.status ?? null,
        branchName: display(md.branch),
        branchStatus: md.branch?.status ?? null,
        salespersonName: display(md.salesperson),
        salespersonStatus: md.salesperson?.status ?? null,
        issues: r.evaluation.issues,
      };
    });
    return {
      jobId: job.id,
      status: job.status,
      counts,
      masterData,
      rows: pageRows,
      meta: buildPageMeta(query.page, query.pageSize, total),
    };
  }

  // --- Confirm (the only write path) ---

  interface MasterDataConfirmResult {
    createdVehicleModels: string[];
    linkedVehicleModels: string[];
    createdBranches: string[];
    linkedBranches: string[];
  }

  /**
   * Act on the user's create/link choices for the master-data codes the preview
   * flagged as new — BEFORE the row loop — and seed `ctx` so row evaluation
   * resolves the resulting ids. Idempotent: `create` uses get-or-create (advisory
   * lock + P2002 fallback), so a retried confirm never duplicates a model/branch.
   * `link` binds a code to an existing active record instead of creating one.
   */
  async function resolveApprovedMasterData(
    job: Parameters<typeof evaluateAll>[0],
    resolutions: ConfirmImportBody["resolutions"],
    ctx: EvalContext,
  ): Promise<MasterDataConfirmResult> {
    const summary = buildMasterDataSummary(await evaluateAll(job));
    // Resolutions are keyed by the ref's stable key (ref.code), verbatim.
    const modelRes = new Map(resolutions.vehicleModels.map((r) => [r.code, r]));
    const branchRes = new Map(resolutions.branches.map((r) => [r.code, r]));
    const result: MasterDataConfirmResult = {
      createdVehicleModels: [],
      linkedVehicleModels: [],
      createdBranches: [],
      linkedBranches: [],
    };

    // Seed the eval context so the row loop resolves the created/linked record —
    // by the SAME cache + key row evaluation looks it up under (code vs name).
    const seedModel = (ref: MasterRefResult, rec: { id: number; name: string }) => {
      const entry = { id: rec.id, isActive: true, name: rec.name };
      if (ref.by === "code") ctx.modelByCode.set(ref.value, entry);
      else ctx.modelByName.set(normalizeName(ref.value), entry);
    };
    const seedBranch = (ref: MasterRefResult, rec: { id: number; name: string }) => {
      const entry = { id: rec.id, isActive: true, name: rec.name };
      if (ref.by === "code") ctx.branchByCode.set(ref.value, entry);
      else ctx.branchByName.set(normalizeName(ref.value), entry);
    };

    for (const ref of summary.vehicleModels) {
      if (ref.status === "existing") continue;
      const res = modelRes.get(ref.code);
      if (res?.action === "link") {
        const target = await assertLinkTarget("vehicleModel", ref.code, res.targetId);
        seedModel(ref, target);
        result.linkedVehicleModels.push(ref.value);
      } else if (ref.status === "will_create") {
        const created = await withTransaction(prisma, (tx) =>
          getOrCreateVehicleModel(tx, { by: ref.by, value: ref.value }),
        );
        seedModel(ref, created);
        result.createdVehicleModels.push(ref.value);
      }
      // needs_review with no explicit link stays unresolved → the row will fail.
    }

    for (const ref of summary.branches) {
      if (ref.status === "existing") continue;
      const res = branchRes.get(ref.code);
      if (res?.action === "link") {
        const target = await assertLinkTarget("branch", ref.code, res.targetId);
        seedBranch(ref, target);
        result.linkedBranches.push(ref.value);
      } else if (ref.status === "will_create") {
        const created = await withTransaction(prisma, (tx) =>
          getOrCreateBranch(tx, { by: ref.by, value: ref.value }),
        );
        seedBranch(ref, created);
        result.createdBranches.push(ref.value);
      }
    }
    // Salespeople are created per-row during the row loop (they need the resolved
    // branchId), so they are not resolved here — the preview still reports them.
    return result;
  }

  async function assertLinkTarget(
    entity: "vehicleModel" | "branch",
    code: string,
    targetId: number | undefined,
  ): Promise<{ id: number; name: string }> {
    if (!targetId) throw invalidResolutionTargetError(entity, code);
    const target =
      entity === "vehicleModel"
        ? await prisma.vehicleModel.findUnique({
            where: { id: targetId },
            select: { id: true, name: true, isActive: true },
          })
        : await prisma.branch.findUnique({
            where: { id: targetId },
            select: { id: true, name: true, isActive: true },
          });
    if (!target || !target.isActive) throw invalidResolutionTargetError(entity, code);
    return { id: target.id, name: target.name };
  }

  async function confirm(id: number, body: ConfirmImportBody | undefined) {
    const resolutions = body?.resolutions ?? { vehicleModels: [], branches: [] };
    // Phase 1 — atomic status guard. Advisory lock serializes concurrent confirms;
    // status gate makes a repeated confirm a no-op error (idempotent job lifecycle).
    await withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLock(tx, "import_job", id);
      const current = await tx.importJob.findUnique({ where: { id }, select: { status: true } });
      if (!current) throw AppError.notFound("Import job not found");
      if (current.status !== "READY") {
        if (PRE_IMPORT.has(current.status)) throw importNotReadyError(current.status);
        throw importAlreadyProcessedError(current.status);
      }
      await tx.importJob.update({ where: { id }, data: { status: "IMPORTING" } });
    });

    const job = await loadOrThrow(id);
    const mapping = jobMapping(job);
    if (!mapping) throw invalidMappingError("Import mapping has not been saved yet");
    const table = await readTable(job);
    assertMappingStructure(table.headers, mapping);
    const extract = buildFieldExtractor(table.headers, mapping);
    const ctx = newEvalContext();

    // Phase 2 — create/link the approved master data and seed the eval context so
    // the row loop resolves the new/linked ids (still write-free per row otherwise).
    // A bad resolution (e.g. link target missing) must NOT strand the job in
    // IMPORTING: reset it to READY so the user can fix the choice and retry.
    let masterDataResult: MasterDataConfirmResult;
    try {
      masterDataResult = await resolveApprovedMasterData(job, resolutions, ctx);
    } catch (err) {
      await prisma.importJob.update({ where: { id }, data: { status: "READY" } });
      throw err;
    }

    const decisionByRow = new Map(
      (body?.rowDecisions ?? []).map((d) => [d.rowNumber, d.decision]),
    );

    const counts = { imported: 0, skipped: 0, failed: 0, manualReview: 0 };

    for (const [i, rawRow] of table.rows.entries()) {
      const rowNumber = i + 1;
      const fields = extract(rawRow);
      const { row, issues: structural } = parseRow(fields);
      try {
        await withTransaction(prisma, async (tx) => {
          const evaluation = await evaluateRow(tx, ctx, row, structural);
          // Pre-execution resolution: override an ambiguous row's plan per the
          // operator's decision (mirrors the single-row resolveRow override).
          const decision =
            evaluation.status === "MANUAL_REVIEW" ? decisionByRow.get(rowNumber) : undefined;
          if (decision === "create_new") {
            evaluation.status = "NEW";
            evaluation.customer = { mode: "create" };
          } else if (decision === "skip") {
            evaluation.status = "SKIPPED";
          }
          const outcome = await applyRow(tx, row, evaluation);
          // A resolved row's ambiguity issue is no longer relevant — record it clean.
          await recordOutcome(tx, id, rowNumber, outcome.status, outcome.ids, decision ? [] : evaluation.issues);
          bumpCounts(counts, outcome.status);
        });
      } catch (err) {
        // Row isolation — a single row failure never leaves the job stuck; record
        // it FAILED in its own tx and continue.
        fastify.log.error({ err, jobId: id, rowNumber }, "import row failed");
        await recordOutcome(prisma, id, rowNumber, "FAILED", {}, [
          rowIssue(null, "row_write_failed", ImportErrorReason.INVALID_ROW, "Row could not be written"),
        ]);
        counts.failed++;
      }
    }

    const finalStatus =
      counts.failed === 0 && counts.manualReview === 0 ? "COMPLETED" : "COMPLETED_WITH_ERRORS";
    const updated = await prisma.importJob.update({
      where: { id },
      data: {
        status: finalStatus,
        importedRows: counts.imported,
        skippedRows: counts.skipped,
        failedRows: counts.failed,
        manualReviewRows: counts.manualReview,
        updatedRows: 0,
      },
    });
    return { job: toPublicJob(updated), masterData: masterDataResult };
  }

  type OutcomeStatus = "IMPORTED" | "UPDATED" | "SKIPPED" | "FAILED" | "NEEDS_MANUAL_REVIEW";

  async function applyRow(
    tx: Prisma.TransactionClient,
    row: Awaited<ReturnType<typeof parseRow>>["row"],
    evaluation: RowEvaluation,
  ): Promise<{ status: OutcomeStatus; ids: { customerId?: number; vehicleId?: number; experienceId?: number | null } }> {
    switch (evaluation.status) {
      case "NEW": {
        const w = await executeRow(tx, row, evaluation);
        return {
          status: w.result,
          ids: { customerId: w.customerId, vehicleId: w.vehicleId, experienceId: w.experienceId },
        };
      }
      case "SKIPPED":
      case "DUPLICATE":
        return { status: "SKIPPED", ids: { experienceId: evaluation.experience?.id ?? null } };
      case "MANUAL_REVIEW":
        return { status: "NEEDS_MANUAL_REVIEW", ids: {} };
      case "CONFLICT":
      case "INVALID":
      default:
        return { status: "FAILED", ids: {} };
    }
  }

  function bumpCounts(
    counts: { imported: number; skipped: number; failed: number; manualReview: number },
    status: OutcomeStatus,
  ) {
    if (status === "IMPORTED" || status === "UPDATED") counts.imported++;
    else if (status === "SKIPPED") counts.skipped++;
    else if (status === "NEEDS_MANUAL_REVIEW") counts.manualReview++;
    else counts.failed++;
  }

  async function recordOutcome(
    db: Prisma.TransactionClient | typeof prisma,
    jobId: number,
    rowNumber: number,
    status: OutcomeStatus,
    ids: { customerId?: number; vehicleId?: number; experienceId?: number | null },
    issues: RowIssue[],
  ) {
    const data = {
      status,
      customerId: ids.customerId ?? null,
      vehicleId: ids.vehicleId ?? null,
      experienceId: ids.experienceId ?? null,
      errors: (issues.length ? issues : []) as unknown as Prisma.InputJsonValue,
    };
    await db.importRowOutcome.upsert({
      where: { jobId_rowNumber: { jobId, rowNumber } },
      update: data,
      create: { jobId, rowNumber, ...data },
    });
  }

  // --- Results (post-confirm) ---

  async function results(id: number, query: z.infer<typeof ImportRowsQuerySchema>) {
    const job = await loadOrThrow(id);
    const where: Prisma.ImportRowOutcomeWhereInput = { jobId: id };
    const { data, meta } = await paginate({
      page: query.page,
      pageSize: query.pageSize,
      count: () => prisma.importRowOutcome.count({ where }),
      findMany: (skip, take) =>
        prisma.importRowOutcome.findMany({
          where,
          orderBy: { rowNumber: "asc" },
          skip,
          take,
        }),
    });
    // Resolve human labels for the written entities. ImportRowOutcome stores plain
    // FK ids (no relations), so batch-load names for the page's rows and map them —
    // the ids alone are meaningless in the UI.
    const idsOf = (pick: (r: (typeof data)[number]) => number | null) =>
      [...new Set(data.map(pick).filter((x): x is number => x != null))];
    const customerIds = idsOf((r) => r.customerId);
    const vehicleIds = idsOf((r) => r.vehicleId);
    const experienceIds = idsOf((r) => r.experienceId);
    const [customers, vehicles, experiences] = await Promise.all([
      customerIds.length
        ? prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true } })
        : [],
      vehicleIds.length
        ? prisma.vehicle.findMany({
            where: { id: { in: vehicleIds } },
            select: { id: true, vin: true, modelYear: true, model: { select: { name: true } } },
          })
        : [],
      experienceIds.length
        ? prisma.purchaseExperience.findMany({ where: { id: { in: experienceIds } }, select: { id: true, deliveryDate: true } })
        : [],
    ]);
    const customerName = new Map(customers.map((c) => [c.id, c.name]));
    const vehicleLabel = new Map(
      vehicles.map((v) => [v.id, [v.model?.name, v.modelYear].filter(Boolean).join(" ") || v.vin]),
    );
    const experienceDate = new Map(experiences.map((e) => [e.id, e.deliveryDate]));

    // Rows that wrote nothing (manual-review / failed) have a null customerId, so the
    // written label above resolves to "—". Re-parse the source file once to recover the
    // customer name from the original cells, so the operator can tell WHICH row they are
    // resolving. Only paid for when the page actually contains such a row.
    const sourceCustomerName = new Map<number, string>();
    if (data.some((r) => r.customerId == null)) {
      const mapping = jobMapping(job);
      if (mapping) {
        const table = await readTable(job);
        const extract = buildFieldExtractor(table.headers, mapping);
        for (const r of data) {
          if (r.customerId != null) continue;
          const raw = table.rows[r.rowNumber - 1];
          if (!raw) continue;
          const { row } = parseRow(extract(raw));
          if (row.customer.name) sourceCustomerName.set(r.rowNumber, row.customer.name);
        }
      }
    }

    return {
      job: toPublicJob(job),
      rows: data.map((r) => ({
        rowNumber: r.rowNumber,
        status: r.status,
        customerId: r.customerId,
        vehicleId: r.vehicleId,
        experienceId: r.experienceId,
        customerName: r.customerId != null ? (customerName.get(r.customerId) ?? null) : null,
        sourceCustomerName: sourceCustomerName.get(r.rowNumber) ?? null,
        vehicleLabel: r.vehicleId != null ? (vehicleLabel.get(r.vehicleId) ?? null) : null,
        experienceDeliveryDate: r.experienceId != null ? (experienceDate.get(r.experienceId) ?? null) : null,
        issues: (r.errors as unknown as RowIssue[] | null) ?? [],
      })),
      meta,
    };
  }

  // --- Resolve a single manual-review row (post-confirm) ---

  /**
   * Recompute the job's outcome counters + terminal status from the authoritative
   * per-row outcomes (the source of truth after any resolve). The job returns to
   * COMPLETED once no row is left FAILED or NEEDS_MANUAL_REVIEW.
   */
  async function recomputeJobOutcome(id: number) {
    const grouped = await prisma.importRowOutcome.groupBy({
      by: ["status"],
      where: { jobId: id },
      _count: { _all: true },
    });
    const countOf = (s: OutcomeStatus) =>
      grouped.find((g) => g.status === s)?._count._all ?? 0;
    const imported = countOf("IMPORTED") + countOf("UPDATED");
    const skipped = countOf("SKIPPED");
    const failed = countOf("FAILED");
    const manualReview = countOf("NEEDS_MANUAL_REVIEW");
    const status =
      failed === 0 && manualReview === 0 ? "COMPLETED" : "COMPLETED_WITH_ERRORS";
    const updated = await prisma.importJob.update({
      where: { id },
      data: {
        status,
        importedRows: imported,
        skippedRows: skipped,
        failedRows: failed,
        manualReviewRows: manualReview,
      },
    });
    return toPublicJob(updated);
  }

  /**
   * Resolve one `NEEDS_MANUAL_REVIEW` row with an explicit operator decision. The
   * source row is re-parsed from disk and re-evaluated, then the customer plan is
   * overridden per the decision and executed (reusing the idempotent {@link executeRow}):
   *  - `merge`      → link the row to `customerId` (an existing customer).
   *  - `create_new` → force a fresh, separate customer (bypasses the ambiguity guard).
   *  - `skip`       → record SKIPPED, write no business data.
   * Only a row currently in NEEDS_MANUAL_REVIEW on a COMPLETED_WITH_ERRORS job is
   * resolvable (idempotent — never resolved twice). Returns the recomputed job.
   */
  async function resolveRow(
    id: number,
    rowNumber: number,
    decision: "merge" | "create_new" | "skip",
    customerId: number | undefined,
  ) {
    const job = await loadOrThrow(id);
    // Review rows only exist while the job is COMPLETED_WITH_ERRORS.
    if (job.status !== "COMPLETED_WITH_ERRORS") throw rowNotResolvableError(job.status);
    const outcome = await prisma.importRowOutcome.findUnique({
      where: { jobId_rowNumber: { jobId: id, rowNumber } },
      select: { status: true },
    });
    if (!outcome || outcome.status !== "NEEDS_MANUAL_REVIEW") {
      throw rowNotResolvableError(outcome?.status ?? "MISSING");
    }
    if (decision === "merge") {
      const target = await prisma.customer.findUnique({
        where: { id: customerId! },
        select: { id: true },
      });
      if (!target) throw invalidResolutionTargetError("customer", String(rowNumber));
    }

    const mapping = jobMapping(job);
    if (!mapping) throw invalidMappingError("Import mapping has not been saved yet");
    const table = await readTable(job);
    const raw = table.rows[rowNumber - 1];
    if (!raw) throw AppError.notFound("Import row not found");
    const extract = buildFieldExtractor(table.headers, mapping);
    const { row, issues: structural } = parseRow(extract(raw));

    if (decision === "skip") {
      await withTransaction(prisma, (tx) => recordOutcome(tx, id, rowNumber, "SKIPPED", {}, []));
    } else {
      try {
        await withTransaction(prisma, async (tx) => {
          const ctx = newEvalContext();
          const evaluation = await evaluateRow(tx, ctx, row, structural);
          // Override the customer decision — the whole point of the resolve.
          evaluation.customer =
            decision === "merge" ? { mode: "existing", id: customerId! } : { mode: "create" };
          const w = await executeRow(tx, row, evaluation);
          await recordOutcome(
            tx,
            id,
            rowNumber,
            w.result,
            { customerId: w.customerId, vehicleId: w.vehicleId, experienceId: w.experienceId },
            [],
          );
        });
      } catch (err) {
        // The row's tx rolled back — it stays NEEDS_MANUAL_REVIEW. Surface a clean,
        // structured failure instead of a 500.
        fastify.log.error({ err, jobId: id, rowNumber }, "import row resolve failed");
        throw rowResolutionFailedError();
      }
    }

    return recomputeJobOutcome(id);
  }

  // --- Cancel ---

  async function cancel(id: number) {
    const job = await loadOrThrow(id);
    if (!PRE_IMPORT.has(job.status)) throw importAlreadyProcessedError(job.status);
    const updated = await prisma.importJob.update({ where: { id }, data: { status: "CANCELLED" } });
    return toPublicJob(updated);
  }

  return {
    createFromUpload,
    get,
    list,
    mappingFields,
    saveMapping,
    validate,
    preview,
    confirm,
    results,
    resolveRow,
    cancel,
  };
}
