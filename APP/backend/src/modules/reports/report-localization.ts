import type { Language } from "src/config/i18n";
import type { ReportCell, ReportCellType, ReportResult } from "src/modules/reports/report-model";

/**
 * PRESENTATION-only localization of a built report, used by the export renderers.
 *
 * It NEVER changes a computed value, formula, scope, filter, period or ordering — it
 * picks the already-authored `labelAr`/`labelEn` off each column/KPI and maps the
 * fixed enum codes that appear inside cells to readable text. Data (branch names,
 * customer names, campaign names) is never translated.
 */

export interface LocalizedColumn {
  key: string;
  label: string;
  type: ReportCellType;
  width?: number;
}
export interface LocalizedTable {
  key: string;
  title: string;
  columns: LocalizedColumn[];
  rows: ReportCell[][];
}
export interface LocalizedKpi {
  key: string;
  label: string;
  type: ReportCellType;
  value: number | null;
}
export interface LocalizedReport {
  code: string;
  title: string;
  description: string;
  generatedAt: Date;
  periodLabel: string;
  scopeLabel: string;
  filtersLabel: string;
  kpis: LocalizedKpi[];
  tables: LocalizedTable[];
  totalRows: number;
}

/** Fixed enum codes that legitimately appear inside report cells. */
const ENUM_LABELS: Record<string, { en: string; ar: string }> = {
  // Queue / call status
  ACTIVE: { en: "Active", ar: "نشط" },
  INACTIVE: { en: "Inactive", ar: "غير نشط" },
  SCHEDULED: { en: "Scheduled", ar: "مجدولة" },
  COMPLETED: { en: "Completed", ar: "مكتملة" },
  CANCELLED: { en: "Cancelled", ar: "ملغاة" },
  // Channels
  EMAIL: { en: "Email", ar: "البريد الإلكتروني" },
  WHATSAPP: { en: "WhatsApp", ar: "واتساب" },
  SMS: { en: "SMS", ar: "رسالة نصية" },
  CALL_CENTER: { en: "Call center", ar: "مركز الاتصال" },
  // Complaint source
  MANUAL: { en: "Manual", ar: "إدخال يدوي" },
  SYSTEM_ROUTING: { en: "System routing", ar: "توجيه آلي" },
  // Complaint priority
  CRITICAL: { en: "Critical", ar: "حرجة" },
  URGENT: { en: "Urgent", ar: "عاجلة" },
  HIGH: { en: "High", ar: "مرتفعة" },
  MEDIUM: { en: "Medium", ar: "متوسطة" },
  LOW: { en: "Low", ar: "منخفضة" },
  // Complaint lifecycle
  OPEN: { en: "Open", ar: "مفتوحة" },
  RESOLVED: { en: "Resolved", ar: "محلولة" },
  CLOSED: { en: "Closed", ar: "مغلقة" },
};

/** Multi-value cells (e.g. campaign channels) are joined with this separator. */
const JOIN = " / ";

function localizeToken(token: string, locale: Language): string {
  const hit = ENUM_LABELS[token];
  return hit ? hit[locale === "ar" ? "ar" : "en"] : token;
}

/** Translate a cell only when it is a known enum code; data strings pass through. */
export function localizeCell(cell: ReportCell, locale: Language): ReportCell {
  if (typeof cell !== "string" || cell.length === 0) return cell;
  if (cell.includes(JOIN)) {
    return cell.split(JOIN).map((t) => localizeToken(t.trim(), locale)).join(JOIN);
  }
  return localizeToken(cell, locale);
}

/** Meta-row labels for the export header block, by locale. */
export function reportLabels(locale: Language): {
  period: string;
  generatedAt: string;
  scope: string;
  filters: string;
  none: string;
  allBranches: string;
  results: string;
  page: string;
  of: string;
  empty: string;
} {
  if (locale === "ar") {
    return {
      period: "الفترة", generatedAt: "تاريخ الإنشاء", scope: "نطاق الفروع", filters: "عوامل التصفية",
      none: "لا يوجد", allBranches: "جميع الفروع", results: "عدد النتائج", page: "صفحة", of: "من",
      empty: "لا توجد بيانات ضمن الفترة والفلاتر المحددة.",
    };
  }
  return {
    period: "Period", generatedAt: "Generated at", scope: "Scope", filters: "Filters",
    none: "none", allBranches: "All branches", results: "Results", page: "Page", of: "of",
    empty: "No data for the selected period and filters.",
  };
}

const PERIOD_TYPE_LABELS: Record<string, { en: string; ar: string }> = {
  MONTH: { en: "This month", ar: "هذا الشهر" },
  QUARTER: { en: "This quarter", ar: "هذا الربع" },
  YEAR: { en: "This year", ar: "هذه السنة" },
  CUSTOM: { en: "Custom range", ar: "فترة مخصصة" },
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** "2026-07-01 → 2026-07-31" — the last INCLUDED day (`to` is exclusive). */
export function periodLabelOf(from: Date, to: Date): string {
  return `${isoDay(from)} → ${isoDay(new Date(to.getTime() - 86_400_000))}`;
}

export function localizeReport(result: ReportResult, locale: Language): LocalizedReport {
  const ar = locale === "ar";
  const labels = reportLabels(locale);
  const scopeLabel = result.scope.allBranches
    ? labels.allBranches
    : result.scope.branchNames.length
      ? result.scope.branchNames.join("، ")
      : labels.none;
  const periodType = PERIOD_TYPE_LABELS[result.period.type];
  const filtersLabel = [
    periodType ? (ar ? periodType.ar : periodType.en) : result.period.type,
    `${labels.scope}: ${scopeLabel}`,
  ].join(" · ");

  return {
    code: result.code,
    title: ar ? result.titleAr : result.titleEn,
    description: ar ? result.descriptionAr : result.descriptionEn,
    generatedAt: result.generatedAt,
    periodLabel: periodLabelOf(result.period.from, result.period.to),
    scopeLabel,
    filtersLabel,
    kpis: result.kpis.map((k) => ({ key: k.key, label: ar ? k.labelAr : k.labelEn, type: k.type, value: k.value })),
    tables: result.tables.map((t) => ({
      key: t.key,
      title: ar ? t.titleAr : t.titleEn,
      columns: t.columns.map((c) => ({
        key: c.key,
        label: ar ? c.labelAr : c.labelEn,
        type: c.type,
        ...(c.width ? { width: c.width } : {}),
      })),
      rows: t.rows.map((row) => row.map((cell) => localizeCell(cell, locale))),
    })),
    totalRows: result.totalRows,
  };
}
