/**
 * Central KPI catalog — the SINGLE definition of every executive KPI. Formulas
 * are implemented in code (report-metrics.ts + reports.service.ts), versioned
 * via `calculationVersion`; the DB never stores executable formula logic. Rates
 * are FRACTIONS (0..1); the frontend formats. KPIs whose data cannot be measured
 * reliably are `UNAVAILABLE` (never a fabricated number).
 */
export type KpiUnit = "FRACTION" | "HOURS" | "SCORE" | "COUNT";
export type BetterDirection = "HIGHER_BETTER" | "LOWER_BETTER";

export interface KpiDefinition {
  code: string;
  nameEn: string;
  nameAr: string;
  unit: KpiUnit;
  betterDirection: BetterDirection;
  sourceDomains: string[];
  calculationVersion: number;
  /** Not computable with today's data model → always UNAVAILABLE. */
  alwaysUnavailable?: boolean;
  unavailableReason?: string;
}

export const KPI_CATALOG: KpiDefinition[] = [
  { code: "AVG_COMPLAINT_CLOSURE_TIME", nameEn: "Average complaint closure time", nameAr: "متوسط مدة إغلاق الشكوى", unit: "HOURS", betterDirection: "LOWER_BETTER", sourceDomains: ["complaints"], calculationVersion: 1 },
  { code: "LATE_COMPLAINTS", nameEn: "Late complaints", nameAr: "الشكاوى المتأخرة", unit: "COUNT", betterDirection: "LOWER_BETTER", sourceDomains: ["complaints"], calculationVersion: 1 },
  { code: "FIRST_CONTACT_RESOLUTION", nameEn: "First-contact resolution", nameAr: "الحل من أول تواصل", unit: "FRACTION", betterDirection: "HIGHER_BETTER", sourceDomains: ["call_center", "complaints"], calculationVersion: 1, alwaysUnavailable: true, unavailableReason: "metric_definition_not_configured" },
  { code: "CUSTOMER_RETENTION", nameEn: "Customer retention", nameAr: "الاحتفاظ بالعملاء", unit: "FRACTION", betterDirection: "HIGHER_BETTER", sourceDomains: ["operational"], calculationVersion: 1, alwaysUnavailable: true, unavailableReason: "retention_domain_not_available" },
];

export const KPI_BY_CODE = new Map(KPI_CATALOG.map((k) => [k.code, k]));
