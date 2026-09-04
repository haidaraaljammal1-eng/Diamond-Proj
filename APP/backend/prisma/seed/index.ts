import { PrismaClient } from "@prisma/client";
import type { RoutingFactType, RoutingRuleOperator, ComplaintPriority } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "src/config/env";
import { normalizedNameExtension } from "src/lib/db/prisma-extensions";
import { PERMISSION_CATALOG } from "src/constants/permissions";
import { SYSTEM_ROLES } from "src/constants/roles";
import { normalizeEmail } from "src/lib/security/normalize";
import { hashPassword } from "src/lib/security/password";
import { DEFAULT_SLA_POLICIES } from "src/modules/complaints/sla";

/**
 * Idempotent generic seed. Safe to re-run. Seeds only generic foundation:
 * permissions, the system_admin role, notification definitions, a public
 * setting, and (env-gated) a development admin. No welcome email is sent, and
 * no credentials are hardcoded — the dev admin password comes from env.
 */
const NOTIFICATION_DEFINITIONS = [
  {
    key: "account.created",
    name: "Account created",
    defaultChannels: ["IN_APP", "EMAIL"],
  },
  {
    key: "system.announcement",
    name: "System announcement",
    defaultChannels: ["IN_APP"],
  },
  { key: "complaint.created", name: "Complaint created", defaultChannels: ["IN_APP"] },
  { key: "complaint.routed", name: "Complaint routed to department", defaultChannels: ["IN_APP"] },
  { key: "complaint.assigned", name: "Complaint assigned", defaultChannels: ["IN_APP"] },
  { key: "complaint.sla.warning", name: "Complaint SLA warning", defaultChannels: ["IN_APP"] },
  { key: "complaint.sla.breached", name: "Complaint SLA breached", defaultChannels: ["IN_APP"] },
  { key: "complaint.escalated", name: "Complaint escalated", defaultChannels: ["IN_APP"] },
  { key: "complaint.action_added", name: "Complaint action added", defaultChannels: ["IN_APP"] },
  { key: "complaint.resolved", name: "Complaint resolved", defaultChannels: ["IN_APP"] },
  { key: "complaint.closed", name: "Complaint closed", defaultChannels: ["IN_APP"] },
  { key: "complaint.reopened", name: "Complaint reopened", defaultChannels: ["IN_APP"] },
];

const COMPLAINT_CATEGORIES: { code: string; nameEn: string; nameAr: string; defaultPriority: "CRITICAL" | "URGENT" | "HIGH" | "MEDIUM" | "LOW"; sortOrder: number }[] = [
  { code: "DELIVERY_DELAY", nameEn: "Delivery delay", nameAr: "تأخر تسليم السيارة", defaultPriority: "HIGH", sortOrder: 1 },
  { code: "MISSING_ACCESSORIES", nameEn: "Missing accessories", nameAr: "نقص ملحقات السيارة", defaultPriority: "MEDIUM", sortOrder: 2 },
  { code: "SALESPERSON_BEHAVIOR", nameEn: "Salesperson behavior", nameAr: "تعامل موظف المبيعات", defaultPriority: "HIGH", sortOrder: 3 },
  { code: "TECHNICAL_ISSUE", nameEn: "Technical issue after delivery", nameAr: "مشكلة فنية بعد الاستلام", defaultPriority: "HIGH", sortOrder: 4 },
  { code: "FINANCE_INSURANCE", nameEn: "Finance & insurance", nameAr: "إجراءات التمويل والتأمين", defaultPriority: "MEDIUM", sortOrder: 5 },
  { code: "WARRANTY", nameEn: "Warranty claim", nameAr: "مطالبة الضمان", defaultPriority: "MEDIUM", sortOrder: 6 },
  { code: "NEGATIVE_FEEDBACK", nameEn: "Negative feedback", nameAr: "ملاحظات سلبية", defaultPriority: "MEDIUM", sortOrder: 7 },
  { code: "DIRECT_COMPLAINT", nameEn: "Direct complaint", nameAr: "شكوى مباشرة", defaultPriority: "HIGH", sortOrder: 8 },
];

/**
 * Default routing-rule TEMPLATES — the ready-to-use starting set most companies
 * want. Each maps a "simple mode" preset to exactly ONE existing engine
 * condition (factType + operator + value). They are seeded INACTIVE and
 * UNASSIGNED on purpose: we do not know each company's staff, so the operator
 * picks the responsible employee and activates the rule. Idempotent by `code`,
 * create-missing-only — a customised rule is never overwritten on reseed.
 *
 * Notes on preset choices (from the engine's real facts):
 *  • `COMPLAINT_REQUESTED` is only ever true on the CALL_CENTER source; the rule
 *    is scoped accordingly so it does not silently never match.
 */
const DEFAULT_ROUTING_RULES: {
  code: string;
  name: string;
  categoryCode: string;
  factType: RoutingFactType;
  operator: RoutingRuleOperator;
  valueString?: string;
  valueNumber?: number;
  sourceType?: "CALL_CENTER" | "MANUAL" | "SYSTEM_ROUTING";
  priority: ComplaintPriority;
  sortOrder: number;
}[] = [
  { code: "DEFAULT_COMPLAINT_REQUESTED", name: "طلب العميل فتح شكوى", categoryCode: "DIRECT_COMPLAINT", factType: "COMPLAINT_REQUESTED", operator: "IS_TRUE", sourceType: "CALL_CENTER", priority: "HIGH", sortOrder: 10 },
];

export async function runBaseSeed() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter }).$extends(normalizedNameExtension);

  try {
    // 1) Permissions
    for (const permission of PERMISSION_CATALOG) {
      await prisma.permission.upsert({
        where: { key: permission.key },
        update: { category: permission.category, description: permission.description },
        create: {
          key: permission.key,
          category: permission.category,
          description: permission.description,
        },
      });
    }

    // 2) System admin role with ALL permissions
    const adminRole = await prisma.role.upsert({
      where: { key: SYSTEM_ROLES.SYSTEM_ADMIN },
      update: { name: "مدير النظام", isSystem: true },
      create: {
        key: SYSTEM_ROLES.SYSTEM_ADMIN,
        name: "مدير النظام",
        description: "Full administrative access to all generic modules.",
        isSystem: true,
      },
    });

    const allPermissions = await prisma.permission.findMany({ select: { id: true } });
    for (const perm of allPermissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: adminRole.id, permissionId: perm.id } },
        update: {},
        create: { roleId: adminRole.id, permissionId: perm.id },
      });
    }

    // 3) Notification definitions
    for (const def of NOTIFICATION_DEFINITIONS) {
      await prisma.notificationDefinition.upsert({
        where: { key: def.key },
        update: { name: def.name, defaultChannels: def.defaultChannels },
        create: { key: def.key, name: def.name, defaultChannels: def.defaultChannels },
      });
    }

    // 3b) Complaint categories + SLA policies (configurable; snapshotted at open)
    for (const cat of COMPLAINT_CATEGORIES) {
      await prisma.complaintCategory.upsert({
        where: { code: cat.code },
        update: { nameEn: cat.nameEn, nameAr: cat.nameAr, defaultPriority: cat.defaultPriority, sortOrder: cat.sortOrder },
        create: { code: cat.code, nameEn: cat.nameEn, nameAr: cat.nameAr, defaultPriority: cat.defaultPriority, sortOrder: cat.sortOrder },
      });
    }
    for (const [priority, p] of Object.entries(DEFAULT_SLA_POLICIES)) {
      await prisma.complaintSlaPolicy.upsert({
        where: { priority: priority as "CRITICAL" | "URGENT" | "HIGH" | "MEDIUM" | "LOW" },
        update: {},
        create: { priority: priority as "CRITICAL" | "URGENT" | "HIGH" | "MEDIUM" | "LOW", firstResponseMinutes: p.firstResponseMinutes, resolutionMinutes: p.resolutionMinutes, warningBeforeMinutes: p.warningBeforeMinutes, breachEscalationDelayMinutes: p.breachEscalationDelayMinutes },
      });
    }

    // 3b-1) Default routing-rule templates — inactive, unassigned, create-missing
    // only (never overwrites a customised rule). Requires the categories above.
    const catByCode = new Map(
      (await prisma.complaintCategory.findMany({ select: { id: true, code: true } })).map((c) => [c.code, c.id]),
    );
    for (const r of DEFAULT_ROUTING_RULES) {
      const categoryId = catByCode.get(r.categoryCode);
      if (categoryId == null) continue; // category missing → skip, don't fabricate
      await prisma.complaintRoutingRule.upsert({
        where: { code: r.code },
        update: {}, // create-missing only — a customised seed rule is untouched
        create: {
          code: r.code,
          name: r.name,
          active: false,
          sortOrder: r.sortOrder,
          sourceType: r.sourceType ?? null,
          factType: r.factType,
          operator: r.operator,
          valueString: r.valueString ?? null,
          valueNumber: r.valueNumber ?? null,
          categoryId,
          priority: r.priority,
          assignedToUserId: null,
        },
      });
    }

    // 3b-2) Compatibility back-fill (department-first model): a rule created under
    // the earlier assignee-first model may have an assignee but no department.
    // Derive its department from that assignee (manager-of first, else earliest)
    // so the department-first UI can show "route to <department>"; the specific
    // assignee is KEPT as an advanced override. Only fills a NULL department, so
    // it never overwrites a rule that already routes to one. No rule is deleted.
    const employeeTargeted = await prisma.complaintRoutingRule.findMany({
      where: { assignedToUserId: { not: null }, departmentId: null },
      select: { id: true, assignedToUserId: true },
    });
    for (const rule of employeeTargeted) {
      const uda = await prisma.userDepartmentAssignment.findFirst({
        where: { userId: rule.assignedToUserId as number },
        orderBy: [{ isManager: "desc" }, { id: "asc" }],
        select: { departmentId: true },
      });
      if (uda) {
        await prisma.complaintRoutingRule.update({ where: { id: rule.id }, data: { departmentId: uda.departmentId } });
      }
    }

    // 3b-2) Complaint notification settings — default matrix (event × channel).
    // IN_APP on by default (matches definition defaultChannels); external channels
    // off. Idempotent; operator toggles never downgraded on reseed.
    const COMPLAINT_NOTIF_EVENT_KEYS = NOTIFICATION_DEFINITIONS.filter((d) => d.key.startsWith("complaint.")).map((d) => d.key);
    const COMPLAINT_NOTIF_CHANNELS = ["IN_APP", "EMAIL", "WHATSAPP", "SMS"] as const;
    for (const eventKey of COMPLAINT_NOTIF_EVENT_KEYS) {
      for (const channel of COMPLAINT_NOTIF_CHANNELS) {
        await prisma.complaintNotificationSetting.upsert({
          where: { eventKey_channel: { eventKey, channel } },
          update: {},
          create: { eventKey, channel, enabled: channel === "IN_APP" },
        });
      }
    }

    // 3c) Integration registry — every connector starts HONESTLY NOT_CONFIGURED
    // (no secret, no fake "connected"). An operator configures each explicitly.
    // Fixed catalog only (see integration-config.service.ts listCatalog()): CRM/ERP
    // are retired kinds and must never be seeded on fresh DBs.
    const INTEGRATION_DEFAULTS: { kind: "WHATSAPP" | "SMS" | "EMAIL" | "SSO_ACTIVE_DIRECTORY" | "POWER_BI"; name: string }[] = [
      { kind: "WHATSAPP", name: "WhatsApp Business" },
      { kind: "SMS", name: "SMS Gateway" },
      { kind: "EMAIL", name: "Transactional Email" },
      { kind: "SSO_ACTIVE_DIRECTORY", name: "Corporate SSO" },
      { kind: "POWER_BI", name: "Power BI" },
    ];
    for (const it of INTEGRATION_DEFAULTS) {
      await prisma.integrationConnection.upsert({
        where: { kind_name: { kind: it.kind, name: it.name } },
        update: {}, // never downgrade an operator-configured connection
        create: { kind: it.kind, name: it.name, status: "NOT_CONFIGURED", configured: false },
      });
    }

    // 4) A safe public setting (example)
    await prisma.setting.upsert({
      where: { key: "app.name" },
      update: {},
      create: {
        key: "app.name",
        value: "Fastify Enterprise Starter",
        type: "STRING",
        isPublic: true,
        description: "Display name of the application.",
      },
    });

    // 5) Development admin — only when explicitly enabled
    if (env.SEED_DEV_ADMIN && env.DEV_ADMIN_PASSWORD) {
      const email = normalizeEmail(env.DEV_ADMIN_EMAIL);
      const passwordHash = await hashPassword(env.DEV_ADMIN_PASSWORD);
      const admin = await prisma.user.upsert({
        where: { email },
        update: { status: "ACTIVE", passwordHash },
        create: { email, name: "Dev Admin", status: "ACTIVE", passwordHash },
      });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
        update: {},
        create: { userId: admin.id, roleId: adminRole.id },
      });

      console.log(`Seeded development admin: ${email}`);
    }

    console.log(
      `Seed complete: ${PERMISSION_CATALOG.length} permissions, ${NOTIFICATION_DEFINITIONS.length} notification definitions, system_admin role.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Direct invocation (`tsx prisma/seed/index.ts`) still seeds the generic
// foundation on its own; when imported (prisma/seed.ts) the caller drives it.
if (require.main === module) {
  runBaseSeed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
