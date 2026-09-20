import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { createComplaintsService } from "src/modules/complaints/complaints.service";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

const RUN = process.env.RUN_INTEGRATION === "true";

if (!RUN) {
  test("complaints integration skipped (set RUN_INTEGRATION=true + a test DATABASE_URL)", { skip: true }, () => {});
} else {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let svc: ReturnType<typeof createComplaintsService>;
  const run = Date.now().toString(36).toUpperCase();
  let seq = 0;
  let modelId = 0, adminUserId = 0;
  let deptDelivery = 0, deptSales = 0, catDelivery = 0;
  let branchA = 0, branchB = 0, mgrA = 0, deptMgrId = 0, assigneeId = 0;
  let scopedAId = 0, scopedBId = 0;
  let adminT = "", scopedAT = "", scopedBT = "", zeroT = "", readOnlyT = "";

  async function seedUser(email: string, roleKey: string, perms: string[]) {
    const { hashPassword } = await import("src/lib/security/password");
    const { normalizeEmail } = await import("src/lib/security/normalize");
    const canonicalEmail = normalizeEmail(email);
    const role = await prisma.role.upsert({ where: { key: roleKey }, update: {}, create: { key: roleKey, name: roleKey } });
    for (const key of perms) {
      const perm = await prisma.permission.upsert({ where: { key }, update: {}, create: { key, category: key.split(".")[0], description: key } });
      await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } }, update: {}, create: { roleId: role.id, permissionId: perm.id } });
    }
    const passwordHash = await hashPassword("cmp-pass-1234567");
    const user = await prisma.user.upsert({ where: { email: canonicalEmail }, update: { status: "ACTIVE", passwordHash }, create: { email: canonicalEmail, name: roleKey, status: "ACTIVE", passwordHash } });
    await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
    return user.id;
  }
  const auth = (t: string) => ({ authorization: `Bearer ${t}` });
  const tokenFor = (userId: number) => app.jwt.sign({ sub: userId, type: "access" });
  const CP = ["complaints.read", "complaints.manage", "complaints.create", "complaints.assign", "complaints.escalate", "complaints.resolve", "complaints.close", "complaints.reopen", "complaints.export", "complaint_actions.create", "complaint_attachments.read", "complaint_attachments.upload", "complaint_routing.read", "complaint_routing.manage", "complaint_sla.read", "complaint_sla.manage"];

  async function makeExperience(branchId: number, name = "Buyer") {
    const customer = await prisma.customer.create({ data: { name, mobile: "0501110000" } });
    const vehicle = await prisma.vehicle.create({ data: { companyId: await testCompanyId(prisma), vin: `VIN-${run}-${seq++}`, modelId, modelYear: 2024 } });
    const exp = await prisma.purchaseExperience.create({ data: { customerId: customer.id, vehicleId: vehicle.id, branchId, deliveryDate: new Date() } });
    return { customerId: customer.id, expId: exp.id };
  }
  /** Durable call-center event — the only automation source that opens complaints. */
  async function writeCallEvent(o: { customerId: number; expId: number; branchId: number; callSessionId: number }) {
    return prisma.domainOutboxEvent.create({ data: { eventType: "call_center.complaint_requested", aggregateType: "call_session", aggregateId: String(o.callSessionId), dedupeKey: `call_center.complaint_requested:${o.callSessionId}`, payload: { callSessionId: o.callSessionId, customerId: o.customerId, purchaseExperienceId: o.expId, branchId: o.branchId } } });
  }
  async function createRule(input: { factType: string; operator: string; valueString?: string; valueNumber?: number; categoryId: number; departmentId?: number; priority: string; sortOrder?: number; sourceType?: string; active?: boolean }) {
    return prisma.complaintRoutingRule.create({ data: { name: `rule-${seq++}`, active: input.active ?? true, sortOrder: input.sortOrder ?? 0, sourceType: (input.sourceType as never) ?? null, factType: input.factType as never, operator: input.operator as never, valueString: input.valueString ?? null, valueNumber: input.valueNumber ?? null, categoryId: input.categoryId, departmentId: input.departmentId ?? null, priority: input.priority as never } });
  }

  before(async () => {
    const { buildApp } = await import("src/app");
    app = await buildApp();
    prisma = app.prisma;
    svc = createComplaintsService(app);
    // Routing rules are global — clear any left over from a prior run so first-match is deterministic.
    await prisma.complaintRoutingRule.deleteMany({});
    adminUserId = await seedUser(`cmp-admin-${run}@ex.test`, `cmp_admin_${run}`, [...CP, "complaints.view_all_branches", "complaints.escalations.cx_receive", "complaints.escalations.executive_receive", "customers.read", "customers.view_all_branches"]);
    mgrA = await seedUser(`cmp-mgrA-${run}@ex.test`, `cmp_mgrA_${run}`, ["complaints.read"]);
    deptMgrId = await seedUser(`cmp-deptmgr-${run}@ex.test`, `cmp_deptmgr_${run}`, ["complaints.read"]);
    assigneeId = await seedUser(`cmp-assignee-${run}@ex.test`, `cmp_assignee_${run}`, ["complaints.read", "complaints.manage"]);
    scopedAId = await seedUser(`cmp-scopedA-${run}@ex.test`, `cmp_scopedA_${run}`, CP);
    scopedBId = await seedUser(`cmp-scopedB-${run}@ex.test`, `cmp_scopedB_${run}`, CP);
    const zeroId = await seedUser(`cmp-zero-${run}@ex.test`, `cmp_zero_${run}`, CP);
    const readOnlyId = await seedUser(`cmp-ro-${run}@ex.test`, `cmp_ro_${run}`, ["complaints.read", "complaints.create"]);
    adminT = tokenFor(adminUserId); scopedAT = tokenFor(scopedAId); scopedBT = tokenFor(scopedBId); zeroT = tokenFor(zeroId); readOnlyT = tokenFor(readOnlyId);

    modelId = (await prisma.vehicleModel.create({ data: { code: `MDL-${run}`, name: "Attrage" } })).id;
    deptDelivery = (await prisma.department.create({ data: { code: `DEP-DEL-${run}`, name: "Delivery" } })).id;
    deptSales = (await prisma.department.create({ data: { code: `DEP-SAL-${run}`, name: "Sales" } })).id;
    catDelivery = (await prisma.complaintCategory.create({ data: { code: `CAT-DEL-${run}`, nameEn: "Delivery delay", nameAr: "تأخر", defaultDepartmentId: deptDelivery, defaultPriority: "HIGH", sortOrder: 1 } })).id;
    branchA = (await prisma.branch.create({ data: { code: `BR-A-${run}`, name: "Riyadh", managerUserId: mgrA } })).id;
    branchB = (await prisma.branch.create({ data: { code: `BR-B-${run}`, name: "Jeddah" } })).id;
    // memberships
    await prisma.userBranchAssignment.createMany({ data: [{ userId: scopedAId, branchId: branchA }, { userId: scopedBId, branchId: branchB }, { userId: assigneeId, branchId: branchA }, { userId: deptMgrId, branchId: branchA }] });
    await prisma.userDepartmentAssignment.createMany({ data: [{ userId: assigneeId, departmentId: deptDelivery }, { userId: deptMgrId, departmentId: deptDelivery, isManager: true }, { userId: scopedAId, departmentId: deptDelivery }] });
    // SLA policies are seeded globally (prisma/seed) — CRITICAL/URGENT/HIGH/MEDIUM/LOW.
  });
  after(async () => { if (app) await app.close(); });

  // ---- Creation ----

  test("manual create + idempotency + branch materialized + routed via category default", async () => {
    const { customerId, expId } = await makeExperience(branchA);
    const body = { customerId, purchaseExperienceId: expId, categoryId: catDelivery, description: "Late delivery" };
    const a = await app.inject({ method: "POST", url: "/complaints", headers: { ...auth(adminT), "idempotency-key": `k-${run}-1` }, payload: body });
    assert.equal(a.statusCode, 200);
    const d = a.json().data;
    assert.match(d.publicNumber, /^CMP-\d{6}$/);
    assert.equal(d.branch.id, branchA, "branch materialized from experience");
    assert.equal(d.department?.id, deptDelivery, "category default department applied");
    assert.equal(d.priority, "HIGH");
    assert.equal(d.routingStatus, "ROUTED");
    // Idempotent by header.
    const b = await app.inject({ method: "POST", url: "/complaints", headers: { ...auth(adminT), "idempotency-key": `k-${run}-1` }, payload: body });
    assert.equal(b.json().data.id, d.id, "same idempotency key → same complaint");
  });





  test("call complaintRequested creates complaint; no rule → UNROUTED; twice → one", async () => {
    const { customerId, expId } = await makeExperience(branchB);
    const csId = Date.now(); // unique per run → no cross-run sourceId collision
    const dedupe = `call_center.complaint_requested:cs-${csId}`;
    await prisma.domainOutboxEvent.create({ data: { eventType: "call_center.complaint_requested", aggregateType: "call_session", aggregateId: `cs-${csId}`, dedupeKey: dedupe, payload: { callSessionId: csId, customerId, purchaseExperienceId: expId, branchId: branchB } } });
    await svc.consumeOutbox();
    const c = await prisma.complaint.findFirstOrThrow({ where: { sourceType: "CALL_CENTER", sourceId: String(csId) } });
    assert.equal(c.routingStatus, "UNROUTED", "no rule → UNROUTED (never lost)");
    assert.equal(c.branchId, branchB);
    await prisma.domainOutboxEvent.updateMany({ where: { dedupeKey: dedupe }, data: { status: "PENDING", lockedAt: null } });
    await svc.consumeOutbox();
    assert.equal(await prisma.complaint.count({ where: { sourceType: "CALL_CENTER", sourceId: String(csId) } }), 1);
  });

  test("pre-activation boundary skips historical events; outbox recovers stale lease", async () => {
    await createRule({ factType: "COMPLAINT_REQUESTED", operator: "IS_TRUE", categoryId: catDelivery, departmentId: deptDelivery, priority: "HIGH", sortOrder: 3 });
    // Boundary in the future → current events are "historical" → skipped.
    await prisma.setting.upsert({ where: { key: "complaints.automation.enabled_from" }, update: { value: new Date(Date.now() + 3600_000).toISOString() }, create: { key: "complaints.automation.enabled_from", value: new Date(Date.now() + 3600_000).toISOString(), type: "STRING" } });
    const { customerId, expId } = await makeExperience(branchA);
    const callSessionId = Date.now() + seq++;
    await writeCallEvent({ customerId, expId, branchId: branchA, callSessionId });
    await svc.consumeOutbox();
    assert.equal(await prisma.complaint.count({ where: { sourceType: "CALL_CENTER", sourceId: String(callSessionId) } }), 0, "before boundary → not created");
    await prisma.setting.delete({ where: { key: "complaints.automation.enabled_from" } });
    // Stale-lease recovery: mark PROCESSING with old lock → consume recovers + processes.
    await prisma.domainOutboxEvent.updateMany({ where: { dedupeKey: `call_center.complaint_requested:${callSessionId}` }, data: { status: "PROCESSING", lockedAt: new Date(Date.now() - 10 * 60_000) } });
    await svc.consumeOutbox();
    assert.equal(await prisma.complaint.count({ where: { sourceType: "CALL_CENTER", sourceId: String(callSessionId) } }), 1, "recovered + processed after boundary removed");

  });

  // ---- Lifecycle ----

  async function makeComplaint(branchId = branchA, categoryId = catDelivery, priority?: string) {
    const { customerId, expId } = await makeExperience(branchId);
    const res = await app.inject({ method: "POST", url: "/complaints", headers: { ...auth(adminT), "idempotency-key": `mk-${run}-${seq++}` }, payload: { customerId, purchaseExperienceId: expId, categoryId, description: "d", priority } });
    return res.json().data as { id: number; revision: number };
  }
  const rev = async (id: number) => (await prisma.complaint.findUniqueOrThrow({ where: { id } })).revision;

  test("valid transition; invalid blocked; first response recorded once", async () => {
    const c = await makeComplaint();
    const ok = await app.inject({ method: "POST", url: `/complaints/${c.id}/transition`, headers: auth(adminT), payload: { revision: c.revision, toStage: "IN_PROGRESS" } });
    assert.equal(ok.statusCode, 200);
    // CLOSED is a formal action, never a generic stage target → still rejected.
    const bad = await app.inject({ method: "POST", url: `/complaints/${c.id}/transition`, headers: auth(adminT), payload: { revision: await rev(c.id), toStage: "CLOSED" } });
    assert.equal(bad.statusCode, 409);
    assert.equal(bad.json().error.context.reason, "complaint_invalid_transition");
    const c1 = await prisma.complaint.findUniqueOrThrow({ where: { id: c.id } });
    assert.ok(c1.firstRespondedAt, "first response recorded");
    const fr = c1.firstRespondedAt;
    await app.inject({ method: "POST", url: `/complaints/${c.id}/transition`, headers: auth(adminT), payload: { revision: c1.revision, toStage: "WAITING" } });
    assert.equal((await prisma.complaint.findUniqueOrThrow({ where: { id: c.id } })).firstRespondedAt!.getTime(), fr!.getTime(), "first response set once");
  });

  test("assignment eligibility + reassignment history; department change clears ineligible assignee", async () => {
    const c = await makeComplaint();
    const bad = await app.inject({ method: "POST", url: `/complaints/${c.id}/assign`, headers: auth(adminT), payload: { revision: c.revision, assignedToUserId: scopedBId } });
    assert.equal(bad.statusCode, 422, "scopedB not in dept/branch → ineligible");
    const ok = await app.inject({ method: "POST", url: `/complaints/${c.id}/assign`, headers: auth(adminT), payload: { revision: c.revision, assignedToUserId: assigneeId } });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.json().data.assignedToUserId, assigneeId);
    // Change department to Sales → assignee (Delivery only) is cleared.
    const dep = await app.inject({ method: "POST", url: `/complaints/${c.id}/department`, headers: auth(adminT), payload: { revision: await rev(c.id), departmentId: deptSales } });
    assert.equal(dep.json().data.assignedToUserId, null, "ineligible assignee cleared on department change");
    const tl = await prisma.complaintTimelineEvent.findMany({ where: { complaintId: c.id, type: { in: ["ASSIGNED", "DEPARTMENT_CHANGED"] } } });
    assert.ok(tl.length >= 2, "assignment + department history preserved");
  });

  test("resolve fires a complaint.resolved notification to the audience (record + in-app delivery + deep-link data)", async () => {
    const c = await makeComplaint();
    const asg = await app.inject({ method: "POST", url: `/complaints/${c.id}/assign`, headers: auth(adminT), payload: { revision: c.revision, assignedToUserId: assigneeId } });
    assert.equal(asg.statusCode, 200);
    const res = await app.inject({ method: "POST", url: `/complaints/${c.id}/resolve`, headers: auth(adminT), payload: { revision: await rev(c.id), resolutionSummary: "fixed via test" } });
    assert.equal(res.statusCode, 200);
    // Audience is resolved backend-side; the assignee is always included.
    const notif = await prisma.notification.findFirst({ where: { userId: assigneeId, eventKey: "complaint.resolved" }, orderBy: { createdAt: "desc" } });
    assert.ok(notif, "assignee received a complaint.resolved notification");
    assert.equal((notif!.data as { complaintId?: number }).complaintId, c.id, "notification carries complaintId for deep-linking");
    // Not just a record — the in-app channel was actually delivered.
    const log = await prisma.notificationDeliveryLog.findFirst({ where: { userId: assigneeId, eventKey: "complaint.resolved", channel: "IN_APP" } });
    assert.ok(log, "in-app delivery logged");
    assert.equal(log!.status, "DELIVERED");
  });

  test("resolve requires permission; close requires resolution; double close safe; reopen new cycle preserves old", async () => {
    const c = await makeComplaint();
    const denied = await app.inject({ method: "POST", url: `/complaints/${c.id}/resolve`, headers: auth(readOnlyT), payload: { revision: c.revision, resolutionSummary: "x" } });
    assert.equal(denied.statusCode, 403);
    // Close before resolution requires a summary in the body.
    const noSummary = await app.inject({ method: "POST", url: `/complaints/${c.id}/close`, headers: auth(adminT), payload: { revision: c.revision } });
    assert.equal(noSummary.statusCode, 422);
    assert.equal(noSummary.json().error.context.reason, "complaint_resolution_required");
    await app.inject({ method: "POST", url: `/complaints/${c.id}/resolve`, headers: auth(adminT), payload: { revision: c.revision, resolutionSummary: "fixed" } });
    const closed = await app.inject({ method: "POST", url: `/complaints/${c.id}/close`, headers: auth(adminT), payload: { revision: await rev(c.id) } });
    assert.equal(closed.statusCode, 200);
    const dbl = await app.inject({ method: "POST", url: `/complaints/${c.id}/close`, headers: auth(adminT), payload: { revision: await rev(c.id) } });
    assert.equal(dbl.statusCode, 409);
    assert.equal(dbl.json().error.context.reason, "complaint_already_closed");
    const cyclesBefore = await prisma.complaintSlaCycle.count({ where: { complaintId: c.id } });
    const re = await app.inject({ method: "POST", url: `/complaints/${c.id}/reopen`, headers: auth(adminT), payload: { revision: await rev(c.id), reason: "not fixed" } });
    assert.equal(re.statusCode, 200);
    assert.equal(re.json().data.lifecycleStatus, "OPEN");
    assert.equal(re.json().data.stage, "IN_PROGRESS");
    assert.equal(await prisma.complaintSlaCycle.count({ where: { complaintId: c.id } }), cyclesBefore + 1, "new SLA cycle; old preserved");
    assert.equal((await prisma.complaint.findUniqueOrThrow({ where: { id: c.id } })).reopenedCount, 1);
  });

  test("concurrent transition conflict is revision-safe", async () => {
    const c = await makeComplaint();
    const [a, b] = await Promise.all([
      app.inject({ method: "POST", url: `/complaints/${c.id}/transition`, headers: auth(adminT), payload: { revision: c.revision, toStage: "IN_PROGRESS" } }),
      app.inject({ method: "POST", url: `/complaints/${c.id}/transition`, headers: auth(adminT), payload: { revision: c.revision, toStage: "WAITING" } }),
    ]);
    const codes = [a.statusCode, b.statusCode].sort();
    assert.deepEqual(codes, [200, 409], "one wins, one revision-conflicts");
  });

  // ---- SLA ----

  test("SLA snapshot + warning once + breach + auto-escalation + policy edit leaves active cycle", async () => {
    const c = await makeComplaint(branchA, catDelivery, "HIGH");
    const cyc = await prisma.complaintSlaCycle.findFirstOrThrow({ where: { complaintId: c.id } });
    assert.equal(cyc.resolutionMinutes, 2880, "HIGH snapshot");
    assert.ok(cyc.resolutionDueAt.getTime() > cyc.firstResponseDueAt.getTime());
    // Editing the policy now must NOT change this active cycle.
    await prisma.complaintSlaPolicy.update({ where: { priority: "HIGH" }, data: { resolutionMinutes: 99 } });
    assert.equal((await prisma.complaintSlaCycle.findUniqueOrThrow({ where: { id: cyc.id } })).resolutionMinutes, 2880);
    await prisma.complaintSlaPolicy.update({ where: { priority: "HIGH" }, data: { resolutionMinutes: 2880 } });
    // Warning fires in its window (before resolution); idempotent on re-run.
    const warnTime = createComplaintsService(app, { now: () => new Date(cyc.warningAt.getTime() + 60_000) });
    await warnTime.evaluateSla();
    await warnTime.evaluateSla();
    // Then time-travel past the resolution deadline → breach + auto-escalation.
    const breachTime = createComplaintsService(app, { now: () => new Date(cyc.resolutionDueAt.getTime() + 60_000) });
    await breachTime.evaluateSla();
    const after = await prisma.complaintSlaCycle.findUniqueOrThrow({ where: { id: cyc.id } });
    assert.ok(after.warningNotifiedAt, "warning fired");
    assert.ok(after.firstResponseBreachedAt && after.resolutionBreachedAt, "both breaches recorded");
    const comp = await prisma.complaint.findUniqueOrThrow({ where: { id: c.id } });
    assert.equal(comp.isLate, true);
    assert.equal(comp.isEscalated, true, "auto-escalated on resolution breach");
    const warns = await prisma.complaintTimelineEvent.count({ where: { complaintId: c.id, type: "SLA_WARNING" } });
    assert.equal(warns, 1, "warning emitted once");
  });

  // ---- Scope ----

  test("hard branch scoping across list/detail/transition/export", async () => {
    const ca = await makeComplaint(branchA);
    const cb = await makeComplaint(branchB);
    const aList = (await app.inject({ method: "GET", url: `/complaints?branchId=${branchA}&pageSize=100`, headers: auth(scopedAT) })).json().data.map((x: { id: number }) => x.id);
    assert.ok(aList.includes(ca.id) && !aList.includes(cb.id), "A sees only branch A");
    assert.equal((await app.inject({ method: "GET", url: `/complaints/${cb.id}`, headers: auth(scopedAT) })).statusCode, 404, "out-of-scope detail 404");
    assert.equal((await app.inject({ method: "POST", url: `/complaints/${cb.id}/transition`, headers: auth(scopedAT), payload: { revision: 0, toStage: "IN_PROGRESS" } })).statusCode, 404, "out-of-scope transition 404");
    assert.equal((await app.inject({ method: "GET", url: "/complaints?pageSize=100", headers: auth(zeroT) })).json().data.length, 0, "zero-branch sees empty");
    assert.deepEqual((await app.inject({ method: "GET", url: `/complaints?branchId=${branchB}&pageSize=100`, headers: auth(scopedAT) })).json().data, [], "branchId cannot widen scope");
    // Global sees both (pagination-independent).
    assert.equal((await app.inject({ method: "GET", url: `/complaints/${cb.id}`, headers: auth(adminT) })).statusCode, 200);
    // Export scoped: A export excludes branch B rows.
    const exp = (await app.inject({ method: "GET", url: `/complaints/export?format=csv&branchId=${branchA}`, headers: auth(scopedAT) })).body;
    const cbNum = (await prisma.complaint.findUniqueOrThrow({ where: { id: cb.id } })).publicNumber;
    assert.ok(!exp.includes(cbNum), "export excludes out-of-scope complaint");
  });

  // ---- Actions / attachments ----

  test("internal note absent from audit; attachment MIME allowlist + signed access not stored", async () => {
    const c = await makeComplaint();
    const note = await app.inject({ method: "POST", url: `/complaints/${c.id}/actions`, headers: auth(adminT), payload: { type: "INTERNAL_NOTE", content: "secretnote12345" } });
    assert.equal(note.statusCode, 200);
    const log = await prisma.auditLog.findFirst({ where: { action: "complaint_actions.create", entityId: String(c.id) }, orderBy: { createdAt: "desc" } });
    assert.ok(!JSON.stringify(log?.metadata ?? {}).includes("secretnote"), "note body absent from audit");
    const boundary = "----cmp";
    const multipart = (filename: string, contentType: string, data: Buffer) =>
      Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`), data, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const mpHeaders = { ...auth(adminT), "content-type": `multipart/form-data; boundary=${boundary}` };
    // Disallowed MIME (text/plain) blocked.
    const bad = await app.inject({ method: "POST", url: `/complaints/${c.id}/attachments`, headers: mpHeaders, payload: multipart("a.txt", "text/plain", Buffer.from("hello")) });
    assert.equal(bad.statusCode, 422, "disallowed MIME blocked");
    assert.equal(bad.json().error.context.reason, "attachment_type_not_allowed");
    // Upload a valid PNG via multipart.
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const up = await app.inject({ method: "POST", url: `/complaints/${c.id}/attachments`, headers: mpHeaders, payload: multipart("a.png", "image/png", png) });
    assert.equal(up.statusCode, 200);
    const attId = up.json().data.id;
    assert.equal(up.json().data.storageKey, undefined, "storage key never exposed");
    const access = await app.inject({ method: "GET", url: `/complaints/${c.id}/attachments/${attId}/access`, headers: auth(adminT) });
    assert.equal(access.statusCode, 200);
    assert.ok(access.json().data.url.includes("token="), "signed url minted, not stored");
    assert.equal((await prisma.complaintAttachment.findUniqueOrThrow({ where: { id: attId } })).storageKey.length > 0, true);
    // Out-of-scope attachment access → 404.
    assert.equal((await app.inject({ method: "GET", url: `/complaints/${c.id}/attachments/${attId}/access`, headers: auth(scopedBT) })).statusCode, 404);
  });

  // ---- Post survey / KPIs / 360 ----


  test("routing preview does not open a complaint; SLA policy + routing rule APIs", async () => {
    const before = await prisma.complaint.count();
    const preview = await app.inject({ method: "POST", url: "/complaint-routing-rules/preview", headers: auth(adminT), payload: { facts: { sourceType: "CALL_CENTER", complaintRequested: true } } });
    assert.equal(preview.statusCode, 200);
    assert.equal(await prisma.complaint.count(), before, "preview opens nothing");
    const policies = await app.inject({ method: "GET", url: "/complaint-sla-policies", headers: auth(adminT) });
    assert.equal(policies.statusCode, 200);
    assert.ok(policies.json().data.length >= 5);
    const rules = await app.inject({ method: "GET", url: "/complaint-routing-rules", headers: auth(adminT) });
    assert.equal(rules.statusCode, 200);
  });

  test("escalate is separate from stage; CRITICAL escalated notifies executive audience", async () => {
    const c = await makeComplaint(branchA, catDelivery, "CRITICAL");
    await app.inject({ method: "POST", url: `/complaints/${c.id}/transition`, headers: auth(adminT), payload: { revision: c.revision, toStage: "IN_PROGRESS" } });
    const stageBefore = (await prisma.complaint.findUniqueOrThrow({ where: { id: c.id } })).stage;
    const esc = await app.inject({ method: "POST", url: `/complaints/${c.id}/escalate`, headers: auth(adminT), payload: { revision: await rev(c.id), reason: "urgent" } });
    assert.equal(esc.statusCode, 200);
    const comp = await prisma.complaint.findUniqueOrThrow({ where: { id: c.id } });
    assert.equal(comp.isEscalated, true);
    assert.equal(comp.escalationLevel, 1);
    assert.equal(comp.stage, stageBefore, "escalation does not overwrite operational stage");
    // Admin holds executive-receive → gets an escalation notification.
    const notif = await prisma.notification.count({ where: { userId: adminUserId, eventKey: "complaint.escalated" } });
    assert.ok(notif >= 1, "escalation audience notified");
  });

  test("xlsx export: content type + formula injection neutralized", async () => {
    const branch = (await prisma.branch.create({ data: { code: `BR-X-${run}`, name: "=EVIL()" } })).id;
    const { customerId, expId } = await makeExperience(branch, "=CMD()");
    await app.inject({ method: "POST", url: "/complaints", headers: { ...auth(adminT), "idempotency-key": `x-${run}` }, payload: { customerId, purchaseExperienceId: expId, categoryId: catDelivery, description: "d", allowBranchOverride: true } });
    const res = await app.inject({ method: "GET", url: `/complaints/export?format=xlsx&branchId=${branch}`, headers: auth(adminT) });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers["content-type"] as string, /spreadsheetml/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload as unknown as Parameters<typeof wb.xlsx.load>[0]);
    let neutralized = false;
    wb.getWorksheet("Complaints")!.eachRow((row) => row.eachCell((cell) => { if (String(cell.value ?? "").startsWith("'=CMD")) neutralized = true; }));
    assert.ok(neutralized, "formula neutralized");
  });
}
