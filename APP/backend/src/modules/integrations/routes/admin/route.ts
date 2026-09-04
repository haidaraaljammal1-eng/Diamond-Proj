import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { commonErrorResponses, dataResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";
import { createIntegrationConfigService } from "src/modules/integrations/integration-config.service";
import {
  SaveConfigSchema,
  KindParamsSchema,
  SendTestSchema,
  IntegrationDtoSchema,
  TestResultDtoSchema,
} from "src/modules/integrations/integration-config.schema";

const T = ["Integrations"];

/** Mounts under /integrations. Fixed 5-kind catalog (EMAIL, WHATSAPP, SMS,
 *  SSO_ACTIVE_DIRECTORY, POWER_BI) — replaces the legacy free-form/numeric-id
 *  integration registry. Non-secret config + encrypted secrets live per-kind;
 *  secrets never leave this boundary unmasked (see integration-config.service). */
export default async function integrationsRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const svc = createIntegrationConfigService(fastify);
  const P = PERMISSIONS;

  app.get(
    "/",
    {
      schema: {
        summary: "List the fixed integration catalog",
        operationId: "listIntegrations",
        tags: T,
        permissions: [P.INTEGRATIONS_READ],
        response: { 200: dataResponse(z.array(IntegrationDtoSchema)), ...commonErrorResponses },
      },
    },
    async () => ({ data: await svc.listCatalog() }),
  );

  app.post(
    "/:kind/config",
    {
      schema: {
        summary: "Save an integration's config + secrets",
        operationId: "saveIntegrationConfig",
        tags: T,
        permissions: [P.INTEGRATIONS_MANAGE],
        params: KindParamsSchema,
        body: SaveConfigSchema,
        response: { 200: dataResponse(IntegrationDtoSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const { kind } = request.params;
      const body = request.body;
      const dto = await svc.saveConfig(kind, body);
      request.setAudit({
        action: "integrations.config.save",
        entityType: "integration",
        entityId: kind,
        metadata: {
          kind,
          configKeys: Object.keys(body.config ?? {}),
          secretProvided: Object.fromEntries(Object.keys(body.secrets ?? {}).map((k) => [k, (body.secrets[k] ?? "") !== ""])),
        },
      });
      return { data: dto };
    },
  );

  app.post(
    "/:kind/test-connection",
    {
      schema: {
        summary: "Test an integration's live connection",
        operationId: "integrationTestConnection",
        tags: T,
        permissions: [P.INTEGRATIONS_MANAGE],
        params: KindParamsSchema,
        response: { 200: dataResponse(TestResultDtoSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const { kind } = request.params;
      const result = await svc.testConnection(kind);
      request.setAudit({
        action: "integrations.test",
        entityType: "integration",
        entityId: kind,
        metadata: { kind, result: result.status, code: result.code },
      });
      return { data: result };
    },
  );

  app.post(
    "/:kind/send-test",
    {
      schema: {
        summary: "Send a real test message through an integration",
        operationId: "integrationSendTest",
        tags: T,
        permissions: [P.INTEGRATIONS_MANAGE],
        params: KindParamsSchema,
        body: SendTestSchema,
        response: { 200: dataResponse(TestResultDtoSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const { kind } = request.params;
      const target = request.body;
      const result = await svc.sendTest(kind, target);
      // Audit the outcome only — never the recipient or message body (PII/secret-safe).
      request.setAudit({
        action: "integrations.send-test",
        entityType: "integration",
        entityId: kind,
        metadata: { kind, result: result.status, code: result.code },
      });
      return { data: result };
    },
  );
}
