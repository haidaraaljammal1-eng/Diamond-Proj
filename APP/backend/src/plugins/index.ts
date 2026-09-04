import fp from "fastify-plugin";
import { isDevelopment } from "src/config/env";
import { prismaPlugin } from "src/plugins/prisma";
import { corsPlugin } from "src/plugins/cors";
import { rateLimitPlugin } from "src/plugins/rate-limit";
import { helmetPlugin } from "src/plugins/helmet";
import { bodyParsersPlugin } from "src/plugins/body-parsers";
import { cookiesPlugin } from "src/plugins/cookies";
import { jwtPlugin } from "src/plugins/jwt";
import { multipartPlugin } from "src/plugins/multipart";
import { capabilitiesPlugin } from "src/plugins/capabilities";
import { settingsPlugin } from "src/plugins/settings";
import { mailerPlugin } from "src/plugins/mailer";
import { notificationsPlugin } from "src/plugins/notifications";
import { auditPlugin } from "src/plugins/audit";
import { swaggerPlugin } from "src/plugins/dev/swagger";
import { autoloadPlugin } from "src/plugins/autoload";
import { schedulerPlugin } from "src/plugins/scheduler";

/**
 * Explicit, ordered plugin registration. Infrastructure first, then service
 * decorators, then (dev) OpenAPI, then the audit writer, then routes (autoload
 * must be last so all decorators/hooks are available to route handlers).
 */
export const registerPlugins = fp(async (fastify) => {
  await fastify.register(prismaPlugin);
  await fastify.register(corsPlugin);
  await fastify.register(rateLimitPlugin);
  await fastify.register(helmetPlugin);
  await fastify.register(bodyParsersPlugin);
  await fastify.register(cookiesPlugin);
  await fastify.register(jwtPlugin);
  await fastify.register(multipartPlugin);

  await fastify.register(capabilitiesPlugin);
  await fastify.register(settingsPlugin);
  await fastify.register(mailerPlugin);
  await fastify.register(notificationsPlugin);

  if (isDevelopment || process.env.OPENAPI_EXPORT === "true") {
    await fastify.register(swaggerPlugin);
  }

  await fastify.register(auditPlugin);
  await fastify.register(autoloadPlugin);

  // The automatic distribution flow, driven in-process. Registered last so its
  // onListen hook sees every decorator; starts only when the server listens
  // (never under test inject) — see scheduler.ts.
  await fastify.register(schedulerPlugin);
});
