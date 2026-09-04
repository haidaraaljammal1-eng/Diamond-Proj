import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createSalespeopleService } from "src/modules/salespeople/salespeople.service";
import {
  CreateSalespersonSchema,
  ListSalespeopleQuerySchema,
  SalespersonPublicSchema,
  UpdateSalespersonSchema,
} from "src/modules/salespeople/salespeople.schema";
import { NumericIdParam } from "src/lib/http/common-schemas";
import { commonErrorResponses, dataResponse, listResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";

export default async function salespeopleRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const salespeople = createSalespeopleService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "List salespeople",
        operationId: "listSalespeople",
        tags: ["Salespeople"],
        permissions: [PERMISSIONS.SALESPEOPLE_READ],
        querystring: ListSalespeopleQuerySchema,
        response: { 200: listResponse(SalespersonPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => salespeople.list(request.query),
  );

  app.get(
    "/:id",
    {
      schema: {
        summary: "Get a salesperson",
        operationId: "getSalesperson",
        tags: ["Salespeople"],
        permissions: [PERMISSIONS.SALESPEOPLE_READ],
        params: NumericIdParam,
        response: { 200: dataResponse(SalespersonPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await salespeople.get(request.params.id) }),
  );

  app.post(
    "/",
    {
      schema: {
        summary: "Create a salesperson",
        operationId: "createSalesperson",
        tags: ["Salespeople"],
        permissions: [PERMISSIONS.SALESPEOPLE_MANAGE],
        body: CreateSalespersonSchema,
        response: { 201: dataResponse(SalespersonPublicSchema), ...commonErrorResponses },
      },
    },
    async (request, reply) => {
      const salesperson = await salespeople.create(request.body);
      request.setAudit({
        action: "salespeople.create",
        entityType: "salesperson",
        entityId: String(salesperson.id),
      });
      reply.status(201);
      return { data: salesperson };
    },
  );

  app.put(
    "/:id",
    {
      schema: {
        summary: "Update a salesperson",
        operationId: "updateSalesperson",
        tags: ["Salespeople"],
        permissions: [PERMISSIONS.SALESPEOPLE_MANAGE],
        params: NumericIdParam,
        body: UpdateSalespersonSchema,
        response: { 200: dataResponse(SalespersonPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const salesperson = await salespeople.update(request.params.id, request.body);
      request.setAudit({
        action: "salespeople.update",
        entityType: "salesperson",
        entityId: String(request.params.id),
      });
      return { data: salesperson };
    },
  );

  app.post(
    "/:id/deactivate",
    {
      schema: {
        summary: "Deactivate a salesperson",
        operationId: "deactivateSalesperson",
        tags: ["Salespeople"],
        permissions: [PERMISSIONS.SALESPEOPLE_MANAGE],
        params: NumericIdParam,
        response: { 200: dataResponse(SalespersonPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const salesperson = await salespeople.setActive(request.params.id, false);
      request.setAudit({
        action: "salespeople.deactivate",
        entityType: "salesperson",
        entityId: String(request.params.id),
      });
      return { data: salesperson };
    },
  );

  app.post(
    "/:id/reactivate",
    {
      schema: {
        summary: "Reactivate a salesperson",
        operationId: "reactivateSalesperson",
        tags: ["Salespeople"],
        permissions: [PERMISSIONS.SALESPEOPLE_MANAGE],
        params: NumericIdParam,
        response: { 200: dataResponse(SalespersonPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const salesperson = await salespeople.setActive(request.params.id, true);
      request.setAudit({
        action: "salespeople.reactivate",
        entityType: "salesperson",
        entityId: String(request.params.id),
      });
      return { data: salesperson };
    },
  );
}
