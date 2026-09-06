import { apiRequest } from "@/infrastructure/api/client";
import type {
  CreateUserPayload,
  CreateUserResult,
  UserDto,
  UserStatus,
  UsersListQuery,
} from "../types/user.types";
import { parsePageMeta, USERS_MAX_PAGE_SIZE } from "./users.api.types";
import type { PageMeta } from "./users.api.types";

const USERS_PATH = "/users";

function buildQuery(params: UsersListQuery): string {
  const search = new URLSearchParams();
  search.set("page", String(params.page ?? 1));
  search.set("pageSize", String(params.pageSize ?? USERS_MAX_PAGE_SIZE));
  if (params.search?.trim()) search.set("search", params.search.trim());
  if (params.status) search.set("status", params.status);
  if (params.sort) search.set("sort", params.sort);
  return search.toString();
}

/** `GET /users` (Backend permission: `users.read`). */
export async function listUsers(
  params: UsersListQuery = {},
): Promise<{ data: UserDto[]; meta: PageMeta | null }> {
  const response = await apiRequest<UserDto[]>(
    `${USERS_PATH}?${buildQuery(params)}`,
  );
  return { data: response.data, meta: parsePageMeta(response.meta) };
}

/** `POST /users` (Backend permission: `users.create`). */
export async function createUser(
  payload: CreateUserPayload,
): Promise<CreateUserResult> {
  const response = await apiRequest<CreateUserResult>(USERS_PATH, {
    method: "POST",
    body: {
      email: payload.email,
      name: payload.name,
      roleIds: payload.roleIds ?? [],
      password: payload.password,
      confirmPassword: payload.confirmPassword,
    },
  });
  return response.data;
}

/** `PATCH /users/:id/status` (Backend permission: `users.update`). */
export async function updateUserStatus(
  id: number,
  status: Exclude<UserStatus, "PENDING">,
): Promise<UserDto> {
  const response = await apiRequest<UserDto>(`${USERS_PATH}/${id}/status`, {
    method: "PATCH",
    body: { status },
  });
  return response.data;
}

/** `PUT /users/:id` (Backend permission: `users.update`). */
export async function updateUser(
  id: number,
  payload: { email?: string; name?: string | null },
): Promise<UserDto> {
  const response = await apiRequest<UserDto>(`${USERS_PATH}/${id}`, {
    method: "PUT",
    body: payload,
  });
  return response.data;
}

/** `PUT /users/:id/roles` (Backend permission: `users.update`). */
export async function setUserRoles(
  id: number,
  roleIds: number[],
): Promise<UserDto> {
  const response = await apiRequest<UserDto>(`${USERS_PATH}/${id}/roles`, {
    method: "PUT",
    body: { roleIds },
  });
  return response.data;
}

/** `DELETE /users/:id` (Backend permission: `users.delete`). */
export async function deleteUser(id: number): Promise<void> {
  await apiRequest<null>(`${USERS_PATH}/${id}`, { method: "DELETE" });
}
