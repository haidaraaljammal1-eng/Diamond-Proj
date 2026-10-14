import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { PERMISSIONS } from "src/constants/permissions";
import { AppError } from "src/lib/errors/app-error";
import { commonErrorResponses, dataResponse } from "src/lib/http/response";
import { archiveExportFilename } from "src/modules/archive/archive-export.constants";
import { createArchiveExportService } from "src/modules/archive/archive-export.service";
import { createArchiveImportService } from "src/modules/archive/archive-import.service";
import {
  ArchiveImportConfirmBodySchema,
  ArchiveImportConfirmResultSchema,
  ArchiveImportPreviewSchema,
} from "src/modules/archive/archive-import.schema";
import { createArchiveSyncService } from "src/modules/archive/archive-sync.service";
import {
  ArchiveSyncResultSchema,
  ArchiveSyncStatusSchema,
} from "src/modules/archive/archive-sync.schema";
import { createArchiveRestoreAutoService } from "src/modules/archive/archive-restore-auto";
import { createArchiveService } from "src/modules/archive/archive.service";
import { requireAuth } from "src/lib/context/auth-context";
import {
  ArchiveRowIdParam,
  ArchiveRowSchema,
  ArchiveVehicleIdParam,
  ArchiveVehicleSchema,
  CreateArchiveRowSchema,
  RestoreArchiveChargeFieldSchema,
  UpdateArchiveRowSchema,
} from "src/modules/archive/archive.schema";

const T = ["Archive"];

export default async function archiveRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const archive = createArchiveService(fastify);
  const archiveRestore = createArchiveRestoreAutoService(fastify);
  const archiveExport = createArchiveExportService(fastify);
  const archiveImport = createArchiveImportService(fastify);
  const archiveSync = createArchiveSyncService(fastify);

  app.post(
    "/import/preview",
    {
      schema: {
        summary: "Parse and preview a Diamond Archive XLSX import",
        operationId: "previewArchiveImport",
        tags: T,
        permissions: [PERMISSIONS.ARCHIVE_MANAGE],
        consumes: ["multipart/form-data"],
        response: {
          200: dataResponse(ArchiveImportPreviewSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const file = await request.file();
      if (!file) throw AppError.validation("Validation failed");
      const auth = requireAuth(request);
      const preview = await archiveImport.previewUpload(file, auth.id);
      return { data: preview };
    },
  );

  app.post(
    "/import/confirm",
    {
      schema: {
        summary: "Confirm a validated Diamond Archive import",
        operationId: "confirmArchiveImport",
        tags: T,
        permissions: [PERMISSIONS.ARCHIVE_MANAGE],
        body: ArchiveImportConfirmBodySchema,
        response: {
          200: dataResponse(ArchiveImportConfirmResultSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const auth = requireAuth(request);
      const result = await archiveImport.confirmImport(request.body.importToken, auth.id);
      request.setAudit({
        action: "archive.import",
        entityType: "archive",
        metadata: {
          filename: result.filename,
          matchedVehicleCount: result.matchedVehicleCount,
          importedRowCount: result.importedRowCount,
        },
      });
      return { data: result };
    },
  );

  app.get(
    "/sync/status",
    {
      schema: {
        summary: "Archive pull-sync status",
        operationId: "getArchiveSyncStatus",
        tags: T,
        permissions: [PERMISSIONS.ARCHIVE_MANAGE],
        response: {
          200: dataResponse(ArchiveSyncStatusSchema),
          ...commonErrorResponses,
        },
      },
    },
    async () => ({ data: await archiveSync.getStatus() }),
  );

  app.post(
    "/sync",
    {
      schema: {
        summary: "Pull-sync archive rows from contracts and related sources",
        operationId: "syncArchive",
        tags: T,
        permissions: [PERMISSIONS.ARCHIVE_MANAGE],
        response: {
          200: dataResponse(ArchiveSyncResultSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const auth = requireAuth(request);
      const result = await archiveSync.runSync(auth.id);
      request.setAudit({
        action: "archive.sync",
        entityType: "archive",
        metadata: {
          created: result.created,
          updated: result.updated,
          unchanged: result.unchanged,
          failed: result.failed,
        },
      });
      return { data: result };
    },
  );

  app.get(
    "/export",
    {
      schema: {
        summary: "Export archive workbook for all current fleet vehicles (XLSX)",
        operationId: "exportArchiveWorkbook",
        tags: T,
        permissions: [PERMISSIONS.ARCHIVE_READ],
      },
    },
    async (request, reply) => {
      const buffer = await archiveExport.exportWorkbook();
      const filename = archiveExportFilename();
      request.setAudit({
        action: "archive.export",
        entityType: "archive",
        metadata: { filename },
      });
      reply
        .header(
          "content-type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        .header("content-disposition", `attachment; filename="${filename}"`);
      return reply.send(buffer);
    },
  );

  app.get(
    "/vehicles",
    {
      schema: {
        summary: "List fleet vehicles for archive selection",
        operationId: "listArchiveVehicles",
        tags: T,
        permissions: [PERMISSIONS.ARCHIVE_READ],
        response: {
          200: dataResponse(ArchiveVehicleSchema.array()),
          ...commonErrorResponses,
        },
      },
    },
    async () => ({ data: await archive.listFleetVehicles() }),
  );

  app.get(
    "/vehicles/:vehicleId/rows",
    {
      schema: {
        summary: "List archive rows for a vehicle",
        operationId: "listArchiveRows",
        tags: T,
        permissions: [PERMISSIONS.ARCHIVE_READ],
        params: ArchiveVehicleIdParam,
        response: {
          200: dataResponse(ArchiveRowSchema.array()),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({ data: await archive.listRows(request.params.vehicleId) }),
  );

  app.post(
    "/vehicles/:vehicleId/rows",
    {
      schema: {
        summary: "Create an empty archive row for a vehicle",
        operationId: "createArchiveRow",
        tags: T,
        permissions: [PERMISSIONS.ARCHIVE_MANAGE],
        params: ArchiveVehicleIdParam,
        body: CreateArchiveRowSchema,
        response: {
          201: dataResponse(ArchiveRowSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const row = await archive.createRow(request.params.vehicleId, request.body);
      request.setAudit({
        action: "archive.row.create",
        entityType: "archive_row",
        entityId: String(row.id),
        metadata: { vehicleId: row.vehicleId, rowOrder: row.rowOrder },
      });
      reply.status(201);
      return { data: row };
    },
  );

  app.patch(
    "/rows/:rowId",
    {
      schema: {
        summary: "Partially update an archive row",
        operationId: "updateArchiveRow",
        tags: T,
        permissions: [PERMISSIONS.ARCHIVE_MANAGE],
        params: ArchiveRowIdParam,
        body: UpdateArchiveRowSchema,
        response: {
          200: dataResponse(ArchiveRowSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const row = await archive.updateRow(request.params.rowId, request.body);
      request.setAudit({
        action: "archive.row.update",
        entityType: "archive_row",
        entityId: String(row.id),
        metadata: { vehicleId: row.vehicleId },
      });
      return { data: row };
    },
  );

  app.post(
    "/rows/:rowId/restore-auto",
    {
      schema: {
        summary: "Restore one charge field to automatic (pull-sync) value",
        operationId: "restoreArchiveChargeField",
        tags: T,
        permissions: [PERMISSIONS.ARCHIVE_MANAGE],
        params: ArchiveRowIdParam,
        body: RestoreArchiveChargeFieldSchema,
        response: {
          200: dataResponse(ArchiveRowSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const row = await archiveRestore.restoreChargeFieldToAuto(
        request.params.rowId,
        request.body.field,
      );
      request.setAudit({
        action: "archive.row.restore_auto",
        entityType: "archive_row",
        entityId: String(row.id),
        metadata: { field: request.body.field },
      });
      return { data: row };
    },
  );

  app.delete(
    "/rows/:rowId",
    {
      schema: {
        summary: "Delete an archive row",
        operationId: "deleteArchiveRow",
        tags: T,
        permissions: [PERMISSIONS.ARCHIVE_MANAGE],
        params: ArchiveRowIdParam,
        response: {
          204: { type: "null", description: "Deleted" },
          ...commonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      await archive.deleteRow(request.params.rowId);
      request.setAudit({
        action: "archive.row.delete",
        entityType: "archive_row",
        entityId: String(request.params.rowId),
      });
      reply.status(204);
    },
  );
}
