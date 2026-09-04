/**
 * CASE ESCALATION — HTTP contract + audit verification.
 *
 * Exercises the endpoints the dialog calls, over real HTTP, as a real logged-in
 * user — proving permission guard → DTO validation → service → audit log. The
 * audit row can only be checked here: it is written by a Fastify hook on the
 * response, so it does not exist when the service is called directly.
 *
 * Credentials come from the environment (DEV_ADMIN_* by default, or QA_*).
 *
 *   npx tsx scripts/verify-escalation-http.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "src/config/env";

const BASE = process.env.API_BASE ?? "http://localhost:4000";
const EMAIL = process.env.QA_EMAIL ?? env.DEV_ADMIN_EMAIL ?? "";
const PASSWORD = process.env.QA_PASSWORD ?? env.DEV_ADMIN_PASSWORD ?? "";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
const TAG = `EHTTP-${Date.now().toString(36).toUpperCase()}`;

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (cond) pass++;
  else fail++;
};

let token = "";
async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { status: res.status, json: json as Record<string, never> | null, text };
}

const createdComplaintIds: number[] = [];
async function cleanup() {
  for (const id of createdComplaintIds) {
    await prisma.complaintNotificationDelivery.deleteMany({ where: { complaintId: id } }).catch(() => {});
    await prisma.complaintEscalation.deleteMany({ where: { complaintId: id } }).catch(() => {});
    await prisma.complaintTimelineEvent.deleteMany({ where: { complaintId: id } }).catch(() => {});
    await prisma.complaintSlaCycle.deleteMany({ where: { complaintId: id } }).catch(() => {});
    await prisma.complaint.delete({ where: { id } }).catch(() => {});
  }
  await prisma.customer.deleteMany({ where: { name: { startsWith: TAG } } }).catch(() => {});
}

async function main() {
  const login = await call("POST", "/auth/login", { email: EMAIL, password: PASSWORD });
  token = (login.json as { data?: { accessToken?: string } })?.data?.accessToken ?? "";
  ok("LOGIN — the QA account authenticates", login.status === 200 && !!token, `status=${login.status}`);
  if (!token) return false;

  // A real, open case in a branch with at least two active departments.
  const branch = await prisma.branch.findFirst({ where: { departments: { some: { isActive: true } } }, select: { id: true } });
  const depts = branch ? await prisma.department.findMany({ where: { isActive: true, branchId: branch.id }, select: { id: true }, take: 2 }) : [];
  if (!branch || depts.length < 2) { ok("FIXTURE — a branch with two active departments exists", false, `depts=${depts.length}`); return false; }
  const customer = await prisma.customer.create({ data: { name: `${TAG} Customer` } });

  const created = await call("POST", "/complaints/", {
    customerId: customer.id, branchId: branch.id, departmentId: depts[0]!.id,
    description: `${TAG} escalation http check`, priority: "MEDIUM",
  });
  const complaint = (created.json as { data?: { id: number; revision: number } })?.data;
  ok("CREATE — a case is created over HTTP", created.status === 200 && !!complaint?.id, `status=${created.status} ${created.text.slice(0, 140)}`);
  if (!complaint) return false;
  createdComplaintIds.push(complaint.id);

  const targets = await call("GET", `/complaints/${complaint.id}/escalation-targets`);
  const tData = (targets.json as { data?: { targets?: { departmentId: number; departmentName: string }[]; currentDepartmentId: number | null } })?.data;
  ok("TARGETS — the destination list is readable", targets.status === 200, `status=${targets.status}`);
  ok("TARGETS — it returns named departments, not ids alone", (tData?.targets ?? []).every((t) => typeof t.departmentName === "string" && t.departmentName.length > 0), `count=${tData?.targets?.length}`);
  ok("TARGETS — the case's own department is excluded", !(tData?.targets ?? []).some((t) => t.departmentId === tData?.currentDepartmentId));
  const destination = (tData?.targets ?? [])[0];
  if (!destination) { ok("TARGETS — at least one destination is available", false); return false; }

  // The dialog's exact payload: reason + destination, NO level.
  const esc = await call("POST", `/complaints/${complaint.id}/escalate`, {
    revision: complaint.revision, reason: `${TAG} escalated over http`, targetDepartmentId: destination.departmentId,
  });
  ok("ESCALATE — succeeds with reason + destination and NO level", esc.status === 200, `status=${esc.status} ${esc.text.slice(0, 160)}`);
  const after = await prisma.complaint.findUniqueOrThrow({ where: { id: complaint.id } });
  ok("ESCALATE — the case actually moved", after.departmentId === destination.departmentId, `dept=${after.departmentId} want=${destination.departmentId}`);
  ok("ESCALATE — and is flagged escalated", after.isEscalated);

  // The AUDIT row — only observable through the HTTP layer.
  const audit = await prisma.auditLog.findFirst({
    where: { action: "complaints.escalated", entityType: "complaint", entityId: String(complaint.id) },
    orderBy: { createdAt: "desc" },
  });
  ok("AUDIT — an audit row was written for the escalation", audit != null);
  const meta = (audit?.metadata ?? {}) as Record<string, unknown>;
  ok("AUDIT — it records the destination department", meta.targetDepartmentId === destination.departmentId, JSON.stringify(meta));
  ok("AUDIT — and the previous department", meta.previousDepartmentId === depts[0]!.id, `previous=${String(meta.previousDepartmentId)}`);
  ok("AUDIT — and links the escalation record", typeof meta.escalationId === "number");
  ok("AUDIT — and the actor", audit?.actorUserId != null, `actor=${String(audit?.actorUserId)}`);

  // Replaying the same body must be refused by the revision guard.
  const replay = await call("POST", `/complaints/${complaint.id}/escalate`, {
    revision: complaint.revision, reason: `${TAG} escalated over http`, targetDepartmentId: destination.departmentId,
  });
  ok("DOUBLE SUBMIT — replaying the identical request is refused", replay.status === 409, `status=${replay.status}`);
  ok("DOUBLE SUBMIT — still exactly one escalation", (await prisma.complaintEscalation.count({ where: { complaintId: complaint.id } })) === 1);

  // Contract guards.
  const fresh = await prisma.complaint.findUniqueOrThrow({ where: { id: complaint.id }, select: { revision: true } });
  const noDest = await call("POST", `/complaints/${complaint.id}/escalate`, { revision: fresh.revision, reason: `${TAG} r` });
  ok("VALIDATION — a destination is REQUIRED by the contract", noDest.status === 400 || noDest.status === 422, `status=${noDest.status}`);
  const noReason = await call("POST", `/complaints/${complaint.id}/escalate`, { revision: fresh.revision, reason: "", targetDepartmentId: destination.departmentId });
  ok("VALIDATION — an empty reason is refused", noReason.status === 400 || noReason.status === 422, `status=${noReason.status}`);
  const badDept = await call("POST", `/complaints/${complaint.id}/escalate`, { revision: fresh.revision, reason: `${TAG} r`, targetDepartmentId: 99_999_999 });
  ok("VALIDATION — an unknown destination is refused", badDept.status === 422, `status=${badDept.status}`);

  const saved = token;
  token = "";
  const anon = await call("POST", `/complaints/${complaint.id}/escalate`, { revision: fresh.revision, reason: `${TAG} r`, targetDepartmentId: destination.departmentId });
  ok("PERMISSION — an unauthenticated caller is refused", anon.status === 401, `status=${anon.status}`);
  token = saved;

  console.log(`\n${pass}/${pass + fail} passed`);
  return fail === 0;
}

main()
  .then(async (allOk) => {
    await cleanup();
    console.log("cleanup done");
    await prisma.$disconnect();
    process.exit(allOk ? 0 : 1);
  })
  .catch(async (e) => {
    console.error(e);
    await cleanup().catch(() => {});
    await prisma.$disconnect();
    process.exit(1);
  });
