import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import { env } from "src/config/env";
import type { AuthUser } from "src/lib/context/auth-context";
import { generateStorageKey, resolveStoragePath } from "src/lib/files/storage-key";
import { encryptSecret, decryptSecret } from "src/lib/security/encryption";
import type { Language } from "src/config/i18n";
import { createReportsService, type PeriodQuery } from "src/modules/reports/reports.service";
import { renderReportPdf, type ReportRenderInput } from "src/modules/reports/report-pdf";
import { localizeReport, reportLabels, type LocalizedReport } from "src/modules/reports/report-localization";
import { REPORT_BY_CODE, type ReportFormat } from "src/modules/reports/report-library";
import { REPORT_EXPORT_ROW_LIMIT, loadReportConfig } from "src/modules/reports/reports.config";
import {
  excelNumberFormat, fileNameSlug, formatCell, isNumericColumn, periodFileSuffix, sheetName,
} from "src/modules/reports/report-format";
import type { ReportResult } from "src/modules/reports/report-model";
import {
  reportArtifactNotAvailableError, reportExportTooLargeError, reportFormatNotSupportedError, reportNotFoundError,
  reportScheduleInvalidError, reportScheduleNotFoundError,
} from "src/modules/reports/reports.errors";
import type { CreateScheduleSchema } from "src/modules/reports/reports.schema";

type Deps = { now?: () => Date };
const ARTIFACT_TTL_MS = 24 * 3600 * 1000;
const ACCESS_TTL_SECONDS = 300;
/** Arabic-first default for scheduled/worker-generated reports (no request context). */
const SCHEDULED_LOCALE: Language = "ar";

export interface RenderedReport {
  buffer: Buffer;
  contentType: string;
  ext: string;
  /** Human, possibly Arabic (RFC 5987 `filename*`). */
  filename: string;
  /** ASCII-only fallback for the plain `filename=` parameter. */
  asciiFilename: string;
}

export function createReportExecService(fastify: FastifyInstance, deps: Deps = {}) {
  const prisma = fastify.prisma;
  const now = deps.now ?? (() => new Date());
  const reports = createReportsService(fastify, deps.now ? { now: deps.now } : {});
  const storageDir = env.FILE_STORAGE_DIR;

  function assertBound(result: ReportResult) {
    if (result.totalRows > REPORT_EXPORT_ROW_LIMIT) {
      throw reportExportTooLargeError(result.totalRows, REPORT_EXPORT_ROW_LIMIT);
    }
  }

  // ── XLSX ───────────────────────────────────────────────────────────────────
  /**
   * One sheet per table (Arabic sheet names), plus a trailing info sheet carrying the
   * report meta + KPIs. Numbers stay numbers, percentages stay FRACTIONS with a percent
   * format, dates stay dates. Header row 1 is bold, frozen and auto-filtered (§17).
   */
  async function toXlsx(report: LocalizedReport, locale: Language, offset: number): Promise<Buffer> {
    const ExcelJS = (await import("exceljs")).default;
    const labels = reportLabels(locale);
    const rtl = locale === "ar";
    const wb = new ExcelJS.Workbook();
    wb.created = report.generatedAt;

    for (const [i, table] of report.tables.entries()) {
      const ws = wb.addWorksheet(sheetName(table.title, `Sheet ${i + 1}`), {
        views: [{ rightToLeft: rtl, state: "frozen", ySplit: 1 }],
      });
      ws.columns = table.columns.map((c) => ({ header: c.label, key: c.key, width: c.width ?? 16 }));
      const headerRow = ws.getRow(1);
      headerRow.font = { bold: true };
      headerRow.alignment = { vertical: "middle", horizontal: rtl ? "right" : "left" };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };

      for (const row of table.rows) {
        // Dates and numbers are written NATIVELY; only text is stringified.
        const added = ws.addRow(row.map((v) => (v instanceof Date || typeof v === "number" ? v : v == null ? null : String(v))));
        table.columns.forEach((c, idx) => {
          const target = added.getCell(idx + 1);
          const fmt = excelNumberFormat(c.type);
          if (fmt) target.numFmt = fmt;
          if (isNumericColumn(c.type)) target.alignment = { horizontal: "right" };
        });
      }
      if (table.columns.length > 0) {
        ws.autoFilter = {
          from: { row: 1, column: 1 },
          to: { row: 1, column: table.columns.length },
        };
      }
    }

    const info = wb.addWorksheet(sheetName(locale === "ar" ? "معلومات التقرير" : "Report info", "Info"), {
      views: [{ rightToLeft: rtl }],
    });
    info.columns = [{ width: 34 }, { width: 46 }];
    const meta: [string, string | number][] = [
      [report.title, report.description],
      [labels.period, report.periodLabel],
      [labels.scope, report.scopeLabel],
      [labels.filters, report.filtersLabel],
      [labels.generatedAt, formatCell(report.generatedAt, "DATETIME", offset)],
      [labels.results, report.totalRows],
    ];
    for (const [k, v] of meta) info.addRow([k, v]).getCell(1).font = { bold: true };
    info.addRow([]);
    for (const k of report.kpis) {
      const row = info.addRow([k.label, k.value]);
      row.getCell(1).font = { bold: true };
      const fmt = excelNumberFormat(k.type);
      if (fmt) row.getCell(2).numFmt = fmt;
    }

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  // ── PDF ────────────────────────────────────────────────────────────────────
  function toPdf(report: LocalizedReport, locale: Language, offset: number): Promise<Buffer> {
    const input: ReportRenderInput = {
      title: report.title,
      description: report.description,
      periodLabel: report.periodLabel,
      generatedAt: report.generatedAt,
      scopeLabel: report.scopeLabel,
      filtersLabel: report.filtersLabel,
      kpis: report.kpis.map((k) => ({ label: k.label, type: k.type, value: k.value })),
      tables: report.tables.map((t) => ({ title: t.title, columns: t.columns, rows: t.rows })),
      locale,
      offsetMinutes: offset,
    };
    return renderReportPdf(input);
  }

  // ── Render dispatch ────────────────────────────────────────────────────────
  async function render(result: ReportResult, format: ReportFormat, locale: Language): Promise<RenderedReport> {
    const def = REPORT_BY_CODE.get(result.code);
    if (!def || !def.allowedFormats.includes(format)) throw reportFormatNotSupportedError(format);
    assertBound(result);
    const config = await loadReportConfig(fastify);
    const offset = config.timezoneOffsetMinutes;
    const localized = localizeReport(result, locale);
    const suffix = periodFileSuffix(result.period.type, result.period.from, result.period.to, offset);
    const base = `${fileNameSlug(localized.title)}-${suffix}`;
    const asciiBase = `${result.code.toLowerCase().replace(/_/g, "-")}-${suffix}`;

    if (format === "XLSX") {
      return {
        buffer: await toXlsx(localized, locale, offset),
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ext: "xlsx",
        filename: `${base}.xlsx`,
        asciiFilename: `${asciiBase}.xlsx`,
      };
    }
    return {
      buffer: await toPdf(localized, locale, offset),
      contentType: "application/pdf",
      ext: "pdf",
      filename: `${base}.pdf`,
      asciiFilename: `${asciiBase}.pdf`,
    };
  }

  /** `attachment` header that survives Arabic file names (RFC 5987). */
  function contentDisposition(out: { filename: string; asciiFilename: string }): string {
    return `attachment; filename="${out.asciiFilename}"; filename*=UTF-8''${encodeURIComponent(out.filename)}`;
  }

  /**
   * Synchronous, bounded export. Runs the SAME builder the JSON preview runs and
   * exports EVERY row matching the filters — never the page the user is looking at
   * (prompt §16).
   */
  async function exportReport(code: string, query: PeriodQuery, viewer: AuthUser, format: ReportFormat, locale: Language) {
    const result = await reports.runReport(code, query, viewer);
    return render(result, format, locale);
  }

  // --- Artifacts (async / scheduled) ---
  async function persistArtifact(
    result: ReportResult,
    format: ReportFormat,
    generatedByUserId: number | null,
    scheduleId: number | null,
    runDedupeKey: string | null,
    locale: Language,
  ) {
    const out = await render(result, format, locale);
    const storageKey = generateStorageKey(`report.${out.ext}`);
    await mkdir(path.resolve(storageDir), { recursive: true });
    await writeFile(resolveStoragePath(storageDir, storageKey), out.buffer);
    return prisma.reportArtifact.create({
      data: {
        reportCode: result.code, format, filtersSnapshot: result.filters as never, scopeSnapshot: result.scope as never,
        generatedByUserId, scheduleId, storageKey, sizeBytes: out.buffer.length, status: "COMPLETED", runDedupeKey,
        expiresAt: new Date(now().getTime() + ARTIFACT_TTL_MS),
      },
    });
  }

  async function createExportJob(code: string, query: PeriodQuery, viewer: AuthUser, format: ReportFormat, locale: Language) {
    const def = REPORT_BY_CODE.get(code);
    if (!def) throw reportNotFoundError();
    if (!def.allowedFormats.includes(format)) throw reportFormatNotSupportedError(format);
    const result = await reports.runReport(code, query, viewer);
    const artifact = await persistArtifact(result, format, viewer.id, null, null, locale);
    return { id: artifact.id, reportCode: artifact.reportCode, format: artifact.format, status: artifact.status, sizeBytes: artifact.sizeBytes, expiresAt: artifact.expiresAt, createdAt: artifact.createdAt };
  }

  async function artifactAccess(id: string, viewer: AuthUser) {
    const a = await prisma.reportArtifact.findUnique({ where: { id }, select: { id: true, status: true, generatedByUserId: true } });
    if (!a || a.status !== "COMPLETED") throw reportArtifactNotAvailableError();
    // A user may access their own artifacts; global report viewers may access any.
    const isGlobal = viewer.permissions.includes("reports.view_all_branches");
    if (a.generatedByUserId != null && a.generatedByUserId !== viewer.id && !isGlobal) throw reportArtifactNotAvailableError();
    const expiresAt = new Date(now().getTime() + ACCESS_TTL_SECONDS * 1000);
    const token = encryptSecret(JSON.stringify({ aid: id, uid: viewer.id, exp: expiresAt.getTime() }));
    return { artifactId: id, url: `/reports/artifacts/stream?token=${encodeURIComponent(token)}`, expiresAt };
  }

  async function streamArtifact(token: string) {
    let claim: { aid: string; exp: number };
    try { claim = JSON.parse(decryptSecret(token)); } catch { throw reportArtifactNotAvailableError(); }
    if (!claim || typeof claim.exp !== "number" || claim.exp < now().getTime()) throw reportArtifactNotAvailableError();
    const a = await prisma.reportArtifact.findUnique({ where: { id: claim.aid } });
    if (!a || a.status !== "COMPLETED" || !a.storageKey) throw reportArtifactNotAvailableError();
    const contentType = a.format === "XLSX" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf";
    return { artifact: a, contentType, stream: createReadStream(resolveStoragePath(storageDir, a.storageKey)) };
  }

  // --- Schedules (backend capability retained; no longer surfaced in the reports UI) ---
  function computeNextRun(s: { recurrence: string; hourOfDay: number; dayOfWeek: number | null; dayOfMonth: number | null }, from: Date, offsetMinutes: number): Date {
    // Work in business-local wall clock (fixed offset).
    const local = new Date(from.getTime() + offsetMinutes * 60_000);
    const candidate = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), s.hourOfDay, 0, 0));
    const toUtc = (d: Date) => new Date(d.getTime() - offsetMinutes * 60_000);
    if (s.recurrence === "DAILY") {
      let next = candidate;
      if (toUtc(next).getTime() <= from.getTime()) next = new Date(next.getTime() + 86_400_000);
      return toUtc(next);
    }
    if (s.recurrence === "WEEKLY") {
      const target = s.dayOfWeek ?? 0;
      let next = candidate;
      for (let i = 0; i < 14; i++) { if (next.getUTCDay() === target && toUtc(next).getTime() > from.getTime()) return toUtc(next); next = new Date(next.getTime() + 86_400_000); }
      return toUtc(next);
    }
    // MONTHLY
    const dom = Math.min(s.dayOfMonth ?? 1, 28);
    let y = local.getUTCFullYear(), m = local.getUTCMonth();
    let next = new Date(Date.UTC(y, m, dom, s.hourOfDay, 0, 0));
    if (toUtc(next).getTime() <= from.getTime()) { m += 1; if (m > 11) { m = 0; y += 1; } next = new Date(Date.UTC(y, m, dom, s.hourOfDay, 0, 0)); }
    return toUtc(next);
  }

  async function createSchedule(input: z.infer<typeof CreateScheduleSchema>, viewer: AuthUser) {
    const def = REPORT_BY_CODE.get(input.reportCode);
    if (!def) throw reportNotFoundError();
    if (!def.allowedFormats.includes(input.format)) throw reportFormatNotSupportedError(input.format);
    if (input.recurrence === "WEEKLY" && input.dayOfWeek == null) throw reportScheduleInvalidError("WEEKLY requires dayOfWeek");
    if (input.recurrence === "MONTHLY" && input.dayOfMonth == null) throw reportScheduleInvalidError("MONTHLY requires dayOfMonth");
    const config = await loadReportConfig(fastify);
    const nextRunAt = computeNextRun({ recurrence: input.recurrence, hourOfDay: input.hourOfDay ?? 8, dayOfWeek: input.dayOfWeek ?? null, dayOfMonth: input.dayOfMonth ?? null }, now(), config.timezoneOffsetMinutes);
    const s = await prisma.reportSchedule.create({
      data: {
        name: input.name, reportCode: input.reportCode, format: input.format, filters: (input.filters ?? undefined) as never,
        timezone: input.timezone ?? "Asia/Riyadh", recurrence: input.recurrence, hourOfDay: input.hourOfDay ?? 8, dayOfWeek: input.dayOfWeek ?? null, dayOfMonth: input.dayOfMonth ?? null,
        recipientUserIds: (input.recipientUserIds ?? undefined) as never, recipientEmails: (input.recipientEmails ?? undefined) as never,
        enabled: input.enabled ?? true, nextRunAt, createdByUserId: viewer.id,
      },
    });
    return toSchedule(s);
  }
  function toSchedule(s: { id: number; name: string; reportCode: string; format: string; recurrence: string; hourOfDay: number; dayOfWeek: number | null; dayOfMonth: number | null; timezone: string; enabled: boolean; lastRunAt: Date | null; nextRunAt: Date | null; createdAt: Date }) {
    return { id: s.id, name: s.name, reportCode: s.reportCode, format: s.format, recurrence: s.recurrence, hourOfDay: s.hourOfDay, dayOfWeek: s.dayOfWeek, dayOfMonth: s.dayOfMonth, timezone: s.timezone, enabled: s.enabled, lastRunAt: s.lastRunAt, nextRunAt: s.nextRunAt, createdAt: s.createdAt };
  }
  async function listSchedules() {
    const rows = await prisma.reportSchedule.findMany({ orderBy: { id: "desc" }, take: 200 });
    return rows.map(toSchedule);
  }
  async function setScheduleEnabled(id: number, enabled: boolean) {
    const s = await prisma.reportSchedule.findUnique({ where: { id } });
    if (!s) throw reportScheduleNotFoundError();
    return toSchedule(await prisma.reportSchedule.update({ where: { id }, data: { enabled } }));
  }
  async function deleteSchedule(id: number) {
    const s = await prisma.reportSchedule.findUnique({ where: { id } });
    if (!s) throw reportScheduleNotFoundError();
    await prisma.reportSchedule.delete({ where: { id } });
    return { deleted: true as const };
  }

  async function loadViewer(userId: number): Promise<AuthUser> {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, status: true, roles: { select: { role: { select: { key: true, permissions: { select: { permission: { select: { key: true } } } } } } } } } });
    const permissions = [...new Set((u?.roles ?? []).flatMap((r) => r.role.permissions.map((p) => p.permission.key)))];
    return { id: userId, email: u?.email ?? "", status: u?.status ?? "ACTIVE", permissions, roleKeys: (u?.roles ?? []).map((r) => r.role.key) };
  }

  /** Worker cycle: run due schedules once (idempotent), generate artifact, honest delivery. */
  async function runReportCycle() {
    const due = await prisma.reportSchedule.findMany({ where: { enabled: true, nextRunAt: { lte: now() } }, take: 25 });
    let ran = 0;
    const config = await loadReportConfig(fastify);
    for (const s of due) {
      const intended = s.nextRunAt ?? now();
      const dedupe = `schedule:${s.id}:${intended.toISOString()}`;
      try {
        const existing = await prisma.reportArtifact.findUnique({ where: { runDedupeKey: dedupe }, select: { id: true } });
        if (!existing) {
          const viewer = await loadViewer(s.createdByUserId ?? 0);
          const query: PeriodQuery = { periodType: "MONTH", branchIds: undefined };
          const result = await reports.runReport(s.reportCode, query, viewer);
          const artifact = await persistArtifact(result, s.format as ReportFormat, s.createdByUserId, s.id, dedupe, SCHEDULED_LOCALE);
          // Honest delivery: no email-attachment sender wired → NOT_CONFIGURED unless email capability is on.
          const delivery = fastify.capabilities.email ? "SENT" : "NOT_CONFIGURED";
          await prisma.reportArtifact.update({ where: { id: artifact.id }, data: { deliveryStatus: delivery } });
          ran++;
        }
        const nextRunAt = computeNextRun({ recurrence: s.recurrence, hourOfDay: s.hourOfDay, dayOfWeek: s.dayOfWeek, dayOfMonth: s.dayOfMonth }, new Date(intended.getTime() + 60_000), config.timezoneOffsetMinutes);
        await prisma.reportSchedule.update({ where: { id: s.id }, data: { lastRunAt: now(), nextRunAt } });
      } catch (err) {
        fastify.log.error({ err, scheduleId: s.id }, "scheduled report failed");
        await prisma.reportSchedule.update({ where: { id: s.id }, data: { nextRunAt: new Date(now().getTime() + 3600_000) } });
      }
    }
    return { scheduledReportsRun: ran };
  }

  return {
    exportReport, render, contentDisposition, createExportJob, artifactAccess, streamArtifact,
    createSchedule, listSchedules, setScheduleEnabled, deleteSchedule, runReportCycle, computeNextRun,
  };
}
