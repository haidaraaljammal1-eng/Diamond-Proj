import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { loggerOptions } from "src/config/logger";
import { resolveLanguage } from "src/config/i18n";
import { env } from "src/config/env";
import { registerPlugins } from "src/plugins";
import { globalErrorHandler } from "src/lib/errors/error-handler";
import { notFoundHandler } from "src/lib/errors/not-found-handler";

/**
 * Build the Fastify instance. Kept separate from server.ts so tests can build
 * the app and use `.inject()` without opening a socket.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions,
    genReqId: () => randomUUID(),
    trustProxy: true,
    bodyLimit: env.MAX_UPLOAD_SIZE,
    // Cold boot under tsx transpiles every module on first import (~8–9s on a cold
    // process); the compiled prod build boots in well under a second. Give avvio a
    // generous ceiling so a slow cold start never trips the plugin-timeout guard —
    // a genuinely hung plugin still surfaces via the caller's own timeout.
    pluginTimeout: 60_000,
    routerOptions: {
      ignoreTrailingSlash: true,
      maxParamLength: 500,
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Resolve request language early for localized error messages.
  app.addHook("onRequest", async (request) => {
    request.language = resolveLanguage(request.headers["accept-language"]);
  });

  app.setErrorHandler(globalErrorHandler);
  app.setNotFoundHandler(notFoundHandler);

  // Root liveness probe. The deploy platform's health check curls GET "/" (not
  // "/health"); without a 200 here the container is marked unhealthy and rolled
  // back. Registered on the root instance — outside the autoload access-level
  // scopes — so no auth/permission hook applies. No DB, no secrets exposed.
  app.get("/", async () => ({ data: { status: "ok" } }));

  await app.register(registerPlugins);
  await app.ready();
  return app;
}
