import type { PrismaClient } from "@prisma/client";
import type { AuthUser } from "src/lib/context/auth-context";
import type { Language } from "src/config/i18n";

/** Mutable per-request audit context, enriched by handlers via request.setAudit(). */
export interface AuditContext {
  action?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  before?: unknown;
  after?: unknown;
  skip?: boolean;
}

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }

  interface FastifyRequest {
    /** Read-only authenticated identity (set by the auth hook for protected roles). */
    auth?: AuthUser;
    /** External API-key identity (set by the `external` access-level hook). */
    apiAuth?: { apiKeyId: number; scopes: string[]; allBranches: boolean; branchScope: number[] };
    /** Resolved request language for localized error messages. */
    language?: Language;
    /** Enrich the audit entry for this request (centralized writer persists it). */
    setAudit: (partial: Partial<AuditContext>) => void;
    auditContext?: AuditContext | null;
  }

  interface FastifySchema {
    /**
     * Permissions required to call this route. The always-on permission plugin
     * enforces these automatically — no manual verifyPermission() calls.
     */
    permissions?: string[];
    /** Explicitly mark a route as public (no authentication). Must be intentional. */
    public?: boolean;
    /** External API-key scopes required to call this route (enforced by the `external` hook). */
    apiScopes?: string[];
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: number; sid?: string; type: "access" };
    user: { sub: number; sid?: string; type: "access" };
  }
}
