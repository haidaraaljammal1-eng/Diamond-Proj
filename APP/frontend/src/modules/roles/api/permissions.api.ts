import { apiRequest } from "@/infrastructure/api/client";
import type { PermissionDto } from "../types/permission.types";

const PERMISSIONS_PATH = "/permissions";

/**
 * The full permission catalog (Backend permission: `permissions.read`).
 * Read-only and unpaginated in the Backend — it is a fixed, seeded catalog.
 */
export async function listPermissions(): Promise<PermissionDto[]> {
  const response = await apiRequest<PermissionDto[]>(PERMISSIONS_PATH);
  return response.data;
}
