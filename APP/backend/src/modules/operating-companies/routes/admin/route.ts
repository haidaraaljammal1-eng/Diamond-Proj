import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { NumericIdParam } from "src/lib/http/common-schemas";
import { commonErrorResponses, dataResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";
import { createOperatingCompaniesService } from "src/modules/operating-companies/operating-companies.service";
import {
  ListOperatingCompaniesQuerySchema,
  OperatingCompanySchema,
} from "src/modules/operating-companies/operating-companies.schema";
import { z } from "zod";

/**
 * Reference data for company pickers and filters (UNIQUE / ELITE). Read-only:
 * companies are seeded master data, and retiring one is `isActive = false`.
 */
export default async function operatingCompaniesRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const companies = createOperatingCompaniesService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "List operating companies",
        operationId: "listOperatingCompanies",
        tags: ["Operating companies"],
        // Same reach as the other reference-data lookups: anyone who picks a
        // vehicle or filters the fleet/contracts needs this list.
        permissions: [PERMISSIONS.REFERENCE_DATA_LOOKUP, PERMISSIONS.VEHICLES_READ, PERMISSIONS.CONTRACTS_READ],
        querystring: ListOperatingCompaniesQuerySchema,
        response: {
          200: z.object({ data: z.array(OperatingCompanySchema) }),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({ data: await companies.list(request.query) }),
  );

  app.get(
    "/:id",
    {
      schema: {
        summary: "Get one operating company",
        operationId: "getOperatingCompany",
        tags: ["Operating companies"],
        permissions: [PERMISSIONS.REFERENCE_DATA_LOOKUP, PERMISSIONS.VEHICLES_READ, PERMISSIONS.CONTRACTS_READ],
        params: NumericIdParam,
        response: { 200: dataResponse(OperatingCompanySchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await companies.get(request.params.id) }),
  );
}
