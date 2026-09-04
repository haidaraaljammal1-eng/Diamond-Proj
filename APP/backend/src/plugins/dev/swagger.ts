import fp from "fastify-plugin";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { jsonSchemaTransform } from "fastify-type-provider-zod";

/**
 * OpenAPI is the source of truth for the API contract and the generated
 * frontend client. Registered in development (and by the openapi:export script).
 * Zod route schemas are converted via jsonSchemaTransform.
 */
export const swaggerPlugin = fp(
  async (fastify) => {
    await fastify.register(swagger, {
      openapi: {
        info: {
          title: "Fastify Enterprise Starter API",
          version: "1.0.0",
          description:
            "Generic, secure backend starter — auth, RBAC, audit, notifications, files, settings.",
        },
        components: {
          securitySchemes: {
            bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
          },
        },
        security: [{ bearerAuth: [] }],
      },
      transform: jsonSchemaTransform,
    });

    await fastify.register(swaggerUi, {
      routePrefix: "/docs",
      uiConfig: { docExpansion: "list", deepLinking: false },
    });
  },
  { name: "swagger" },
);
