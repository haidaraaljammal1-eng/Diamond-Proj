import { PERMISSIONS } from "src/constants/permissions";

/**
 * The report catalog — SIX approved reports, nothing else (prompt §4/§21).
 *
 * Every entry here is backed by a real query builder in `report-runners.ts` and by
 * real columns in the data model. A card is never shown for a report the backend
 * cannot actually run, and no report duplicates another under a different name.
 *
 * Removed in the 2026-07 cleanup (no query, duplicated another report, or relied on
 * data the system does not collect).
 * CALL_CENTER (old shape), DISSATISFACTION_REASONS, SALESPERSON_SATISFACTION,
 * LATE_ESCALATED_COMPLAINTS, COMPLAINT_RESPONSE_CLOSURE, POST_TREATMENT_SATISFACTION,
 * EXECUTIVE, BRANCH_PERFORMANCE, KPI_SCORECARD.
 */

export type ReportCode =
  | "COMPLAINTS_SUMMARY"
  | "CALL_CENTER_SUMMARY";

/** Excel for working with the data, PDF for circulating it. CSV was dropped: it
 *  carries no types, no number formats and no sheet structure, so it could only ever
 *  be a lossy duplicate of the Excel file. (The audit log keeps its own CSV export —
 *  that is a different module and a different use case.) */
export type ReportFormat = "XLSX" | "PDF";

export interface ReportDefinition {
  code: ReportCode;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  allowedFormats: ReportFormat[];
  requiredPermission: string;
}

const ALL_FORMATS: ReportFormat[] = ["XLSX", "PDF"];

export const REPORT_LIBRARY: ReportDefinition[] = [
  {
    code: "COMPLAINTS_SUMMARY",
    nameEn: "Complaints summary",
    nameAr: "ملخص الشكاوى",
    descriptionEn: "Registered complaints, their status and handling duration.",
    descriptionAr: "عرض الشكاوى المسجلة وحالتها ومدة معالجتها.",
    allowedFormats: ALL_FORMATS,
    requiredPermission: PERMISSIONS.REPORTS_COMPLAINTS_READ,
  },
  {
    code: "CALL_CENTER_SUMMARY",
    nameEn: "Call center summary",
    nameAr: "ملخص مركز الاتصال",
    descriptionEn: "Summary of phone follow-up activity and its outcomes.",
    descriptionAr: "ملخص عمليات المتابعة الهاتفية ونتائجها.",
    allowedFormats: ALL_FORMATS,
    requiredPermission: PERMISSIONS.REPORTS_CALL_CENTER_READ,
  },
];

export const REPORT_BY_CODE = new Map<string, ReportDefinition>(
  REPORT_LIBRARY.map((r) => [r.code, r]),
);

export const REPORT_CODES: ReportCode[] = REPORT_LIBRARY.map((r) => r.code);
