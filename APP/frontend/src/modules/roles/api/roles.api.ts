import { apiRequest } from "@/infrastructure/api/client";
import type { RoleDto } from "../types/role.types";
import { parsePageMeta, ROLES_MAX_PAGE_SIZE } from "./roles.api.types";
import type { PageMeta } from "./roles.api.types";

const ROLES_PATH = "/roles";

/** One page of `GET /roles` (Backend permission: `roles.read`). */
export async function listRoles(
  page = 1,
): Promise<{ data: RoleDto[]; meta: PageMeta | null }> {
  const response = await apiRequest<RoleDto[]>(
    `${ROLES_PATH}?page=${page}&pageSize=${ROLES_MAX_PAGE_SIZE}`,
  );
  return { data: response.data, meta: parsePageMeta(response.meta) };
}

/**
 * Every role, in Backend order. The matrix needs all columns at once and the
 * Backend caps a page at 100, so the remaining pages (a rare case) are fetched
 * in parallel rather than sequentially.
 */
export async function listAllRoles(): Promise<RoleDto[]> {
  const first = await listRoles(1);
  const totalPages = first.meta?.totalPages ?? 1;
  if (totalPages <= 1) return first.data;

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => listRoles(index + 2)),
  );
  return [...first.data, ...rest.flatMap((page) => page.data)];
}

export interface CreateRolePayload {
  key: string;
  name: string;
  description?: string;
  /** Backend defaults to an empty list; the matrix stays read-only. */
  permissionKeys?: string[];
}

export interface UpdateRolePayload {
  name?: string;
  description?: string | null;
}

/** `POST /roles` (Backend permission: `roles.manage`). */
export async function createRole(payload: CreateRolePayload): Promise<RoleDto> {
  const response = await apiRequest<RoleDto>(ROLES_PATH, {
    method: "POST",
    body: payload,
  });
  return response.data;
}

/** `PUT /roles/:id` (Backend permission: `roles.manage`). */
export async function updateRole(
  id: number,
  payload: UpdateRolePayload,
): Promise<RoleDto> {
  const response = await apiRequest<RoleDto>(`${ROLES_PATH}/${id}`, {
    method: "PUT",
    body: payload,
  });
  return response.data;
}

/**
 * `PUT /roles/:id/permissions` (Backend permission: `roles.manage`).
 * Replaces the whole grant list; the Backend rejects system roles.
 */
export async function setRolePermissions(
  id: number,
  permissionKeys: string[],
): Promise<RoleDto> {
  const response = await apiRequest<RoleDto>(`${ROLES_PATH}/${id}/permissions`, {
    method: "PUT",
    body: { permissionKeys },
  });
  return response.data;
}
