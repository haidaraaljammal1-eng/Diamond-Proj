import { apiRequest } from "@/infrastructure/api/client";

const ROLE_LOOKUP_PATH = "/lookups/roles";

/** Backend cap for every lookup endpoint (`LookupBaseQuery.limit.max`). */
export const ROLE_LOOKUP_MAX_LIMIT = 50;

/** `GET /lookups/roles` item — id + label + machine key, nothing else. */
export interface RoleLookupItem {
  id: number;
  label: string;
  code: string;
}

/**
 * Assignable roles for the user form's picker.
 *
 * `GET /lookups/roles` (Backend permissions, any-of: `roles.read`,
 * `users.create`, `users.update`) — the lookup-shaped endpoint, not the
 * read-gated `GET /roles` list: a dropdown must never pull the full admin
 * payload nor demand page access.
 */
export async function lookupRoles(
  search?: string,
): Promise<RoleLookupItem[]> {
  const query = new URLSearchParams({ limit: String(ROLE_LOOKUP_MAX_LIMIT) });
  if (search) query.set("search", search);

  const response = await apiRequest<RoleLookupItem[]>(
    `${ROLE_LOOKUP_PATH}?${query.toString()}`,
  );
  return response.data;
}
