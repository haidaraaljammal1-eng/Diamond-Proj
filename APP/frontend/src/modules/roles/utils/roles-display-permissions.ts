/**
 * UI-only matrix visibility for the Roles page. Backend catalog and
 * authorization remain authoritative (117 keys). Legacy Haidara modules are
 * hidden from the matrix; ACTIVE + REVIEW keys stay visible (62 total).
 */
export const MATRIX_HIDDEN_LEGACY_PERMISSION_KEYS = [
  "purchase_experiences.read",
  "purchase_experiences.manage",
  "imports.read",
  "imports.manage",
  "communication_templates.read",
  "communication_templates.manage",
  "communication_templates.publish",
  "communication_templates.lookup",
  "call_center_queue.read",
  "call_center_queue.manage",
  "call_center_queue.assign",
  "call_center_calls.read",
  "call_center_calls.manage",
  "call_center_callbacks.read",
  "call_center_callbacks.manage",
  "call_center_contacts.read",
  "call_center_recordings.read",
  "call_center.export",
  "call_center.view_all_branches",
  "complaints.read",
  "complaints.manage",
  "complaints.create",
  "complaints.assign",
  "complaints.escalate",
  "complaints.resolve",
  "complaints.close",
  "complaints.reopen",
  "complaints.export",
  "complaints.view_all_branches",
  "complaints.view_all_departments",
  "complaint_actions.create",
  "complaint_attachments.read",
  "complaint_attachments.upload",
  "complaint_routing.read",
  "complaint_routing.manage",
  "complaint_sla.read",
  "complaint_sla.manage",
  "complaint_notifications.manage",
  "complaints.escalations.cx_receive",
  "complaints.escalations.executive_receive",
  "reports.read",
  "reports.export",
  "reports.schedule",
  "reports.executive.read",
  "reports.customer_satisfaction.read",
  "reports.complaints.read",
  "reports.call_center.read",
  "reports.view_all_branches",
  "report_targets.read",
  "report_targets.manage",
  "integrations.read",
  "integrations.manage",
  "api_keys.read",
  "api_keys.manage",
  "security_posture.read",
] as const;

const HIDDEN = new Set<string>(MATRIX_HIDDEN_LEGACY_PERMISSION_KEYS);

export function isMatrixPermissionRowVisible(key: string): boolean {
  if (key.startsWith("diamond.fn.")) return false;
  return !HIDDEN.has(key);
}

export function filterPermissionsForMatrixDisplay<
  T extends { key: string },
>(permissions: T[]): T[] {
  return permissions.filter((p) => isMatrixPermissionRowVisible(p.key));
}
