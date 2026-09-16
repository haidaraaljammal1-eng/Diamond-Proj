import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { commonErrorResponses, dataResponse } from "src/lib/http/response";
import { requireAuth } from "src/lib/context/auth-context";
import { PERMISSIONS } from "src/constants/permissions";
import { createDashboardService } from "src/modules/dashboard/dashboard.service";
import { DashboardOverviewSchema } from "src/modules/dashboard/dashboard.schema";

const T = ["Dashboard"];

/** Mounts under /dashboard. */
export default async function dashboardRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const svc = createDashboardService(fastify);

  app.get("/overview", {
    schema: {
      summary: "Home dashboard overview (last 7 days, permission-gated)",
      operationId: "getDashboardOverview",
      tags: T,
      permissions: [PERMISSIONS.DASHBOARD_READ],
      response: { 200: dataResponse(DashboardOverviewSchema), ...commonErrorResponses },
    },
  }, async (request) => ({ data: await svc.overview(requireAuth(request)) }));
}
