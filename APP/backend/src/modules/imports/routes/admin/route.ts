import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { AppError } from "src/lib/errors/app-error";
import { requireAuth } from "src/lib/context/auth-context";
import { NumericIdParam } from "src/lib/http/common-schemas";
import { commonErrorResponses, dataResponse, listResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";
import { createImportsService } from "src/modules/imports/imports.service";
import {
  ConfirmImportBodySchema,
  ImportJobPublicSchema,
  ImportResultsSchema,
  ImportRowsQuerySchema,
  ListImportsQuerySchema,
  MappingFieldsSchema,
  PreviewSchema,
  ResolveRowBodySchema,
  ResolveRowParamsSchema,
  SaveMappingBodySchema,
} from "src/modules/imports/imports.schema";

export default async function importsRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const imports = createImportsService(fastify);

  // --- Upload (create job) ---
  app.post(
    "/",
    {
      schema: {
        summary: "Upload a data file and create an import job",
        operationId: "createImportJob",
        tags: ["Imports"],
        permissions: [PERMISSIONS.IMPORTS_MANAGE],
        consumes: ["multipart/form-data"],
        response: { 201: dataResponse(ImportJobPublicSchema), ...commonErrorResponses },
      },
    },
    async (request, reply) => {
      const file = await request.file();
      if (!file) throw AppError.validation("A file is required");
      const job = await imports.createFromUpload(file, requireAuth(request).id);
      request.setAudit({
        action: "imports.create",
        entityType: "import_job",
        entityId: String(job.id),
        metadata: { importJobId: job.id, sourceType: job.sourceType, totalRows: job.totalRows },
      });
      reply.status(201);
      return { data: job };
    },
  );

  // --- List / get ---
  app.get(
    "/",
    {
      schema: {
        summary: "List import jobs",
        operationId: "listImportJobs",
        tags: ["Imports"],
        permissions: [PERMISSIONS.IMPORTS_READ],
        querystring: ListImportsQuerySchema,
        response: { 200: listResponse(ImportJobPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => imports.list(request.query),
  );

  app.get(
    "/:id",
    {
      schema: {
        summary: "Get an import job",
        operationId: "getImportJob",
        tags: ["Imports"],
        permissions: [PERMISSIONS.IMPORTS_READ],
        params: NumericIdParam,
        response: { 200: dataResponse(ImportJobPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await imports.get(request.params.id) }),
  );

  // --- Mapping ---
  app.get(
    "/:id/mapping",
    {
      schema: {
        summary: "Get import mapping fields, file headers and saved mapping",
        operationId: "getImportMapping",
        tags: ["Imports"],
        permissions: [PERMISSIONS.IMPORTS_READ],
        params: NumericIdParam,
        response: { 200: dataResponse(MappingFieldsSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await imports.mappingFields(request.params.id, request.language) }),
  );

  app.put(
    "/:id/mapping",
    {
      schema: {
        summary: "Save/update the column→field mapping",
        operationId: "saveImportMapping",
        tags: ["Imports"],
        permissions: [PERMISSIONS.IMPORTS_MANAGE],
        params: NumericIdParam,
        body: SaveMappingBodySchema,
        response: { 200: dataResponse(ImportJobPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const job = await imports.saveMapping(request.params.id, request.body);
      request.setAudit({
        action: "imports.mapping_saved",
        entityType: "import_job",
        entityId: String(request.params.id),
        metadata: { importJobId: request.params.id },
      });
      return { data: job };
    },
  );

  // --- Validate ---
  app.post(
    "/:id/validate",
    {
      schema: {
        summary: "Validate rows and compute counts (writes no business data)",
        operationId: "validateImportJob",
        tags: ["Imports"],
        permissions: [PERMISSIONS.IMPORTS_MANAGE],
        params: NumericIdParam,
        response: { 200: dataResponse(ImportJobPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const job = await imports.validate(request.params.id);
      request.setAudit({
        action: "imports.validated",
        entityType: "import_job",
        entityId: String(request.params.id),
        metadata: {
          importJobId: request.params.id,
          totalRows: job.totalRows,
          validRows: job.validRows,
          invalidRows: job.invalidRows,
        },
      });
      return { data: job };
    },
  );

  // --- Preview / row issues (read-only, write nothing) ---
  app.get(
    "/:id/preview",
    {
      schema: {
        summary: "Preview per-row classification + counts (writes nothing)",
        operationId: "getImportPreview",
        tags: ["Imports"],
        permissions: [PERMISSIONS.IMPORTS_READ],
        params: NumericIdParam,
        querystring: ImportRowsQuerySchema,
        response: { 200: dataResponse(PreviewSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await imports.preview(request.params.id, request.query) }),
  );

  app.get(
    "/:id/issues",
    {
      schema: {
        summary: "List only the rows that have issues/conflicts",
        operationId: "getImportRowIssues",
        tags: ["Imports"],
        permissions: [PERMISSIONS.IMPORTS_READ],
        params: NumericIdParam,
        querystring: ImportRowsQuerySchema,
        response: { 200: dataResponse(PreviewSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({
      data: await imports.preview(request.params.id, { ...request.query, onlyIssues: true }),
    }),
  );

  // --- Confirm (the only write path) ---
  app.post(
    "/:id/confirm",
    {
      schema: {
        summary: "Confirm and execute the import (creates Customer/Vehicle/Experience)",
        description:
          "Optionally approves creation of, or links, the new master-data codes (vehicle models / branches) surfaced during preview. This is the only step that writes.",
        operationId: "confirmImportJob",
        tags: ["Imports"],
        permissions: [PERMISSIONS.IMPORTS_MANAGE],
        params: NumericIdParam,
        body: ConfirmImportBodySchema,
        response: { 200: dataResponse(ImportJobPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const { job, masterData } = await imports.confirm(request.params.id, request.body);
      request.setAudit({
        action: "imports.confirm",
        entityType: "import_job",
        entityId: String(request.params.id),
        metadata: {
          importJobId: request.params.id,
          sourceType: job.sourceType,
          status: job.status,
          importedRows: job.importedRows,
          skippedRows: job.skippedRows,
          failedRows: job.failedRows,
          manualReviewRows: job.manualReviewRows,
          // Master-data audit trail (codes only — no PII).
          masterDataCreatedVehicleModels: masterData.createdVehicleModels,
          masterDataLinkedVehicleModels: masterData.linkedVehicleModels,
          masterDataCreatedBranches: masterData.createdBranches,
          masterDataLinkedBranches: masterData.linkedBranches,
        },
      });
      return { data: job };
    },
  );

  // --- Results (post-confirm) ---
  app.get(
    "/:id/results",
    {
      schema: {
        summary: "Get the final per-row import results",
        operationId: "getImportResults",
        tags: ["Imports"],
        permissions: [PERMISSIONS.IMPORTS_READ],
        params: NumericIdParam,
        querystring: ImportRowsQuerySchema,
        response: { 200: dataResponse(ImportResultsSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await imports.results(request.params.id, request.query) }),
  );

  // --- Resolve a single manual-review row (post-confirm write) ---
  app.post(
    "/:id/rows/:rowNumber/resolve",
    {
      schema: {
        summary: "Resolve a manual-review row (merge / create new / skip)",
        description:
          "Resolves a single NEEDS_MANUAL_REVIEW row: merge it into an existing customer, force-create a separate customer, or skip it. Re-executes the row and recomputes the job outcome.",
        operationId: "resolveImportRow",
        tags: ["Imports"],
        permissions: [PERMISSIONS.IMPORTS_MANAGE],
        params: ResolveRowParamsSchema,
        body: ResolveRowBodySchema,
        response: { 200: dataResponse(ImportJobPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const { id, rowNumber } = request.params;
      const { decision, customerId } = request.body;
      const job = await imports.resolveRow(id, rowNumber, decision, customerId);
      request.setAudit({
        action: "imports.resolve_row",
        entityType: "import_job",
        entityId: String(id),
        metadata: {
          importJobId: id,
          rowNumber,
          decision,
          customerId: customerId ?? null,
          status: job.status,
        },
      });
      return { data: job };
    },
  );

  // --- Cancel ---
  app.post(
    "/:id/cancel",
    {
      schema: {
        summary: "Cancel an import job before it is confirmed",
        operationId: "cancelImportJob",
        tags: ["Imports"],
        permissions: [PERMISSIONS.IMPORTS_MANAGE],
        params: NumericIdParam,
        response: { 200: dataResponse(ImportJobPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const job = await imports.cancel(request.params.id);
      request.setAudit({
        action: "imports.cancel",
        entityType: "import_job",
        entityId: String(request.params.id),
        metadata: { importJobId: request.params.id },
      });
      return { data: job };
    },
  );
}
