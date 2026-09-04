import fp from "fastify-plugin";
import multipart from "@fastify/multipart";
import { env } from "src/config/env";

/**
 * Multipart uploads. Hard size limit from env; a single file per request by
 * default. Content validation (magic bytes) happens in the files service — the
 * declared Content-Type is never trusted alone.
 */
export const multipartPlugin = fp(
  async (fastify) => {
    await fastify.register(multipart, {
      limits: {
        fileSize: env.MAX_UPLOAD_SIZE,
        files: 1,
        fields: 10,
      },
    });
  },
  { name: "multipart" },
);
