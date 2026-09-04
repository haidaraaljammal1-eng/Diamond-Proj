import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createFilesService } from "src/modules/files/files.service";
import { AttachmentSchema } from "src/modules/files/files.schema";
import { UuidIdParam } from "src/lib/http/common-schemas";
import {
  commonErrorResponses,
  dataResponse,
  MessageResponseSchema,
} from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";
import { AppError } from "src/lib/errors/app-error";
import { requireAuth } from "src/lib/context/auth-context";
import { t } from "src/config/i18n";

/**
 * Files are private: every route is authenticated + permission-gated. Uploads
 * are content-validated (magic bytes) and stored under a server-generated key;
 * downloads never expose the filesystem path.
 */
export default async function filesRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const files = createFilesService(fastify);

  app.post(
    "/",
    {
      schema: {
        summary: "Upload a file",
        operationId: "uploadFile",
        tags: ["Files"],
        permissions: [PERMISSIONS.FILES_UPLOAD],
        consumes: ["multipart/form-data"],
        response: { 201: dataResponse(AttachmentSchema), ...commonErrorResponses },
      },
    },
    async (request, reply) => {
      const file = await request.file();
      if (!file) throw AppError.validation("Validation failed");
      const attachment = await files.save(file, requireAuth(request).id);
      request.setAudit({
        action: "files.upload",
        entityType: "attachment",
        entityId: attachment.id,
      });
      reply.status(201);
      return { data: attachment };
    },
  );

  app.get(
    "/:id",
    {
      schema: {
        summary: "Download a file",
        operationId: "downloadFile",
        tags: ["Files"],
        permissions: [PERMISSIONS.FILES_READ],
        params: UuidIdParam,
      },
    },
    async (request, reply) => {
      const { attachment, stream } = await files.openDownload(request.params.id);
      reply.header("Content-Type", attachment.mimeType);
      reply.header(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(attachment.originalName)}"`,
      );
      return reply.send(stream);
    },
  );

  app.delete(
    "/:id",
    {
      schema: {
        summary: "Delete a file",
        operationId: "deleteFile",
        tags: ["Files"],
        permissions: [PERMISSIONS.FILES_DELETE],
        params: UuidIdParam,
        response: { 200: MessageResponseSchema, ...commonErrorResponses },
      },
    },
    async (request) => {
      await files.remove(request.params.id);
      request.setAudit({
        action: "files.delete",
        entityType: "attachment",
        entityId: request.params.id,
      });
      return { data: { message: t("Deleted", { lng: request.language }) } };
    },
  );
}
