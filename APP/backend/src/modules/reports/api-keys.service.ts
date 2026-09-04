import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import type { z } from "zod";
import { generateOpaqueToken, hashToken, isExpired } from "src/lib/security/tokens";
import { parseSort } from "src/lib/http/pagination";
import { hasPermission, type AuthUser } from "src/lib/context/auth-context";
import { PERMISSIONS } from "src/constants/permissions";
import { API_SCOPE_SET } from "src/modules/reports/api-scopes";
import { apiKeyBranchScopeDeniedError, apiKeyNotFoundError, apiKeyScopeDeniedError } from "src/modules/reports/reports.errors";
import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";
import type { CreateApiKeySchema, ListApiKeysQuerySchema } from "src/modules/reports/reports.schema";

// Scalar ApiKey columns a client may sort by (whitelist — a raw field is never
// passed to Prisma; unknown falls back to the default).
const API_KEY_SORTABLE = ["createdAt", "name", "lastUsedAt"] as const;

export interface ApiAuth {
  apiKeyId: number;
  scopes: string[];
  allBranches: boolean;
  branchScope: number[];
}

export function createApiKeysService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  const toPublic = (k: { id: number; name: string; prefix: string; scopes: unknown; allBranches: boolean; branchScope: unknown; createdByUserId: number | null; expiresAt: Date | null; lastUsedAt: Date | null; revokedAt: Date | null; createdAt: Date }) =>
    ({ id: k.id, name: k.name, prefix: k.prefix, scopes: (k.scopes as string[]) ?? [], allBranches: k.allBranches, branchScope: (k.branchScope as number[] | null) ?? null, createdByUserId: k.createdByUserId, expiresAt: k.expiresAt, lastUsedAt: k.lastUsedAt, revokedAt: k.revokedAt, createdAt: k.createdAt });

  async function create(input: z.infer<typeof CreateApiKeySchema>, viewer: AuthUser) {
    for (const s of input.scopes) if (!API_SCOPE_SET.has(s)) throw new AppError({ code: ErrorCode.VALIDATION_ERROR, message: "Unknown API scope", context: { reason: "api_key_scope_denied", scope: s } });
    // A key may not exceed its creator's branch authority.
    const isGlobal = hasPermission(viewer, PERMISSIONS.REPORTS_VIEW_ALL_BRANCHES);
    let allBranches = input.allBranches ?? false;
    let branchScope: number[] = input.branchScope ?? [];
    if (allBranches && !isGlobal) throw apiKeyBranchScopeDeniedError();
    if (!isGlobal) {
      const assigned = new Set((await prisma.userBranchAssignment.findMany({ where: { userId: viewer.id }, select: { branchId: true } })).map((r) => r.branchId));
      if (branchScope.length === 0) branchScope = [...assigned];
      for (const b of branchScope) if (!assigned.has(b)) throw apiKeyBranchScopeDeniedError();
      allBranches = false;
    }

    const prefix = `cxk_${randomBytes(4).toString("hex")}`;
    const secret = generateOpaqueToken(24);
    const fullKey = `${prefix}.${secret}`;
    const created = await prisma.apiKey.create({
      data: { name: input.name, prefix, secretHash: hashToken(fullKey), scopes: input.scopes as never, allBranches, branchScope: (branchScope.length ? branchScope : null) as never, createdByUserId: viewer.id, expiresAt: input.expiresAt ?? null },
    });
    return { ...toPublic(created), secret: fullKey }; // full secret shown ONCE
  }

  async function list(query: z.infer<typeof ListApiKeysQuerySchema> = {}) {
    const { field, direction } = parseSort(query.sort, API_KEY_SORTABLE, { field: "createdAt", direction: "desc" });
    const rows = await prisma.apiKey.findMany({ orderBy: { [field]: direction } as Prisma.ApiKeyOrderByWithRelationInput, take: 200 });
    return rows.map(toPublic);
  }

  async function revoke(id: number) {
    const k = await prisma.apiKey.findUnique({ where: { id } });
    if (!k) throw apiKeyNotFoundError();
    if (k.revokedAt) return toPublic(k);
    return toPublic(await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } }));
  }

  /** Validate a raw API key → ApiAuth, or throw 401. Updates lastUsedAt (throttled). */
  async function verify(rawKey: string): Promise<ApiAuth> {
    const prefix = rawKey.split(".")[0];
    if (!prefix) throw new AppError({ code: ErrorCode.UNAUTHORIZED, message: "Invalid or unauthorized API key", context: { reason: "api_key_invalid" } });
    const key = await prisma.apiKey.findUnique({ where: { prefix } });
    if (!key || key.secretHash !== hashToken(rawKey)) throw new AppError({ code: ErrorCode.UNAUTHORIZED, message: "Invalid or unauthorized API key", context: { reason: "api_key_invalid" } });
    if (key.revokedAt) throw new AppError({ code: ErrorCode.UNAUTHORIZED, message: "Invalid or unauthorized API key", context: { reason: "api_key_revoked" } });
    if (key.expiresAt && isExpired(key.expiresAt)) throw new AppError({ code: ErrorCode.UNAUTHORIZED, message: "Invalid or unauthorized API key", context: { reason: "api_key_expired" } });
    // Throttled lastUsedAt (fire-and-forget; never blocks the request).
    const stale = !key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000;
    if (stale) void prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    return { apiKeyId: key.id, scopes: (key.scopes as string[]) ?? [], allBranches: key.allBranches, branchScope: (key.branchScope as number[] | null) ?? [] };
  }

  /** Enforce a required scope on an ApiAuth. */
  function requireScope(auth: ApiAuth, scope: string): void {
    if (!auth.scopes.includes(scope)) throw apiKeyScopeDeniedError(scope);
  }

  return { create, list, revoke, verify, requireScope };
}
