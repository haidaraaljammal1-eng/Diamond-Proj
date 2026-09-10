/**
 * Generic permission catalog. Convention: "resource.action".
 * These are the ONLY permissions the starter ships — add domain permissions in
 * your own project, never here. `PERMISSION_CATALOG` drives the idempotent seed.
 */
export const PERMISSIONS = {
  // --- Home dashboard (product) ---
  // Read the aggregated home dashboard. Sub-sections are additionally gated by
  // their own domain read permissions inside the aggregator (executive/complaints/
  // call-center/campaigns/…), so a limited user still sees only what they may see.
  DASHBOARD_READ: "dashboard.read",

  USERS_READ: "users.read",
  USERS_CREATE: "users.create",
  USERS_UPDATE: "users.update",
  USERS_DELETE: "users.delete",
  // Set/reset another user's password directly (admin action). Deliberately
  // SEPARATE from users.update: managing a user's profile (name/email/roles/
  // departments/status) does not, on its own, grant the power to change their
  // login credentials. The self-service "forgot password" flow is unaffected.
  USERS_RESET_PASSWORD: "users.reset_password",
  // Pick a user (e.g. complaint assignee / call-center agent) as a reference value
  // in a workflow — minimal id+label, no full user read/management. See lookups.
  USERS_LOOKUP: "users.lookup",

  ROLES_READ: "roles.read",
  ROLES_MANAGE: "roles.manage",

  PERMISSIONS_READ: "permissions.read",

  SETTINGS_READ: "settings.read",
  SETTINGS_MANAGE: "settings.manage",

  AUDIT_READ: "audit.read",

  NOTIFICATIONS_READ: "notifications.read",
  NOTIFICATIONS_MANAGE: "notifications.manage",

  FILES_READ: "files.read",
  FILES_UPLOAD: "files.upload",
  FILES_DELETE: "files.delete",

  // --- Master data (product domain) ---
  REGIONS_READ: "regions.read",
  REGIONS_MANAGE: "regions.manage",

  CITIES_READ: "cities.read",
  CITIES_MANAGE: "cities.manage",

  BRANCHES_READ: "branches.read",
  BRANCHES_MANAGE: "branches.manage",

  VEHICLE_MODELS_READ: "vehicle_models.read",
  VEHICLE_MODELS_MANAGE: "vehicle_models.manage",

  DEPARTMENTS_READ: "departments.read",
  DEPARTMENTS_MANAGE: "departments.manage",

  SALESPEOPLE_READ: "salespeople.read",
  SALESPEOPLE_MANAGE: "salespeople.manage",

  // Reference-use of the safe master/reference lookups (regions, cities, branches,
  // vehicle models, departments, salespeople, vehicles) as selectable values in a
  // form — WITHOUT page/management (`.read`) access to those entities. One shared
  // permission (avoids per-entity explosion). Sensitive entities (customers, users)
  // keep their own separate `.lookup` permission.
  REFERENCE_DATA_LOOKUP: "reference_data.lookup",

  // --- Operational domain (product) ---
  CUSTOMERS_READ: "customers.read",
  CUSTOMERS_MANAGE: "customers.manage",
  // Cross-branch customer visibility. A customer has no branch column of its own —
  // its branch is implied by its PurchaseExperiences. Without this permission a user
  // only sees customers who bought at one of their assigned branches.
  CUSTOMERS_VIEW_ALL_BRANCHES: "customers.view_all_branches",
  // Pick a customer as a reference value (minimal, PII-free projection) in a
  // workflow — no full customer read/PII access. See lookups.
  CUSTOMERS_LOOKUP: "customers.lookup",

  VEHICLES_READ: "vehicles.read",
  VEHICLES_MANAGE: "vehicles.manage",

  MAINTENANCE_READ: "maintenance.read",
  MAINTENANCE_MANAGE: "maintenance.manage",

  // --- Diamond rental contracts ---
  CONTRACTS_READ: "contracts.read",
  CONTRACTS_MANAGE: "contracts.manage",
  CONTRACTS_ACTIVATE: "contracts.activate",
  CONTRACTS_CAR_OUT: "contracts.car_out",
  CONTRACTS_RETURN: "contracts.return",
  CONTRACTS_RECONCILE: "contracts.reconcile",
  CONTRACTS_CLOSE: "contracts.close",
  CONTRACTS_RENEW: "contracts.renew",

  PURCHASE_EXPERIENCES_READ: "purchase_experiences.read",
  PURCHASE_EXPERIENCES_MANAGE: "purchase_experiences.manage",

  // --- Import pipeline (product) ---
  IMPORTS_READ: "imports.read",
  IMPORTS_MANAGE: "imports.manage",

  // --- Communication templates (product) ---
  COMMUNICATION_TEMPLATES_READ: "communication_templates.read",
  COMMUNICATION_TEMPLATES_MANAGE: "communication_templates.manage",
  COMMUNICATION_TEMPLATES_PUBLISH: "communication_templates.publish",
  // Pick a PUBLISHED template as a reference value (e.g. in a campaign step)
  // without full template read/management. See lookups.
  COMMUNICATION_TEMPLATES_LOOKUP: "communication_templates.lookup",

  // --- Call center (product) ---
  CALL_CENTER_QUEUE_READ: "call_center_queue.read",
  CALL_CENTER_QUEUE_MANAGE: "call_center_queue.manage",
  // Reassigning another agent's claimed item is sensitive — separated from manage.
  CALL_CENTER_QUEUE_ASSIGN: "call_center_queue.assign",
  CALL_CENTER_CALLS_READ: "call_center_calls.read",
  CALL_CENTER_CALLS_MANAGE: "call_center_calls.manage",
  CALL_CENTER_CALLBACKS_READ: "call_center_callbacks.read",
  CALL_CENTER_CALLBACKS_MANAGE: "call_center_callbacks.manage",
  // Full customer contact (phone) for placing calls — sensitive PII gate, not a role.
  CALL_CENTER_CONTACTS_READ: "call_center_contacts.read",
  // Short-lived signed access to a call recording (audited on each access).
  CALL_CENTER_RECORDINGS_READ: "call_center_recordings.read",
  CALL_CENTER_EXPORT: "call_center.export",
  // Cross-branch visibility. Without it a user only sees their assigned branches.
  CALL_CENTER_VIEW_ALL_BRANCHES: "call_center.view_all_branches",

  // --- Complaints (product) ---
  COMPLAINTS_READ: "complaints.read",
  COMPLAINTS_MANAGE: "complaints.manage",
  COMPLAINTS_CREATE: "complaints.create",
  COMPLAINTS_ASSIGN: "complaints.assign",
  COMPLAINTS_ESCALATE: "complaints.escalate",
  COMPLAINTS_RESOLVE: "complaints.resolve",
  COMPLAINTS_CLOSE: "complaints.close",
  COMPLAINTS_REOPEN: "complaints.reopen",
  COMPLAINTS_EXPORT: "complaints.export",
  COMPLAINTS_VIEW_ALL_BRANCHES: "complaints.view_all_branches",
  COMPLAINTS_VIEW_ALL_DEPARTMENTS: "complaints.view_all_departments",
  COMPLAINT_ACTIONS_CREATE: "complaint_actions.create",
  COMPLAINT_ATTACHMENTS_READ: "complaint_attachments.read",
  COMPLAINT_ATTACHMENTS_UPLOAD: "complaint_attachments.upload",
  COMPLAINT_ROUTING_READ: "complaint_routing.read",
  COMPLAINT_ROUTING_MANAGE: "complaint_routing.manage",
  COMPLAINT_SLA_READ: "complaint_sla.read",
  COMPLAINT_SLA_MANAGE: "complaint_sla.manage",
  COMPLAINT_NOTIFICATIONS_MANAGE: "complaint_notifications.manage",
  // Permission-driven escalation audiences (NOT role names).
  COMPLAINTS_ESCALATIONS_CX_RECEIVE: "complaints.escalations.cx_receive",
  COMPLAINTS_ESCALATIONS_EXECUTIVE_RECEIVE: "complaints.escalations.executive_receive",

  // --- Reports, integrations & security (product) ---
  REPORTS_READ: "reports.read",
  REPORTS_EXPORT: "reports.export",
  REPORTS_SCHEDULE: "reports.schedule",
  REPORTS_EXECUTIVE_READ: "reports.executive.read",
  REPORTS_CUSTOMER_SATISFACTION_READ: "reports.customer_satisfaction.read",
  REPORTS_COMPLAINTS_READ: "reports.complaints.read",
  REPORTS_CALL_CENTER_READ: "reports.call_center.read",
  REPORTS_VIEW_ALL_BRANCHES: "reports.view_all_branches",
  REPORT_TARGETS_READ: "report_targets.read",
  REPORT_TARGETS_MANAGE: "report_targets.manage",
  INTEGRATIONS_READ: "integrations.read",
  INTEGRATIONS_MANAGE: "integrations.manage",
  API_KEYS_READ: "api_keys.read",
  API_KEYS_MANAGE: "api_keys.manage",
  SECURITY_POSTURE_READ: "security_posture.read",
  AUDIT_LOG_READ: "audit_log.read",
  AUDIT_LOG_EXPORT: "audit_log.export",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export interface PermissionDefinition {
  key: PermissionKey;
  category: string;
  description: string;
}

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  { key: PERMISSIONS.DASHBOARD_READ, category: "dashboard", description: "View the home dashboard" },
  { key: PERMISSIONS.USERS_READ, category: "users", description: "View users" },
  { key: PERMISSIONS.USERS_CREATE, category: "users", description: "Create users" },
  { key: PERMISSIONS.USERS_UPDATE, category: "users", description: "Update users" },
  { key: PERMISSIONS.USERS_DELETE, category: "users", description: "Delete users" },
  {
    key: PERMISSIONS.USERS_RESET_PASSWORD,
    category: "users",
    description: "Set or reset a user's password (admin) — separate from profile update",
  },
  {
    key: PERMISSIONS.USERS_LOOKUP,
    category: "users",
    description: "Select a user as a reference value (e.g. assignee/agent) without full user access",
  },
  { key: PERMISSIONS.ROLES_READ, category: "roles", description: "View roles" },
  {
    key: PERMISSIONS.ROLES_MANAGE,
    category: "roles",
    description: "Create/update/delete roles",
  },
  {
    key: PERMISSIONS.PERMISSIONS_READ,
    category: "permissions",
    description: "View permission catalog",
  },
  { key: PERMISSIONS.SETTINGS_READ, category: "settings", description: "View settings" },
  {
    key: PERMISSIONS.SETTINGS_MANAGE,
    category: "settings",
    description: "Manage settings",
  },
  { key: PERMISSIONS.AUDIT_READ, category: "audit", description: "Read audit logs" },
  {
    key: PERMISSIONS.NOTIFICATIONS_READ,
    category: "notifications",
    description: "Read own notifications",
  },
  {
    key: PERMISSIONS.NOTIFICATIONS_MANAGE,
    category: "notifications",
    description: "Broadcast/manage notifications",
  },
  { key: PERMISSIONS.FILES_READ, category: "files", description: "Download attachments" },
  { key: PERMISSIONS.FILES_UPLOAD, category: "files", description: "Upload attachments" },
  { key: PERMISSIONS.FILES_DELETE, category: "files", description: "Delete attachments" },

  { key: PERMISSIONS.REGIONS_READ, category: "regions", description: "View regions" },
  {
    key: PERMISSIONS.REGIONS_MANAGE,
    category: "regions",
    description: "Create/update/(de)activate regions",
  },
  { key: PERMISSIONS.CITIES_READ, category: "cities", description: "View cities" },
  {
    key: PERMISSIONS.CITIES_MANAGE,
    category: "cities",
    description: "Create/update/(de)activate cities",
  },
  { key: PERMISSIONS.BRANCHES_READ, category: "branches", description: "View branches" },
  {
    key: PERMISSIONS.BRANCHES_MANAGE,
    category: "branches",
    description: "Create/update/(de)activate branches",
  },
  {
    key: PERMISSIONS.VEHICLE_MODELS_READ,
    category: "vehicle_models",
    description: "View vehicle models",
  },
  {
    key: PERMISSIONS.VEHICLE_MODELS_MANAGE,
    category: "vehicle_models",
    description: "Create/update/(de)activate vehicle models",
  },
  {
    key: PERMISSIONS.DEPARTMENTS_READ,
    category: "departments",
    description: "View departments",
  },
  {
    key: PERMISSIONS.DEPARTMENTS_MANAGE,
    category: "departments",
    description: "Create/update/(de)activate departments",
  },
  {
    key: PERMISSIONS.SALESPEOPLE_READ,
    category: "salespeople",
    description: "View salespeople",
  },
  {
    key: PERMISSIONS.SALESPEOPLE_MANAGE,
    category: "salespeople",
    description: "Create/update/(de)activate salespeople",
  },

  {
    key: PERMISSIONS.REFERENCE_DATA_LOOKUP,
    category: "reference_data_lookup",
    description:
      "Use reference data (regions, cities, branches, models, departments, salespeople, vehicles) as selectable values in forms — no page/management access",
  },

  { key: PERMISSIONS.CUSTOMERS_READ, category: "customers", description: "View customers" },
  {
    key: PERMISSIONS.CUSTOMERS_MANAGE,
    category: "customers",
    description: "Create/update/(de)activate customers",
  },
  {
    key: PERMISSIONS.CUSTOMERS_VIEW_ALL_BRANCHES,
    category: "customers",
    description: "See customers across all branches (bypass branch scoping)",
  },
  {
    key: PERMISSIONS.CUSTOMERS_LOOKUP,
    category: "customers",
    description: "Select a customer as a reference value (minimal, PII-free) without full customer access",
  },
  { key: PERMISSIONS.VEHICLES_READ, category: "vehicles", description: "View vehicles" },
  {
    key: PERMISSIONS.VEHICLES_MANAGE,
    category: "vehicles",
    description: "Create/update/(de)activate vehicles",
  },
  {
    key: PERMISSIONS.MAINTENANCE_READ,
    category: "maintenance",
    description: "View maintenance orders and summary",
  },
  {
    key: PERMISSIONS.MAINTENANCE_MANAGE,
    category: "maintenance",
    description: "Create and manage maintenance orders",
  },
  { key: PERMISSIONS.CONTRACTS_READ, category: "contracts", description: "View rental contracts" },
  {
    key: PERMISSIONS.CONTRACTS_MANAGE,
    category: "contracts",
    description: "Create contract offers, generate rental links, and confirm payments",
  },
  {
    key: PERMISSIONS.CONTRACTS_ACTIVATE,
    category: "contracts",
    description: "Activate a paid contract (Car-Out)",
  },
  {
    key: PERMISSIONS.CONTRACTS_CAR_OUT,
    category: "contracts",
    description: "Record Car-Out inspection and start the rental",
  },
  {
    key: PERMISSIONS.CONTRACTS_RETURN,
    category: "contracts",
    description: "Generate a return link and start the return flow",
  },
  {
    key: PERMISSIONS.CONTRACTS_RECONCILE,
    category: "contracts",
    description: "Create or update contract reconciliation",
  },
  {
    key: PERMISSIONS.CONTRACTS_CLOSE,
    category: "contracts",
    description: "Close a reviewed contract and release the vehicle",
  },
  {
    key: PERMISSIONS.CONTRACTS_RENEW,
    category: "contracts",
    description: "Renew an active contract",
  },
  {
    key: PERMISSIONS.PURCHASE_EXPERIENCES_READ,
    category: "purchase_experiences",
    description: "View purchase/delivery experiences",
  },
  {
    key: PERMISSIONS.PURCHASE_EXPERIENCES_MANAGE,
    category: "purchase_experiences",
    description: "Create/update purchase/delivery experiences",
  },

  {
    key: PERMISSIONS.IMPORTS_READ,
    category: "imports",
    description: "View import jobs, mappings, previews and results",
  },
  {
    key: PERMISSIONS.IMPORTS_MANAGE,
    category: "imports",
    description: "Upload, map, validate, confirm and cancel imports",
  },

  {
    key: PERMISSIONS.COMMUNICATION_TEMPLATES_READ,
    category: "communication_templates",
    description: "View communication templates and versions",
  },
  {
    key: PERMISSIONS.COMMUNICATION_TEMPLATES_MANAGE,
    category: "communication_templates",
    description: "Create/update templates and edit draft versions",
  },
  {
    key: PERMISSIONS.COMMUNICATION_TEMPLATES_PUBLISH,
    category: "communication_templates",
    description: "Publish communication template versions (sensitive)",
  },
  {
    key: PERMISSIONS.COMMUNICATION_TEMPLATES_LOOKUP,
    category: "communication_templates",
    description: "Select a published message template as a reference value (e.g. in a campaign step) without full template access",
  },

  { key: PERMISSIONS.CALL_CENTER_QUEUE_READ, category: "call_center_queue", description: "View the call-center queue" },
  { key: PERMISSIONS.CALL_CENTER_QUEUE_MANAGE, category: "call_center_queue", description: "Claim, enqueue, release and work call-queue items" },
  { key: PERMISSIONS.CALL_CENTER_QUEUE_ASSIGN, category: "call_center_queue", description: "Reassign a claimed queue item to another agent (sensitive)" },
  { key: PERMISSIONS.CALL_CENTER_CALLS_READ, category: "call_center_calls", description: "View call sessions and the call log" },
  { key: PERMISSIONS.CALL_CENTER_CALLS_MANAGE, category: "call_center_calls", description: "Start and complete calls" },
  { key: PERMISSIONS.CALL_CENTER_CALLBACKS_READ, category: "call_center_callbacks", description: "View scheduled callbacks" },
  { key: PERMISSIONS.CALL_CENTER_CALLBACKS_MANAGE, category: "call_center_callbacks", description: "Schedule and cancel callbacks" },
  { key: PERMISSIONS.CALL_CENTER_CONTACTS_READ, category: "call_center_contacts", description: "View full customer phone numbers to place calls (sensitive PII)" },
  { key: PERMISSIONS.CALL_CENTER_RECORDINGS_READ, category: "call_center_recordings", description: "Access short-lived call-recording playback links" },
  { key: PERMISSIONS.CALL_CENTER_EXPORT, category: "call_center", description: "Export the call queue" },
  { key: PERMISSIONS.CALL_CENTER_VIEW_ALL_BRANCHES, category: "call_center", description: "See call-center data across all branches (bypass branch scoping)" },

  { key: PERMISSIONS.COMPLAINTS_READ, category: "complaints", description: "View complaints" },
  { key: PERMISSIONS.COMPLAINTS_MANAGE, category: "complaints", description: "Work complaints (stage transitions, department, priority)" },
  { key: PERMISSIONS.COMPLAINTS_CREATE, category: "complaints", description: "Create complaints manually" },
  { key: PERMISSIONS.COMPLAINTS_ASSIGN, category: "complaints", description: "Assign / reassign complaints" },
  { key: PERMISSIONS.COMPLAINTS_ESCALATE, category: "complaints", description: "Escalate complaints" },
  { key: PERMISSIONS.COMPLAINTS_RESOLVE, category: "complaints", description: "Resolve complaints" },
  { key: PERMISSIONS.COMPLAINTS_CLOSE, category: "complaints", description: "Close complaints" },
  { key: PERMISSIONS.COMPLAINTS_REOPEN, category: "complaints", description: "Reopen complaints" },
  { key: PERMISSIONS.COMPLAINTS_EXPORT, category: "complaints", description: "Export complaints" },
  { key: PERMISSIONS.COMPLAINTS_VIEW_ALL_BRANCHES, category: "complaints", description: "See complaints across all branches (bypass branch scoping)" },
  { key: PERMISSIONS.COMPLAINTS_VIEW_ALL_DEPARTMENTS, category: "complaints", description: "See complaints across all departments (bypass department scoping)" },
  { key: PERMISSIONS.COMPLAINT_ACTIONS_CREATE, category: "complaint_actions", description: "Add complaint actions / internal notes" },
  { key: PERMISSIONS.COMPLAINT_ATTACHMENTS_READ, category: "complaint_attachments", description: "Download complaint attachments" },
  { key: PERMISSIONS.COMPLAINT_ATTACHMENTS_UPLOAD, category: "complaint_attachments", description: "Upload complaint attachments" },
  { key: PERMISSIONS.COMPLAINT_ROUTING_READ, category: "complaint_routing", description: "View complaint routing rules" },
  { key: PERMISSIONS.COMPLAINT_ROUTING_MANAGE, category: "complaint_routing", description: "Manage complaint routing rules" },
  { key: PERMISSIONS.COMPLAINT_SLA_READ, category: "complaint_sla", description: "View complaint SLA policies" },
  { key: PERMISSIONS.COMPLAINT_SLA_MANAGE, category: "complaint_sla", description: "Manage complaint SLA policies" },
  { key: PERMISSIONS.COMPLAINT_NOTIFICATIONS_MANAGE, category: "complaint_notifications", description: "Manage complaint notification settings" },
  { key: PERMISSIONS.COMPLAINTS_ESCALATIONS_CX_RECEIVE, category: "complaints_escalations", description: "Receive CX-level complaint escalations" },
  { key: PERMISSIONS.COMPLAINTS_ESCALATIONS_EXECUTIVE_RECEIVE, category: "complaints_escalations", description: "Receive executive-level complaint escalations" },

  { key: PERMISSIONS.REPORTS_READ, category: "reports", description: "View reports" },
  { key: PERMISSIONS.REPORTS_EXPORT, category: "reports", description: "Export reports (CSV/XLSX/PDF)" },
  { key: PERMISSIONS.REPORTS_SCHEDULE, category: "reports", description: "Manage scheduled reports" },
  { key: PERMISSIONS.REPORTS_EXECUTIVE_READ, category: "reports", description: "View executive reports" },
  { key: PERMISSIONS.REPORTS_CUSTOMER_SATISFACTION_READ, category: "reports", description: "View customer-satisfaction reports" },
  { key: PERMISSIONS.REPORTS_COMPLAINTS_READ, category: "reports", description: "View complaint reports" },
  { key: PERMISSIONS.REPORTS_CALL_CENTER_READ, category: "reports", description: "View call-center reports" },
  { key: PERMISSIONS.REPORTS_VIEW_ALL_BRANCHES, category: "reports", description: "See report aggregates across all branches (bypass branch scoping)" },
  { key: PERMISSIONS.REPORT_TARGETS_READ, category: "report_targets", description: "View KPI targets" },
  { key: PERMISSIONS.REPORT_TARGETS_MANAGE, category: "report_targets", description: "Manage KPI targets" },
  { key: PERMISSIONS.INTEGRATIONS_READ, category: "integrations", description: "View integration registry" },
  { key: PERMISSIONS.INTEGRATIONS_MANAGE, category: "integrations", description: "Manage integrations (config + secrets)" },
  { key: PERMISSIONS.API_KEYS_READ, category: "api_keys", description: "View external API keys" },
  { key: PERMISSIONS.API_KEYS_MANAGE, category: "api_keys", description: "Create / revoke external API keys" },
  { key: PERMISSIONS.SECURITY_POSTURE_READ, category: "security_posture", description: "View the security posture" },
  { key: PERMISSIONS.AUDIT_LOG_READ, category: "audit_log", description: "Read the audit log" },
  { key: PERMISSIONS.AUDIT_LOG_EXPORT, category: "audit_log", description: "Export the audit log" },
];
