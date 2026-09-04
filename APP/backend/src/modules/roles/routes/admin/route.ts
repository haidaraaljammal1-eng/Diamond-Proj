import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createRolesService } from "src/modules/roles/roles.service";
import {
  CreateRoleSchema,
  ListRolesQuerySchema,
  RolePublicSchema,
  SetRolePermissionsSchema,
  UpdateRoleSchema,
} from "src/modules/roles/roles.schema";
import { NumericIdParam } from "src/lib/http/common-schemas";
import {
  commonErrorResponses,
  dataResponse,
  listResponse,
  MessageResponseSchema,
} from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";
import { t } from "src/config/i18n";

export default async function rolesRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const roles = createRolesService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "List roles",
        operationId: "listRoles",
        tags: ["Roles"],
        permissions: [PERMISSIONS.ROLES_READ],
        querystring: ListRolesQuerySchema,
        response: { 200: listResponse(RolePublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => roles.list(request.query),
  );

  app.get(
    "/:id",
    {
      schema: {
        summary: "Get a role",
        operationId: "getRole",
        tags: ["Roles"],
        permissions: [PERMISSIONS.ROLES_READ],
        params: NumericIdParam,
        response: { 200: dataResponse(RolePublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await roles.get(request.params.id) }),
  );

  app.post(
    "/",
    {
      schema: {
        summary: "Create a role",
        operationId: "createRole",
        tags: ["Roles"],
        permissions: [PERMISSIONS.ROLES_MANAGE],
        body: CreateRoleSchema,
        response: { 201: dataResponse(RolePublicSchema), ...commonErrorResponses },
      },
    },
    async (request, reply) => {
      const role = await roles.create(request.body);
      request.setAudit({
        action: "roles.create",
        entityType: "role",
        entityId: String(role.id),
      });
      reply.status(201);
      return { data: role };
    },
  );

  app.put(
    "/:id",
    {
      schema: {
        summary: "Update a role",
        operationId: "updateRole",
        tags: ["Roles"],
        permissions: [PERMISSIONS.ROLES_MANAGE],
        params: NumericIdParam,
        body: UpdateRoleSchema,
        response: { 200: dataResponse(RolePublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const role = await roles.update(request.params.id, request.body);
      request.setAudit({
        action: "roles.update",
        entityType: "role",
        entityId: String(request.params.id),
      });
      return { data: role };
    },
  );

  app.put(
    "/:id/permissions",
    {
      schema: {
        summary: "Replace a role's permissions",
        operationId: "setRolePermissions",
        tags: ["Roles"],
        permissions: [PERMISSIONS.ROLES_MANAGE],
        params: NumericIdParam,
        body: SetRolePermissionsSchema,
        response: { 200: dataResponse(RolePublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const role = await roles.setPermissions(request.params.id, request.body);
      request.setAudit({
        action: "roles.set_permissions",
        entityType: "role",
        entityId: String(request.params.id),
      });
      return { data: role };
    },
  );

  app.delete(
    "/:id",
    {
      schema: {
        summary: "Delete a role",
        operationId: "deleteRole",
        tags: ["Roles"],
        permissions: [PERMISSIONS.ROLES_MANAGE],
        params: NumericIdParam,
        response: { 200: MessageResponseSchema, ...commonErrorResponses },
      },
    },
    async (request) => {
      await roles.remove(request.params.id);
      request.setAudit({
        action: "roles.delete",
        entityType: "role",
        entityId: String(request.params.id),
      });
      return { data: { message: t("Deleted", { lng: request.language }) } };
    },
  );
}
