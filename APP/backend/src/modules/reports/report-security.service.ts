import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { hasPermission, type AuthUser } from "src/lib/context/auth-context";
import { PERMISSIONS } from "src/constants/permissions";
import { paginate, parseSort } from "src/lib/http/pagination";
import { loadReportConfig } from "src/modules/reports/reports.config";
import { AUDIT_EXPORT_ROW_LIMIT } from "src/modules/reports/reports.config";
import { auditEntryNotFoundError, auditExportTooLargeError } from "src/modules/reports/reports.errors";
import type { AuditLogQuerySchema, AuditExportQuerySchema, AuditStatsQuerySchema } from "src/modules/reports/reports.schema";

// Scalar AuditLog columns a client may sort by (whitelist — a raw field is never
// passed to Prisma; unknown falls back to the default).
const AUDIT_SORTABLE = ["action", "entityType", "createdAt"] as const;

// --- Human-readable projection (READ-ONLY: audit rows are never rewritten) ---

type AuditPrisma = FastifyInstance["prisma"];
type EntityLabelResolver = (prisma: AuditPrisma, ids: number[]) => Promise<Map<string, string>>;
// entityId is a String column but the referenced models use Int ids; `IN` lists are
// chunked so a large export can never blow the driver's bind-parameter budget.
const LABEL_ID_CHUNK = 1_000;

/** String(id) → label. Rows with no honest label are dropped — never invented. */
function labelMap<T extends { id: number }>(rows: T[], label: (row: T) => string | null): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) { const value = label(row); if (value) map.set(String(row.id), value); }
  return map;
}

/**
 * entityType → ONE batched query returning human labels for a set of ids. An
 * entityType absent from this registry costs no query at all and yields
 * `entityLabel: null`; the UI falls back to `entityType #entityId`.
 */
const ENTITY_LABEL_RESOLVERS: Record<string, EntityLabelResolver> = {
  customer: async (p, ids) => labelMap(await p.customer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }), (r) => r.name),
  complaint: async (p, ids) => labelMap(await p.complaint.findMany({ where: { id: { in: ids } }, select: { id: true, publicNumber: true } }), (r) => r.publicNumber),
  user: async (p, ids) => labelMap(await p.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }), (r) => r.name ?? r.email),
  role: async (p, ids) => labelMap(await p.role.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }), (r) => r.name),
  branch: async (p, ids) => labelMap(await p.branch.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }), (r) => r.name),
  city: async (p, ids) => labelMap(await p.city.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }), (r) => r.name),
  region: async (p, ids) => labelMap(await p.region.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }), (r) => r.name),
  department: async (p, ids) => labelMap(await p.department.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }), (r) => r.name),
  salesperson: async (p, ids) => labelMap(await p.salesperson.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }), (r) => r.name),
  vehicle_model: async (p, ids) => labelMap(await p.vehicleModel.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }), (r) => r.name),
  vehicle: async (p, ids) => labelMap(await p.vehicle.findMany({ where: { id: { in: ids } }, select: { id: true, vin: true, vehicleName: true, modelYear: true, model: { select: { name: true } } } }), (r) => r.vin ?? r.vehicleName ?? [r.model?.name, r.modelYear].filter(Boolean).join(" ")),
  communication_template: async (p, ids) => labelMap(await p.messageTemplate.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }), (r) => r.name),
  import_job: async (p, ids) => labelMap(await p.importJob.findMany({ where: { id: { in: ids } }, select: { id: true, originalFileName: true } }), (r) => r.originalFileName),
  api_key: async (p, ids) => labelMap(await p.apiKey.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }), (r) => r.name),
  report_schedule: async (p, ids) => labelMap(await p.reportSchedule.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }), (r) => r.name),
};

/**
 * Bucket an audit action by its verb suffix. ONE source of truth for the stats
 * cards; every action falls in exactly one bucket (checked create → delete →
 * update → other, so nothing is double counted).
 */
export function classifyAuditVerb(action: string): "create" | "update" | "delete" | "other" {
  if (/\.create(_|$)/.test(action)) return "create";
  if (/(\.delete(_|$)|\.revoke$|\.deactivate$)/.test(action)) return "delete";
  if (/(\.update(_|$)|_updated$|\.set_|\.publish$|\.upsert$)/.test(action)) return "update";
  return "other";
}

/** KPI targets + audit-log read/export + security posture. */
export function createReportSecurityService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  // --- Audit log (read/export only — immutable; never any update/delete endpoint) ---
  function auditWhere(query: z.infer<typeof AuditStatsQuerySchema>): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.action ? { action: { contains: query.action, mode: "insensitive" } } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
    };
    if (query.sourceType === "SYSTEM") where.actorUserId = null;
    else if (query.sourceType === "USER") where.actorUserId = { not: null };
    else if (query.sourceType === "API") where.action = { startsWith: "api." };
    return where;
  }
  function sourceTypeOf(row: { actorUserId: number | null; action: string; metadata: Prisma.JsonValue }): string {
    if (row.action.startsWith("api.") || (row.metadata && typeof row.metadata === "object" && "apiKeyId" in (row.metadata as object))) return "API";
    return row.actorUserId != null ? "USER" : "SYSTEM";
  }

  type AuditRefRow = { actorUserId: number | null; entityType: string | null; entityId: string | null };

  /**
   * Batch-resolve the human labels for a set of audit rows. Cost is bounded and
   * independent of the row count: ONE user query, plus one query per DISTINCT
   * entityType present (chunked for very large sets). Never one query per row.
   */
  async function resolveAuditLabels(rows: readonly AuditRefRow[]) {
    const actorIds = [...new Set(rows.flatMap((r) => (r.actorUserId == null ? [] : [r.actorUserId])))];
    const grouped = new Map<string, { resolver: EntityLabelResolver; ids: Set<number> }>();
    for (const r of rows) {
      if (!r.entityType || !r.entityId) continue;
      const id = Number(r.entityId);
      if (!Number.isInteger(id)) continue; // non-numeric entityId (e.g. a cuid) — nothing to join on
      const group = grouped.get(r.entityType);
      if (group) { group.ids.add(id); continue; }
      const resolver = ENTITY_LABEL_RESOLVERS[r.entityType];
      if (!resolver) continue; // unknown entityType → no query is issued at all
      grouped.set(r.entityType, { resolver, ids: new Set([id]) });
    }
    const groups = [...grouped.entries()];
    const [actorRows, resolved] = await Promise.all([
      actorIds.length > 0 ? prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } }) : Promise.resolve([]),
      Promise.all(groups.map(async ([, g]) => {
        const ids = [...g.ids];
        const chunks = await Promise.all(Array.from({ length: Math.ceil(ids.length / LABEL_ID_CHUNK) }, (_, i) => g.resolver(prisma, ids.slice(i * LABEL_ID_CHUNK, (i + 1) * LABEL_ID_CHUNK))));
        return new Map(chunks.flatMap((c) => [...c]));
      })),
    ]);
    const actors = new Map(actorRows.map((u) => [u.id, u]));
    const labels = new Map(groups.map(([type], i) => [type, resolved[i] ?? new Map<string, string>()]));
    // A missing/deleted actor or unresolvable entity yields null — the client falls back.
    return (row: AuditRefRow) => ({
      actorName: row.actorUserId == null ? null : (actors.get(row.actorUserId)?.name ?? null),
      actorEmail: row.actorUserId == null ? null : (actors.get(row.actorUserId)?.email ?? null),
      entityLabel: row.entityType && row.entityId ? (labels.get(row.entityType)?.get(row.entityId) ?? null) : null,
    });
  }

  /** Ids (of the given page) that carry a real before/after snapshot. The bodies are
   *  deliberately NOT selected — only the id comes back, so lists stay light. */
  async function idsWithChanges(pageIds: string[]): Promise<Set<string>> {
    if (pageIds.length === 0) return new Set();
    const rows = await prisma.auditLog.findMany({ where: { id: { in: pageIds }, OR: [{ before: { not: Prisma.AnyNull } }, { after: { not: Prisma.AnyNull } }] }, select: { id: true } });
    return new Set(rows.map((r) => r.id));
  }

  async function listAudit(query: z.infer<typeof AuditLogQuerySchema>) {
    const where = auditWhere(query);
    const { field, direction } = parseSort(query.sort, AUDIT_SORTABLE, { field: "createdAt", direction: "desc" });
    return paginate({
      page: query.page, pageSize: query.pageSize,
      count: () => prisma.auditLog.count({ where }),
      findMany: async (skip, take) => {
        const rows = await prisma.auditLog.findMany({ where, orderBy: { [field]: direction } as Prisma.AuditLogOrderByWithRelationInput, skip, take, select: { id: true, actorUserId: true, action: true, entityType: true, entityId: true, requestId: true, createdAt: true, metadata: true } });
        const [label, changed] = await Promise.all([resolveAuditLabels(rows), idsWithChanges(rows.map((r) => r.id))]);
        return rows.map((r) => ({ id: r.id, actorUserId: r.actorUserId, ...label(r), action: r.action, entityType: r.entityType, entityId: r.entityId, sourceType: sourceTypeOf(r), hasChanges: changed.has(r.id), requestId: r.requestId, createdAt: r.createdAt, metadata: (r.metadata as Record<string, unknown> | null) ?? null }));
      },
    });
  }

  /** Single entry — same projection as the list, plus the forensic detail (ip,
   *  userAgent, before/after) that is intentionally kept out of lists and exports. */
  async function getAuditEntry(id: string) {
    const r = await prisma.auditLog.findUnique({ where: { id }, select: { id: true, actorUserId: true, action: true, entityType: true, entityId: true, requestId: true, createdAt: true, metadata: true, ip: true, userAgent: true, before: true, after: true } });
    if (!r) throw auditEntryNotFoundError();
    const label = await resolveAuditLabels([r]);
    return { id: r.id, actorUserId: r.actorUserId, ...label(r), action: r.action, entityType: r.entityType, entityId: r.entityId, sourceType: sourceTypeOf(r), hasChanges: r.before != null || r.after != null, requestId: r.requestId, createdAt: r.createdAt, metadata: (r.metadata as Record<string, unknown> | null) ?? null, ip: r.ip, userAgent: r.userAgent, before: r.before ?? null, after: r.after ?? null };
  }

  /** Summary cards for the SAME filters the table honours. Three aggregate queries —
   *  audit rows are never loaded into memory. */
  async function auditStats(query: z.infer<typeof AuditStatsQuerySchema>) {
    const where = auditWhere(query);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const [byAction, today, byActor] = await Promise.all([
      prisma.auditLog.groupBy({ by: ["action"], where, _count: { _all: true } }),
      prisma.auditLog.count({ where: { AND: [where, { createdAt: { gte: startOfToday } }] } }),
      prisma.auditLog.groupBy({ by: ["actorUserId"], where }),
    ]);
    const stats = { total: 0, today, activeUsers: byActor.filter((g) => g.actorUserId != null).length, creates: 0, updates: 0, deletes: 0 };
    for (const g of byAction) {
      const count = g._count._all;
      stats.total += count;
      const verb = classifyAuditVerb(g.action);
      if (verb === "create") stats.creates += count;
      else if (verb === "update") stats.updates += count;
      else if (verb === "delete") stats.deletes += count;
    }
    return stats;
  }

  function safeCell(v: unknown): string | number | null {
    if (v == null) return null;
    if (typeof v === "number") return v;
    const s = String(v);
    return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  }
  const AUDIT_HEADERS = ["ID", "When", "Actor", "ActorName", "Source", "Action", "EntityType", "EntityId", "Entity", "RequestId"];
  async function exportAudit(query: z.infer<typeof AuditExportQuerySchema>) {
    const where = auditWhere(query);
    const total = await prisma.auditLog.count({ where });
    if (total > AUDIT_EXPORT_ROW_LIMIT) throw auditExportTooLargeError(total, AUDIT_EXPORT_ROW_LIMIT);
    // NOTE: metadata bodies are intentionally EXCLUDED from the export — no notes,
    // comments, secrets, tokens or PII bodies ever leave via audit export.
    const rows = await prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: AUDIT_EXPORT_ROW_LIMIT, select: { id: true, actorUserId: true, action: true, entityType: true, entityId: true, requestId: true, createdAt: true, metadata: true } });
    // Names/labels come from the SAME batched resolvers as the list (chunked `IN`s,
    // never one query per row); the metadata/before/after bodies stay excluded.
    const label = await resolveAuditLabels(rows);
    const record = (r: (typeof rows)[number]) => { const l = label(r); return [safeCell(r.id), safeCell(r.createdAt.toISOString()), safeCell(r.actorUserId), safeCell(l.actorName ?? l.actorEmail), safeCell(sourceTypeOf(r)), safeCell(r.action), safeCell(r.entityType), safeCell(r.entityId), safeCell(l.entityLabel), safeCell(r.requestId)]; };
    if (query.format === "XLSX") {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Audit");
      ws.addRow(AUDIT_HEADERS);
      for (const r of rows) ws.addRow(record(r));
      return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" };
    }
    const esc = (v: string | number | null) => { if (v == null) return ""; const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [AUDIT_HEADERS.join(","), ...rows.map((r) => record(r).map(esc).join(","))].join("\n");
    return { buffer: Buffer.from(csv, "utf8"), contentType: "text/csv; charset=utf-8", ext: "csv" };
  }

  // --- Security posture (effective status only; no fake compliance/hosting claims) ---
  async function posture() {
    const config = await loadReportConfig(fastify);
    return {
      tls: "DEPLOYMENT_MANAGED", // terminated at the deployment edge; not asserted from code
      mfa: "NOT_CONFIGURED", // auth system has no MFA yet
      sso: "NOT_CONFIGURED",
      piiMasking: "ENABLED", // centralized masking (maskPhone / redact)
      auditLogging: "ENABLED",
      backups: "DEPLOYMENT_MANAGED",
      passwordPolicy: "CONFIGURED", // argon2id + policy
      actionLinkExpiryDays: config.actionLinkExpiryDays,
      singleSubmission: "ENABLED", // one response per invitation (BE-2C)
      dataResidency: { configuredRegion: config.dataResidencyRegion },
      complianceAttestation: "NOT_VERIFIED", // never claimed from code
      auditRetentionDays: config.auditRetentionDays,
    };
  }

  return { listAudit, getAuditEntry, auditStats, exportAudit, posture };
}

/** Thin guard used by external-API PII gating. */
export function callerCanSeePii(viewer: AuthUser): boolean {
  return hasPermission(viewer, PERMISSIONS.CALL_CENTER_CONTACTS_READ);
}
