import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createCustomersService } from "src/modules/customers/customers.service";
import {
  CreateCustomerSchema,
  CUSTOMER_CONTACT_FIELDS,
  Customer360Schema,
  CustomerListItemSchema,
  CustomerPublicSchema,
  ListCustomersQuerySchema,
  UpdateCustomerSchema,
} from "src/modules/customers/customers.schema";
import { NumericIdParam } from "src/lib/http/common-schemas";
import { commonErrorResponses, dataResponse, listResponse } from "src/lib/http/response";
import { hasPermission, requireAuth } from "src/lib/context/auth-context";
import { PERMISSIONS } from "src/constants/permissions";

export default async function customersRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const customers = createCustomersService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "List customers",
        operationId: "listCustomers",
        tags: ["Customers"],
        permissions: [PERMISSIONS.CUSTOMERS_READ],
        querystring: ListCustomersQuerySchema,
        response: { 200: listResponse(CustomerListItemSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      // Row enrichment is permission-tiered: only callers who can read the source
      // entity get that slice of the projection (sales ← purchase_experiences.read,
      const auth = requireAuth(request);
      return customers.list(
        request.query,
        {
          canSales: hasPermission(auth, PERMISSIONS.PURCHASE_EXPERIENCES_READ),
        },
        // Branch visibility (customers.view_all_branches ∨ assigned branches) is
        // resolved in the service from this viewer — see customer-scope.ts.
        auth,
      );
    },
  );

  app.get(
    "/:id",
    {
      schema: {
        summary: "Get a customer",
        operationId: "getCustomer",
        tags: ["Customers"],
        permissions: [PERMISSIONS.CUSTOMERS_READ],
        params: NumericIdParam,
        response: { 200: dataResponse(CustomerPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({
      data: await customers.get(request.params.id, requireAuth(request)),
    }),
  );

  app.get(
    "/:id/360",
    {
      schema: {
        summary: "Customer 360 projection",
        operationId: "getCustomer360",
        tags: ["Customers"],
        permissions: [PERMISSIONS.CUSTOMERS_READ],
        params: NumericIdParam,
        response: { 200: dataResponse(Customer360Schema), ...commonErrorResponses },
      },
    },
    async (request) => ({
      data: await customers.customer360(request.params.id, requireAuth(request)),
    }),
  );


  app.post(
    "/",
    {
      schema: {
        summary: "Create a customer",
        operationId: "createCustomer",
        tags: ["Customers"],
        permissions: [PERMISSIONS.CUSTOMERS_MANAGE],
        body: CreateCustomerSchema,
        response: { 201: dataResponse(CustomerPublicSchema), ...commonErrorResponses },
      },
    },
    async (request, reply) => {
      const customer = await customers.create(request.body);
      request.setAudit({
        action: "customers.create",
        entityType: "customer",
        entityId: String(customer.id),
      });
      reply.status(201);
      return { data: customer };
    },
  );

  app.put(
    "/:id",
    {
      schema: {
        summary: "Update a customer",
        operationId: "updateCustomer",
        tags: ["Customers"],
        permissions: [PERMISSIONS.CUSTOMERS_MANAGE],
        params: NumericIdParam,
        body: UpdateCustomerSchema,
        response: { 200: dataResponse(CustomerPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const customer = await customers.update(request.params.id, request.body);
      // Audit sensitive contact changes by FIELD NAME only — never the values.
      const contactFieldsChanged = CUSTOMER_CONTACT_FIELDS.filter(
        (f) => f in request.body,
      );
      request.setAudit({
        action: "customers.update",
        entityType: "customer",
        entityId: String(request.params.id),
        metadata:
          contactFieldsChanged.length > 0 ? { contactFieldsChanged } : undefined,
      });
      return { data: customer };
    },
  );

  app.post(
    "/:id/deactivate",
    {
      schema: {
        summary: "Deactivate a customer",
        operationId: "deactivateCustomer",
        tags: ["Customers"],
        permissions: [PERMISSIONS.CUSTOMERS_MANAGE],
        params: NumericIdParam,
        response: { 200: dataResponse(CustomerPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const customer = await customers.setActive(request.params.id, false);
      request.setAudit({
        action: "customers.deactivate",
        entityType: "customer",
        entityId: String(request.params.id),
      });
      return { data: customer };
    },
  );

  app.post(
    "/:id/reactivate",
    {
      schema: {
        summary: "Reactivate a customer",
        operationId: "reactivateCustomer",
        tags: ["Customers"],
        permissions: [PERMISSIONS.CUSTOMERS_MANAGE],
        params: NumericIdParam,
        response: { 200: dataResponse(CustomerPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const customer = await customers.setActive(request.params.id, true);
      request.setAudit({
        action: "customers.reactivate",
        entityType: "customer",
        entityId: String(request.params.id),
      });
      return { data: customer };
    },
  );
}
