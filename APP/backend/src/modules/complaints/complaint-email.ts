import type { ComplaintPriority, ComplaintLifecycleStatus } from "@prisma/client";
import { escapeHtml } from "src/modules/communication/template-content";
import {
  EMAIL_FONT,
  dirFor,
  pickLang,
  renderEmailShell,
  renderEmailShellText,
  type EmailShellStrings,
} from "src/modules/communication/email-shell";

/**
 * Complaint-notification email content — one premium bilingual template per
 * lifecycle event, rendered through the shared {@link renderEmailShell} (same
 * branded header / footer / bulletproof-CTA chrome (one unified template).
 *
 * SECURITY (prompt §9): the email is a staff-facing operational notice for
 * IN-SCOPE recipients only. It carries the complaint NUMBER + safe reference
 * fields (branch / category / priority / status / assignee / SLA / escalation
 * reason). It NEVER includes internal notes, action bodies, the complaint
 * description, or customer contact details. Customer NAME is included only when
 * the caller passes it (audience is already branch-scoped).
 */

export type ComplaintEmailEvent =
  | "complaint.created"
  | "complaint.routed"
  | "complaint.assigned"
  | "complaint.escalated"
  | "complaint.sla.warning"
  | "complaint.sla.breached"
  | "complaint.resolved"
  | "complaint.closed"
  | "complaint.reopened"
  | "complaint.action_added";
export interface ComplaintEmailContext {
  publicNumber: string;
  customerName?: string | null;
  branchName?: string | null;
  categoryName?: string | null;
  priority?: ComplaintPriority | null;
  lifecycleStatus?: ComplaintLifecycleStatus | null;
  assigneeName?: string | null;
  departmentName?: string | null;
  escalationLevel?: number | null;
  escalationReason?: string | null;
  /** Which SLA notice this is, when the event is an SLA one. */
  slaStatus?: "warning" | "breached" | null;
  /** Absolute deep-link to the complaint page (built backend-side, per locale). */
  viewUrl: string;
}

export interface RenderedComplaintEmail {
  subject: string;
  html: string;
  text: string;
}

type Lang = "ar" | "en";

const PRIORITY_LABELS: Record<ComplaintPriority, Record<Lang, string>> = {
  CRITICAL: { ar: "حرجة", en: "Critical" },
  URGENT: { ar: "عاجلة", en: "Urgent" },
  HIGH: { ar: "عالية", en: "High" },
  MEDIUM: { ar: "متوسطة", en: "Medium" },
  LOW: { ar: "منخفضة", en: "Low" },
};

const STATUS_LABELS: Record<ComplaintLifecycleStatus, Record<Lang, string>> = {
  OPEN: { ar: "مفتوحة", en: "Open" },
  RESOLVED: { ar: "تم الحل", en: "Resolved" },
  CLOSED: { ar: "مغلقة", en: "Closed" },
};

const ROW_LABELS = {
  complaintNo: { ar: "رقم الشكوى", en: "Complaint no." },
  customer: { ar: "العميل", en: "Customer" },
  branch: { ar: "الفرع", en: "Branch" },
  category: { ar: "التصنيف", en: "Category" },
  priority: { ar: "الأولوية", en: "Priority" },
  status: { ar: "الحالة", en: "Status" },
  assignee: { ar: "المسؤول", en: "Assignee" },
  department: { ar: "القسم", en: "Department" },
  escLevel: { ar: "مستوى التصعيد", en: "Escalation level" },
  escReason: { ar: "سبب التصعيد", en: "Escalation reason" },
  sla: { ar: "حالة SLA", en: "SLA status" },
} as const;

const SLA_TEXT = {
  warning: { ar: "اقتراب موعد استحقاق الحل (SLA)", en: "Resolution deadline (SLA) approaching" },
  breached: { ar: "تجاوز موعد استحقاق الحل (SLA)", en: "Resolution deadline (SLA) breached" },
} as const;

const CTA = { ar: "عرض الشكوى", en: "View complaint" } as const;

const CHROME: Record<Lang, EmailShellStrings> = {
  ar: {
    brandName: "Haidara",
    brandSub: "إدارة الشكاوى",
    footerBrand: "Haidara — إدارة الشكاوى",
    footerNote: "رسالة تشغيلية داخلية من نظام إدارة الشكاوى. لا ترد على هذا البريد.",
  },
  en: {
    brandName: "Haidara",
    brandSub: "Complaints Management",
    footerBrand: "Haidara — Complaints Management",
    footerNote: "Internal operational message from the complaints system. Do not reply.",
  },
};

/** Per-event subject + intro (bilingual). `{n}` is the complaint public number. */
const EVENT_COPY: Record<ComplaintEmailEvent, { subject: Record<Lang, string>; intro: Record<Lang, string> }> = {
  "complaint.created": {
    subject: { ar: "شكوى جديدة {n}", en: "New complaint {n}" },
    intro: { ar: "تم تسجيل شكوى جديدة وتحتاج إلى مراجعة.", en: "A new complaint has been registered and needs review." },
  },
  "complaint.routed": {
    subject: { ar: "توجيه شكوى {n}", en: "Complaint {n} routed" },
    intro: { ar: "تم توجيه الشكوى إلى القسم المختص.", en: "The complaint has been routed to the responsible department." },
  },
  "complaint.assigned": {
    subject: { ar: "تم تعيين الشكوى {n}", en: "Complaint {n} assigned" },
    intro: { ar: "تم تعيين الشكوى إليك للمتابعة.", en: "This complaint has been assigned to you for handling." },
  },
  "complaint.escalated": {
    subject: { ar: "تصعيد الشكوى {n}", en: "Complaint {n} escalated" },
    intro: { ar: "تم تصعيد الشكوى وتحتاج إلى اهتمام عاجل.", en: "This complaint has been escalated and needs urgent attention." },
  },
  "complaint.sla.warning": {
    subject: { ar: "تنبيه SLA — الشكوى {n}", en: "SLA warning — complaint {n}" },
    intro: { ar: "تقترب الشكوى من موعد استحقاق الحل. يُرجى المتابعة.", en: "This complaint is approaching its resolution deadline. Please follow up." },
  },
  "complaint.sla.breached": {
    subject: { ar: "تجاوز SLA — الشكوى {n}", en: "SLA breached — complaint {n}" },
    intro: { ar: "تجاوزت الشكوى موعد استحقاق الحل. مطلوب إجراء فوري.", en: "This complaint has breached its resolution deadline. Immediate action is required." },
  },
  "complaint.resolved": {
    subject: { ar: "تم حل الشكوى {n}", en: "Complaint {n} resolved" },
    intro: { ar: "تم وضع حل للشكوى.", en: "A resolution has been recorded for this complaint." },
  },
  "complaint.closed": {
    subject: { ar: "إغلاق الشكوى {n}", en: "Complaint {n} closed" },
    intro: { ar: "تم إغلاق الشكوى.", en: "This complaint has been closed." },
  },
  "complaint.reopened": {
    subject: { ar: "إعادة فتح الشكوى {n}", en: "Complaint {n} reopened" },
    intro: { ar: "تمت إعادة فتح الشكوى وتحتاج إلى متابعة.", en: "This complaint has been reopened and needs follow-up." },
  },
  "complaint.action_added": {
    subject: { ar: "تحديث على الشكوى {n}", en: "Update on complaint {n}" },
    intro: { ar: "تمت إضافة إجراء جديد على الشكوى.", en: "A new action was added to this complaint." },
  },
};

function isKnownEvent(key: string): key is ComplaintEmailEvent {
  return key in EVENT_COPY;
}

/** One labeled detail row (label + bold value), each on its own line — never stuck together. */
function row(label: string, value: string, align: "right" | "left"): string {
  return `
                <tr>
                  <td style="padding:6px 0; font-family:${EMAIL_FONT}; font-size:14px; color:#374151; text-align:${align};">
                    <span style="color:#6b7280;">${escapeHtml(label)}:</span>
                    &nbsp;<strong style="color:#111827;">${escapeHtml(value)}</strong>
                  </td>
                </tr>`;
}

/**
 * Render the complaint email for an event. Returns null for an unknown event key
 * (caller then skips EMAIL for that event). `lang` selects Arabic (RTL) / English.
 */
export function renderComplaintEmail(
  eventKey: string,
  ctx: ComplaintEmailContext,
  lang?: string,
): RenderedComplaintEmail | null {
  if (!isKnownEvent(eventKey)) return null;
  const l: Lang = pickLang(lang);
  const align = dirFor(lang) === "rtl" ? "right" : "left";
  const copy = EVENT_COPY[eventKey];
  const subject = copy.subject[l].replace("{n}", ctx.publicNumber);
  const intro = copy.intro[l];

  const rows: string[] = [row(ROW_LABELS.complaintNo[l], ctx.publicNumber, align)];
  if (ctx.customerName) rows.push(row(ROW_LABELS.customer[l], ctx.customerName, align));
  if (ctx.branchName) rows.push(row(ROW_LABELS.branch[l], ctx.branchName, align));
  if (ctx.categoryName) rows.push(row(ROW_LABELS.category[l], ctx.categoryName, align));
  if (ctx.priority) rows.push(row(ROW_LABELS.priority[l], PRIORITY_LABELS[ctx.priority][l], align));
  if (ctx.lifecycleStatus) rows.push(row(ROW_LABELS.status[l], STATUS_LABELS[ctx.lifecycleStatus][l], align));
  if (ctx.departmentName) rows.push(row(ROW_LABELS.department[l], ctx.departmentName, align));
  if (ctx.assigneeName) rows.push(row(ROW_LABELS.assignee[l], ctx.assigneeName, align));
  if (ctx.escalationLevel != null && ctx.escalationLevel > 0) {
    rows.push(row(ROW_LABELS.escLevel[l], String(ctx.escalationLevel), align));
  }
  if (ctx.escalationReason) rows.push(row(ROW_LABELS.escReason[l], ctx.escalationReason, align));
  if (ctx.slaStatus) rows.push(row(ROW_LABELS.sla[l], SLA_TEXT[ctx.slaStatus][l], align));

  const bodyHtml = `<p style="margin:0 0 16px;">${escapeHtml(intro)}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="background:#fafafa; border:1px solid #eeeeee; border-radius:10px; margin:8px 0 20px;">
                <tr>
                  <td style="padding:14px 18px; font-family:${EMAIL_FONT};">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join("")}
                    </table>
                  </td>
                </tr>
              </table>`;

  const html = renderEmailShell({
    lang,
    subject,
    preheader: intro,
    bodyHtml,
    ctaLabel: CTA[l],
    ctaUrl: ctx.viewUrl,
    strings: CHROME[l],
  });

  const textLines = [
    intro,
    "",
    `${ROW_LABELS.complaintNo[l]}: ${ctx.publicNumber}`,
    ctx.branchName ? `${ROW_LABELS.branch[l]}: ${ctx.branchName}` : "",
    ctx.priority ? `${ROW_LABELS.priority[l]}: ${PRIORITY_LABELS[ctx.priority][l]}` : "",
    ctx.lifecycleStatus ? `${ROW_LABELS.status[l]}: ${STATUS_LABELS[ctx.lifecycleStatus][l]}` : "",
  ].filter(Boolean);
  const text = renderEmailShellText({ messageText: textLines.join("\n"), ctaLabel: CTA[l], ctaUrl: ctx.viewUrl });

  return { subject, html, text };
}
