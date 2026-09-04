import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { commonErrorResponses, dataResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";
import { createReportSecurityService } from "src/modules/reports/report-security.service";
import { SecurityPostureSchema } from "src/modules/reports/reports.schema";

const T = ["Security"];

/** Mounts under /security. Effective posture only — no fake compliance/hosting claims. */
export default async function securityRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const svc = createReportSecurityService(fastify);

  app.get("/posture", { schema: { summary: "Security posture", operationId: "getSecurityPosture", tags: T, permissions: [PERMISSIONS.SECURITY_POSTURE_READ], response: { 200: dataResponse(SecurityPostureSchema), ...commonErrorResponses } } },
    async () => ({ data: await svc.posture() }));
}
