import fp from "fastify-plugin";
import helmet from "@fastify/helmet";

/**
 * Security headers. CSP is disabled here because (a) this is a JSON API and
 * (b) a strict CSP would block the dev Swagger UI. For browser-served content,
 * CSP is typically owned by the frontend / reverse proxy (see docs security).
 */
export const helmetPlugin = fp(
  async (fastify) => {
    await fastify.register(helmet, {
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "same-site" },
    });
  },
  { name: "helmet" },
);
