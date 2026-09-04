import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { paginate } from "src/lib/http/pagination";
import type { AuthUser } from "src/lib/context/auth-context";
import { PERMISSIONS } from "src/constants/permissions";
import { createComplaintsService } from "src/modules/complaints/complaints.service";
import { createReportsService } from "src/modules/reports/reports.service";
import type { ApiAuth } from "src/modules/reports/api-keys.service";
import { apiKeyBranchScopeDeniedError } from "src/modules/reports/reports.errors";
import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";
import type { ApiListCustomersQuery, ApiCreateComplaint, ApiTransitionComplaint, ApiKpiQuery } from "src/modules/api/external-api.schema";

export function createExternalApiService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const complaints = createComplaintsService(fastify);
  const reports = createReportsService(fastify);

  /** Synthetic internal identity for an API key. Branch scope is enforced by the
   *  EXTERNAL layer (below), so the reused domain service runs "global". PII is
   *  gated by a dedicated key scope. */
  function apiViewer(auth: ApiAuth): AuthUser {
    const perms: string[] = [PERMISSIONS.COMPLAINTS_VIEW_ALL_BRANCHES, PERMISSIONS.REPORTS_VIEW_ALL_BRANCHES];
    if (auth.scopes.includes("responses.read_pii")) perms.push(PERMISSIONS.CALL_CENTER_CONTACTS_READ);
    return { id: 0, email: "api", status: "ACTIVE", permissions: perms, roleKeys: [] };
  }
  const includePii = (auth: ApiAuth) => auth.scopes.includes("responses.read_pii");
  function assertBranchInScope(auth: ApiAuth, branchId: number | null) {
    if (auth.allBranches) return;
    if (branchId == null || !auth.branchScope.includes(branchId)) throw apiKeyBranchScopeDeniedError();
  }
  function maskPhone(m: string | null): string | null {
    if (!m) return null;
    const d = m.replace(/\D/g, "");
    return d.length < 4 ? null : `••••${d.slice(-4)}`;
  }

  // GET /customers
  async function listCustomers(query: z.infer<typeof ApiListCustomersQuery>, auth: ApiAuth) {
    const where: Prisma.CustomerWhereInput = {
      ...(auth.allBranches ? {} : { experiences: { some: { branchId: { in: auth.branchScope } } } }),
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
    };
    const pii = includePii(auth);
    return paginate({
      page: query.page, pageSize: query.pageSize,
      count: () => prisma.customer.count({ where }),
      findMany: async (skip, take) => {
        const rows = await prisma.customer.findMany({ where, orderBy: { id: "desc" }, skip, take, select: { id: true, name: true, mobile: true, email: true, type: true, externalId: true } });
        return rows.map((c) => ({ id: c.id, name: c.name, type: c.type, externalId: c.externalId, mobile: pii ? c.mobile : maskPhone(c.mobile), email: pii ? c.email : null }));
      },
    });
  }

  // POST /complaints (reuses BE-4 createManual — no duplicate logic)
  async function createComplaint(input: z.infer<typeof ApiCreateComplaint>, auth: ApiAuth, idempotencyKey: string | undefined) {
    // Enforce the key's branch scope BEFORE the reused service runs "global".
    let branchId = input.branchId ?? null;
    if (input.purchaseExperienceId) {
      const exp = await prisma.purchaseExperience.findUnique({ where: { id: input.purchaseExperienceId }, select: { branchId: true } });
      branchId = branchId ?? exp?.branchId ?? null;
    }
    assertBranchInScope(auth, branchId);
    return complaints.createManual({ ...input, allowBranchOverride: false }, apiViewer(auth), idempotencyKey);
  }

  async function getComplaint(id: number, auth: ApiAuth) {
    const c = await prisma.complaint.findUnique({ where: { id }, select: { branchId: true } });
    if (!c) throw new AppError({ code: ErrorCode.NOT_FOUND, message: "Complaint not found", context: { reason: "complaint_not_found" } });
    assertBranchInScope(auth, c.branchId);
    return complaints.detail(id, apiViewer(auth));
  }

  async function transitionComplaint(id: number, body: z.infer<typeof ApiTransitionComplaint>, auth: ApiAuth) {
    const c = await prisma.complaint.findUnique({ where: { id }, select: { branchId: true } });
    if (!c) throw new AppError({ code: ErrorCode.NOT_FOUND, message: "Complaint not found", context: { reason: "complaint_not_found" } });
    assertBranchInScope(auth, c.branchId);
    // Explicit command only — respects the BE-4 state machine (no generic DB update).
    return complaints.transition(id, body, apiViewer(auth));
  }

  // GET /reports/kpi (BI-friendly flat schema)
  async function kpi(query: z.infer<typeof ApiKpiQuery>, auth: ApiAuth) {
    const branchIds = auth.allBranches ? undefined : auth.branchScope;
    const r = await reports.executiveKpis({ periodType: query.periodType ?? "MONTH", from: query.from, to: query.to, branchIds }, apiViewer(auth));
    return { period: r.period, kpis: r.kpis.map((k) => ({ code: k.code, unit: k.unit, currentValue: k.currentValue, previousValue: k.previousValue, targetValue: k.targetValue, targetStatus: k.targetStatus })) };
  }

  return { listCustomers, createComplaint, getComplaint, transitionComplaint, kpi };
}
