import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

// BE-4 close-out: complaint notification settings (event × channel preferences),
// optimistic-locked, provider-availability honest. Requires complaint_notifications.manage.
const RUN = process.env.RUN_INTEGRATION === "true";

if (!RUN) {
  test("complaint notification-settings integration skipped (set RUN_INTEGRATION=true)", { skip: true }, () => {});
} else {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  const run = Date.now().toString(36).toUpperCase() + "NS";
  let manageT = "", noPermT = "";

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

  before(async () => {
    const { buildApp } = await import("src/app");
    app = await buildApp();
    prisma = app.prisma;
    const manageId = await seedUser(`ns-mgr-${run}@ex.test`, `ns_mgr_${run}`, ["complaint_notifications.manage"]);
    const noPermId = await seedUser(`ns-none-${run}@ex.test`, `ns_none_${run}`, ["complaints.read"]);
    manageT = app.jwt.sign({ sub: manageId, type: "access" });
    noPermT = app.jwt.sign({ sub: noPermId, type: "access" });
  });
  after(async () => { if (app) await app.close(); });

  test("list returns the full event × channel matrix with honest availability", async () => {
    const res = await app.inject({ method: "GET", url: "/complaint-notification-settings", headers: auth(manageT) });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json().data;
    assert.equal(body.settings.length, 44, "11 events × 4 channels");
    const channelAvail = Object.fromEntries(body.channels.map((c: { channel: string; availability: string }) => [c.channel, c.availability]));
    assert.equal(channelAvail.IN_APP, "CONFIGURED", "in-app always delivers");
    assert.equal(channelAvail.WHATSAPP, "NOT_CONFIGURED", "no whatsapp provider in this build");
    assert.equal(channelAvail.SMS, "NOT_CONFIGURED", "no sms provider in this build");
    assert.equal(channelAvail.EMAIL, "NOT_CONFIGURED", "email disabled in test env");
  });

  test("read is permission-gated (403 without complaint_notifications.manage)", async () => {
    const res = await app.inject({ method: "GET", url: "/complaint-notification-settings", headers: auth(noPermT) });
    assert.equal(res.statusCode, 403);
  });

  test("update toggles a cell + persists (optimistic revision advances)", async () => {
    const put = await app.inject({ method: "PUT", url: "/complaint-notification-settings/complaint.created", headers: auth(manageT), payload: { channel: "EMAIL", enabled: true, revision: 0 } });
    assert.equal(put.statusCode, 200, put.body);
    assert.equal(put.json().data.enabled, true);
    assert.equal(put.json().data.revision, 1, "revision advanced");
    assert.equal(put.json().data.availability, "NOT_CONFIGURED", "enabling email never claims it is connected");
    // Persisted on next read.
    const list = await app.inject({ method: "GET", url: "/complaint-notification-settings", headers: auth(manageT) });
    const cell = list.json().data.settings.find((s: { eventKey: string; channel: string }) => s.eventKey === "complaint.created" && s.channel === "EMAIL");
    assert.equal(cell.enabled, true);
    assert.equal(cell.revision, 1);
  });

  test("write is permission-gated (403 without manage)", async () => {
    const res = await app.inject({ method: "PUT", url: "/complaint-notification-settings/complaint.created", headers: auth(noPermT), payload: { channel: "IN_APP", enabled: false, revision: 0 } });
    assert.equal(res.statusCode, 403);
  });

  test("unknown event key is rejected (422, no arbitrary events)", async () => {
    const res = await app.inject({ method: "PUT", url: "/complaint-notification-settings/complaint.bogus_event", headers: auth(manageT), payload: { channel: "IN_APP", enabled: true, revision: 0 } });
    assert.equal(res.statusCode, 422);
    assert.equal(res.json().error.context.reason, "complaint_notification_invalid_event");
  });

  test("unknown channel is rejected by schema validation", async () => {
    const res = await app.inject({ method: "PUT", url: "/complaint-notification-settings/complaint.created", headers: auth(manageT), payload: { channel: "TELEPATHY", enabled: true, revision: 0 } });
    assert.ok([400, 422].includes(res.statusCode), `expected schema rejection, got ${res.statusCode}`);
  });

  test("stale revision yields a guided conflict (409)", async () => {
    // First establish a known revision on a fresh cell.
    const first = await app.inject({ method: "PUT", url: "/complaint-notification-settings/complaint.assigned", headers: auth(manageT), payload: { channel: "IN_APP", enabled: false, revision: 0 } });
    assert.equal(first.statusCode, 200, first.body);
    // Now submit against the stale revision 0 again.
    const stale = await app.inject({ method: "PUT", url: "/complaint-notification-settings/complaint.assigned", headers: auth(manageT), payload: { channel: "IN_APP", enabled: true, revision: 0 } });
    assert.equal(stale.statusCode, 409, stale.body);
    assert.equal(stale.json().error.context.reason, "complaint_notification_setting_conflict");
  });

  test("enabling a NOT_CONFIGURED channel stays honest (availability unchanged)", async () => {
    const put = await app.inject({ method: "PUT", url: "/complaint-notification-settings/complaint.escalated", headers: auth(manageT), payload: { channel: "WHATSAPP", enabled: true, revision: 0 } });
    assert.equal(put.statusCode, 200, put.body);
    assert.equal(put.json().data.enabled, true, "preference stored");
    assert.equal(put.json().data.availability, "NOT_CONFIGURED", "provider readiness is never faked to CONFIGURED");
  });
}
