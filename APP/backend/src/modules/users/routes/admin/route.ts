import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createUsersService } from "src/modules/users/users.service";
import {
  AssignBranchesSchema,
  AssignDepartmentsSchema,
  AssignRolesSchema,
  CreateUserResponseSchema,
  CreateUserSchema,
  DepartmentOptionSchema,
  DepartmentOptionsQuerySchema,
  ListUsersQuerySchema,
  ResetUserPasswordSchema,
  UpdateUserSchema,
  UpdateUserStatusSchema,
  UserPublicSchema,
} from "src/modules/users/users.schema";
import { z } from "zod";
import { NumericIdParam } from "src/lib/http/common-schemas";
import {
  commonErrorResponses,
  dataResponse,
  listResponse,
  MessageResponseSchema,
} from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";
import { t } from "src/config/i18n";

export default async function usersRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const users = createUsersService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "List users",
        operationId: "listUsers",
        tags: ["Users"],
        permissions: [PERMISSIONS.USERS_READ],
        querystring: ListUsersQuerySchema,
        response: { 200: listResponse(UserPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => users.list(request.query),
  );

  app.get(
    "/:id",
    {
      schema: {
        summary: "Get a user",
        operationId: "getUser",
        tags: ["Users"],
        permissions: [PERMISSIONS.USERS_READ],
        params: NumericIdParam,
        response: { 200: dataResponse(UserPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await users.get(request.params.id) }),
  );

  // Contextual department picker for the user-assignment form. Any-of the user
  // create/update capability — a user manager does NOT need departments.read (§20).
  // Registered before "/:id" but Fastify matches this static path first regardless.
  app.get(
    "/department-options",
    {
      schema: {
        summary: "Lookup assignable departments (grouped by branch) for user assignment",
        operationId: "userDepartmentOptions",
        tags: ["Users"],
        permissions: [PERMISSIONS.USERS_CREATE, PERMISSIONS.USERS_UPDATE],
        querystring: DepartmentOptionsQuerySchema,
        response: {
          200: dataResponse(z.array(DepartmentOptionSchema)),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({ data: await users.departmentOptions(request.query) }),
  );

  app.post(
    "/",
    {
      schema: {
        summary: "Create a user (issues an account-setup token)",
        operationId: "createUser",
        tags: ["Users"],
        permissions: [PERMISSIONS.USERS_CREATE],
        body: CreateUserSchema,
        response: { 201: CreateUserResponseSchema, ...commonErrorResponses },
      },
    },
    async (request, reply) => {
      const result = await users.create(request.body);
      request.setAudit({
        action: "users.create",
        entityType: "user",
        entityId: String(result.user.id),
      });
      reply.status(201);
      return { data: result };
    },
  );

  app.put(
    "/:id",
    {
      schema: {
        summary: "Update a user",
        operationId: "updateUser",
        tags: ["Users"],
        permissions: [PERMISSIONS.USERS_UPDATE],
        params: NumericIdParam,
        body: UpdateUserSchema,
        response: { 200: dataResponse(UserPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const user = await users.update(request.params.id, request.body);
      request.setAudit({
        action: "users.update",
        entityType: "user",
        entityId: String(request.params.id),
      });
      return { data: user };
    },
  );

  // Admin set/reset a user's password. SEPARATE permission from users.update
  // (§6): profile management does not by itself grant credential control. Body
  // (newPassword/confirmPassword) is never audited/logged; the audit row carries
  // only actor/target/action. Password travels in the body over HTTPS, never a URL.
  app.post(
    "/:id/reset-password",
    {
      schema: {
        summary: "Set or reset a user's password (admin)",
        operationId: "resetUserPassword",
        tags: ["Users"],
        permissions: [PERMISSIONS.USERS_RESET_PASSWORD],
        params: NumericIdParam,
        body: ResetUserPasswordSchema,
        response: { 200: dataResponse(UserPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const user = await users.setPassword(request.params.id, request.body);
      request.setAudit({
        action: "users.reset_password",
        entityType: "user",
        entityId: String(request.params.id),
      });
      return { data: user };
    },
  );

  app.patch(
    "/:id/status",
    {
      schema: {
        summary: "Activate or suspend a user",
        operationId: "setUserStatus",
        tags: ["Users"],
        permissions: [PERMISSIONS.USERS_UPDATE],
        params: NumericIdParam,
        body: UpdateUserStatusSchema,
        response: { 200: dataResponse(UserPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const user = await users.setStatus(request.params.id, request.body.status);
      request.setAudit({
        action: "users.set_status",
        entityType: "user",
        entityId: String(request.params.id),
        metadata: { status: request.body.status },
      });
      return { data: user };
    },
  );

  app.put(
    "/:id/roles",
    {
      schema: {
        summary: "Replace a user's roles",
        operationId: "setUserRoles",
        tags: ["Users"],
        permissions: [PERMISSIONS.USERS_UPDATE],
        params: NumericIdParam,
        body: AssignRolesSchema,
        response: { 200: dataResponse(UserPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const user = await users.setRoles(request.params.id, request.body);
      request.setAudit({
        action: "users.set_roles",
        entityType: "user",
        entityId: String(request.params.id),
      });
      return { data: user };
    },
  );

  app.put(
    "/:id/branches",
    {
      schema: {
        summary: "Replace a user's branch memberships",
        operationId: "setUserBranches",
        tags: ["Users"],
        permissions: [PERMISSIONS.USERS_UPDATE],
        params: NumericIdParam,
        body: AssignBranchesSchema,
        response: { 200: dataResponse(UserPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const user = await users.setBranches(request.params.id, request.body);
      request.setAudit({
        action: "users.set_branches",
        entityType: "user",
        entityId: String(request.params.id),
      });
      return { data: user };
    },
  );

  app.put(
    "/:id/departments",
    {
      schema: {
        summary: "Replace a user's department memberships (branch scope derived)",
        operationId: "setUserDepartments",
        tags: ["Users"],
        permissions: [PERMISSIONS.USERS_UPDATE],
        params: NumericIdParam,
        body: AssignDepartmentsSchema,
        response: { 200: dataResponse(UserPublicSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const user = await users.setDepartments(request.params.id, request.body);
      request.setAudit({
        action: "users.set_departments",
        entityType: "user",
        entityId: String(request.params.id),
      });
      return { data: user };
    },
  );

  app.delete(
    "/:id",
    {
      schema: {
        summary: "Delete a user",
        operationId: "deleteUser",
        tags: ["Users"],
        permissions: [PERMISSIONS.USERS_DELETE],
        params: NumericIdParam,
        response: { 200: MessageResponseSchema, ...commonErrorResponses },
      },
    },
    async (request) => {
      await users.remove(request.params.id);
      request.setAudit({
        action: "users.delete",
        entityType: "user",
        entityId: String(request.params.id),
      });
      return { data: { message: t("Deleted", { lng: request.language }) } };
    },
  );
}
