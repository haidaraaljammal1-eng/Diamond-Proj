import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";

export const ImportSourceTypeSchema = z.enum(["CSV", "XLSX"]);

export const ImportJobStatusSchema = z.enum([
  "UPLOADED",
  "MAPPING_REQUIRED",
  "VALIDATING",
  "READY",
  "IMPORTING",
  "COMPLETED",
  "COMPLETED_WITH_ERRORS",
  "FAILED",
  "CANCELLED",
]);

export const ImportRowResultStatusSchema = z.enum([
  "IMPORTED",
  "UPDATED",
  "SKIPPED",
  "FAILED",
  "NEEDS_MANUAL_REVIEW",
]);

/** Public ImportJob projection. `storageKey` is deliberately never exposed. */
export const ImportJobPublicSchema = z.object({
  id: z.number().int(),
  sourceType: ImportSourceTypeSchema,
  originalFileName: z.string(),
  fileHash: z.string().nullable(),
  status: ImportJobStatusSchema,
  mapping: z.record(z.string(), z.string()).nullable(),
  totalRows: z.number().int(),
  validRows: z.number().int(),
  invalidRows: z.number().int(),
  importedRows: z.number().int(),
  updatedRows: z.number().int(),
  skippedRows: z.number().int(),
  failedRows: z.number().int(),
  manualReviewRows: z.number().int(),
  createdById: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type ImportJobPublic = z.infer<typeof ImportJobPublicSchema>;

export const ListImportsQuerySchema = PaginationQuerySchema.extend({
  status: ImportJobStatusSchema.optional(),
  sort: z.string().optional(),
});

// --- Mapping ---

export const ImportFieldSchema = z.object({
  key: z.string(),
  entity: z.enum(["customer", "vehicle", "purchaseExperience"]),
  label: z.string(),
  required: z.boolean(),
  identity: z.boolean(),
  // Technical/advanced field (code + external-id keys) hidden from the default
  // mapping UI; the business-name fields are the promoted path. Absent = shown.
  hidden: z.boolean().optional(),
});

/** Field catalog + this job's file headers + currently-saved mapping. */
export const MappingFieldsSchema = z.object({
  fields: z.array(ImportFieldSchema),
  headers: z.array(z.string()),
  mapping: z.record(z.string(), z.string()).nullable(),
});

export const SaveMappingBodySchema = z.object({
  // { [fileHeader]: targetFieldKey }
  mapping: z.record(z.string(), z.string()),
});

// --- Preview / row issues ---

export const RowIssueSchema = z.object({
  field: z.string().nullable(),
  code: z.string(),
  reason: z.string(),
  message: z.string(),
  suggestedAction: z.string().optional(),
});

export const PreviewRowStatusSchema = z.enum([
  "NEW",
  "SKIPPED",
  "DUPLICATE",
  "CONFLICT",
  "MANUAL_REVIEW",
  "INVALID",
]);

/** How a referenced master-data code resolves during the write-free preview. */
export const MasterRefStatusSchema = z.enum(["existing", "will_create", "needs_review"]);

/** A distinct referenced master-data value and its resolution status. */
export const MasterRefResultSchema = z.object({
  // Stable fold/resolution key (round-tripped in confirm resolutions).
  code: z.string(),
  // How the value was matched, and the verbatim supplied value (for display).
  by: z.enum(["code", "name"]),
  value: z.string(),
  status: MasterRefStatusSchema,
  matchedId: z.number().int().nullable(),
  matchedName: z.string().nullable(),
});

export const PreviewRowSchema = z.object({
  rowNumber: z.number().int(),
  status: PreviewRowStatusSchema,
  // The customer's name — the human-friendly row identity for the preview UI.
  customerName: z.string(),
  // Business keys to locate the row (never sensitive contact PII beyond name).
  externalSaleId: z.string().nullable(),
  externalCustomerId: z.string().nullable(),
  vin: z.string().nullable(),
  // Per-row master-data references (business names) + resolution status (row chips).
  vehicleModelName: z.string().nullable(),
  vehicleModelStatus: MasterRefStatusSchema.nullable(),
  branchName: z.string().nullable(),
  branchStatus: MasterRefStatusSchema.nullable(),
  salespersonName: z.string().nullable(),
  salespersonStatus: MasterRefStatusSchema.nullable(),
  issues: z.array(RowIssueSchema),
});

export const ImportCountsSchema = z.object({
  total: z.number().int(),
  valid: z.number().int(),
  invalid: z.number().int(),
  newRows: z.number().int(),
  existingRows: z.number().int(),
  conflicts: z.number().int(),
  manualReview: z.number().int(),
  duplicates: z.number().int(),
  skipped: z.number().int(),
});
export type ImportCounts = z.infer<typeof ImportCountsSchema>;

/** Deduplicated master-data references across ALL rows (not just the current page). */
export const MasterDataSummarySchema = z.object({
  vehicleModels: z.array(MasterRefResultSchema),
  branches: z.array(MasterRefResultSchema),
  salespeople: z.array(MasterRefResultSchema),
});

export const PreviewSchema = z.object({
  jobId: z.number().int(),
  status: ImportJobStatusSchema,
  counts: ImportCountsSchema,
  masterData: MasterDataSummarySchema,
  rows: z.array(PreviewRowSchema),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

// --- Confirm (approve missing master-data creations / manual links) ---

/**
 * Per-code resolution the user chose in the preview UI. `create` (the default for
 * a `will_create` code) makes a new master-data record; `link` binds the code to
 * an existing record (`targetId`) to avoid a near-duplicate.
 */
export const MasterDataResolutionSchema = z.object({
  code: z.string(),
  action: z.enum(["create", "link"]),
  targetId: z.number().int().positive().optional(),
});

/**
 * A per-row decision for a `MANUAL_REVIEW` (ambiguous-customer) row, applied at
 * confirm time BEFORE the row is written:
 *  - `create_new` — force a separate customer (bypass the ambiguity guard).
 *  - `skip`       — record the row as SKIPPED, write nothing.
 * A decision for a row that is not MANUAL_REVIEW at execution time is ignored.
 */
export const RowDecisionSchema = z.object({
  rowNumber: z.number().int().positive(),
  decision: z.enum(["create_new", "skip"]),
});

export const ConfirmImportBodySchema = z.object({
  resolutions: z
    .object({
      vehicleModels: z.array(MasterDataResolutionSchema).default([]),
      branches: z.array(MasterDataResolutionSchema).default([]),
    })
    .default({ vehicleModels: [], branches: [] }),
  rowDecisions: z.array(RowDecisionSchema).default([]),
});
export type ConfirmImportBody = z.infer<typeof ConfirmImportBodySchema>;

// --- Resolve a single manual-review row (post-confirm) ---

/** Route params for the per-row resolve endpoint (job id + 1-based row number). */
export const ResolveRowParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  rowNumber: z.coerce.number().int().positive(),
});

/**
 * The operator's decision for a `NEEDS_MANUAL_REVIEW` row:
 *  - `merge`      — link the row to an existing customer (`customerId` required).
 *  - `create_new` — force-create a separate customer (bypass the ambiguity guard).
 *  - `skip`       — intentionally ignore the row.
 */
export const ResolveRowBodySchema = z
  .object({
    decision: z.enum(["merge", "create_new", "skip"]),
    customerId: z.number().int().positive().optional(),
  })
  .refine((b) => b.decision !== "merge" || b.customerId != null, {
    message: "customerId is required to merge",
    path: ["customerId"],
  });
export type ResolveRowBody = z.infer<typeof ResolveRowBodySchema>;

// --- Results (post-confirm) ---

export const ResultRowSchema = z.object({
  rowNumber: z.number().int(),
  status: ImportRowResultStatusSchema,
  customerId: z.number().int().nullable(),
  vehicleId: z.number().int().nullable(),
  experienceId: z.number().int().nullable(),
  // Human labels resolved for display (the ids alone read as meaningless "1/2/3").
  customerName: z.string().nullable(),
  // Fallback identity from the SOURCE row for rows that wrote nothing (manual-review
  // / failed): the written customerName is null there, so the operator would otherwise
  // see "—" and could not tell which row they are resolving.
  sourceCustomerName: z.string().nullable(),
  vehicleLabel: z.string().nullable(),
  experienceDeliveryDate: z.date().nullable(),
  issues: z.array(RowIssueSchema),
});

export const ImportResultsSchema = z.object({
  job: ImportJobPublicSchema,
  rows: z.array(ResultRowSchema),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

/** Query for paginated preview / row-issue / result listings. */
export const ImportRowsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
  // Preview only: restrict to rows that have issues.
  onlyIssues: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});
