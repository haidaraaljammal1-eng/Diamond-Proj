import type { FastifyRequest } from "fastify";
import { AppError } from "src/lib/errors/app-error";

/**
 * Read-only authenticated identity attached to the request by the auth hook.
 * Building this MUST NOT write to the database on the hot path (see the auth
 * hook for the throttled, fire-and-forget lastSeen update).
 */
export interface AuthUser {
  id: number;
  email: string;
  status: string;
  permissions: string[];
  roleKeys: string[];
  /** True when the user holds a protected system role (`Role.isSystem`). */
  isSystemAdmin: boolean;
  sessionId?: string;
}

export function requireAuth(request: FastifyRequest): AuthUser {
  if (!request.auth) throw AppError.unauthorized();
  return request.auth;
}

export function hasPermission(auth: AuthUser, permission: string): boolean {
  if (auth.isSystemAdmin) return true;
  return auth.permissions.includes(permission);
}

export function hasAnyPermission(auth: AuthUser, permissions: string[]): boolean {
  if (auth.isSystemAdmin) return true;
  return permissions.some((p) => auth.permissions.includes(p));
}
