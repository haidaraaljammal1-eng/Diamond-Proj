import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { PERMISSIONS } from "src/constants/permissions";
import { commonErrorResponses, dataResponse } from "src/lib/http/response";
import { archiveExportFilename } from "src/modules/archive/archive-export.constants";
import { createArchiveExportService } from "src/modules/archive/archive-export.service";
import { createArchiveService } from "src/modules/archive/archive.service";
import {
  ArchiveRowIdParam,
  ArchiveRowSchema,
  ArchiveVehicleIdParam,
  ArchiveVehicleSchema,
  CreateArchiveRowSchema,
  UpdateArchiveRowSchema,
} from "src/modules/archive/archive.schema";

const T = ["Archive"];

export default async function archiveRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const archive = createArchiveService(fastify);
  const archiveExport = createArchiveExportService(fastify);

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
