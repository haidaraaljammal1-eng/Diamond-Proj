import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createDepartmentsService } from "src/modules/departments/departments.service";
import {
  CreateDepartmentSchema,
  DepartmentPublicSchema,
  ListDepartmentsQuerySchema,
  UpdateDepartmentSchema,
} from "src/modules/departments/departments.schema";
import { NumericIdParam } from "src/lib/http/common-schemas";
import { commonErrorResponses, dataResponse, listResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";

export default async function departmentsRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const departments = createDepartmentsService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "List departments",
        operationId: "listDepartments",
        tags: ["Departments"],
        permissions: [PERMISSIONS.DEPARTMENTS_READ],
        querystring: ListDepartmentsQuerySchema,
        response: { 200: listResponse(DepartmentPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => departments.list(request.query),
  );

  app.get(
    "/:id",
    {
      schema: {
        summary: "Get a department",
        operationId: "getDepartment",
        tags: ["Departments"],
        permissions: [PERMISSIONS.DEPARTMENTS_READ],
        params: NumericIdParam,
        response: { 200: dataResponse(DepartmentPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await departments.get(request.params.id) }),
  );

  app.post(
    "/",
    {
      schema: {
        summary: "Create a department",
        operationId: "createDepartment",
        tags: ["Departments"],
        permissions: [PERMISSIONS.DEPARTMENTS_MANAGE],
        body: CreateDepartmentSchema,
        response: { 201: dataResponse(DepartmentPublicSchema), ...commonErrorResponses },
      },
    },
    async (request, reply) => {
      const department = await departments.create(request.body);
      request.setAudit({
        action: "departments.create",
        entityType: "department",
        entityId: String(department.id),
      });
      reply.status(201);
      return { data: department };
    },
  );

  app.put(
    "/:id",
    {
      schema: {
        summary: "Update a department",
        operationId: "updateDepartment",
        tags: ["Departments"],
        permissions: [PERMISSIONS.DEPARTMENTS_MANAGE],
        params: NumericIdParam,
        body: UpdateDepartmentSchema,
        response: { 200: dataResponse(DepartmentPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const department = await departments.update(request.params.id, request.body);
      request.setAudit({
        action: "departments.update",
        entityType: "department",
        entityId: String(request.params.id),
      });
      return { data: department };
    },
  );

  app.post(
    "/:id/deactivate",
    {
      schema: {
        summary: "Deactivate a department",
        operationId: "deactivateDepartment",
        tags: ["Departments"],
        permissions: [PERMISSIONS.DEPARTMENTS_MANAGE],
        params: NumericIdParam,
        response: { 200: dataResponse(DepartmentPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const department = await departments.setActive(request.params.id, false);
      request.setAudit({
        action: "departments.deactivate",
        entityType: "department",
        entityId: String(request.params.id),
      });
      return { data: department };
    },
  );

  app.post(
    "/:id/reactivate",
    {
      schema: {
        summary: "Reactivate a department",
        operationId: "reactivateDepartment",
        tags: ["Departments"],
        permissions: [PERMISSIONS.DEPARTMENTS_MANAGE],
        params: NumericIdParam,
        response: { 200: dataResponse(DepartmentPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const department = await departments.setActive(request.params.id, true);
      request.setAudit({
        action: "departments.reactivate",
        entityType: "department",
        entityId: String(request.params.id),
      });
      return { data: department };
    },
  );
}
