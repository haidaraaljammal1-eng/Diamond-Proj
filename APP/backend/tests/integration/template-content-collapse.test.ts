import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

/**
 * The collapsed single-template content flow (versioning hidden from the UX).
 * Proves end-to-end:
 *   - Saving content via the template-level endpoint publishes it in one step.
 *   - GET /:id/content returns the live content (no version chrome).
 *   - Editing a template creates a NEW live version; the PREVIOUS one stays frozen
 *     & immutable (so a message already sent from it keeps its exact content).
 *   - Permissions are preserved: read can view content; only manage can save.
 *
 * Only runs with RUN_INTEGRATION=true + a disposable test DATABASE_URL.
 */
const RUN = process.env.RUN_INTEGRATION === "true";

if (!RUN) {
  test("template-content-collapse skipped (set RUN_INTEGRATION=true + a test DATABASE_URL)", {
    skip: true,
  });
} else {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  const run = Date.now().toString(36).toUpperCase();

  const mgr = { email: `tpl-mgr-${run}@example.test`, password: "tpl-mgr-pass-123" };
  const reader = { email: `tpl-read-${run}@example.test`, password: "tpl-read-pass-123" };
  let mgrTok = "";
  let readerTok = "";
  let templateId = 0;
  let versionA = 0;
  let versionB = 0;

  async function seedUser(email: string, password: string, roleKey: string, permKeys: string[]) {
    const { hashPassword } = await import("src/lib/security/password");
    const { normalizeEmail } = await import("src/lib/security/normalize");
    const canonicalEmail = normalizeEmail(email);
    const role = await prisma.role.upsert({
      where: { key: roleKey },
      update: {},
      create: { key: roleKey, name: roleKey },
    });
    for (const key of permKeys) {
      const perm = await prisma.permission.upsert({
        where: { key },
        update: {},
        create: { key, category: key.split(".")[0], description: key },
      });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.upsert({
      where: { email: canonicalEmail },
      update: { status: "ACTIVE", passwordHash },
      create: { email: canonicalEmail, name: roleKey, status: "ACTIVE", passwordHash },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }

  async function login(creds: { email: string; password: string }) {
    const res = await app.inject({ method: "POST", url: "/auth/login", payload: creds });
    assert.equal(res.statusCode, 200);
    return res.json().data.accessToken as string;
  }

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  const emailVariant = (subject: string, body: string) => ({
    variants: [
      { language: "en", subject, bodyHtml: `<p>${body}</p>`, bodyText: body },
    ],
  });

  before(async () => {
    const { buildApp } = await import("src/app");
    app = await buildApp();
    prisma = app.prisma;
    await seedUser(mgr.email, mgr.password, `tpl_mgr_${run}`, [
      "communication_templates.read",
      "communication_templates.manage",
    ]);
    await seedUser(reader.email, reader.password, `tpl_read_${run}`, [
      "communication_templates.read",
    ]);
    mgrTok = await login(mgr);
    readerTok = await login(reader);

    const created = await app.inject({
      method: "POST",
      url: "/communication-templates",
      headers: auth(mgrTok),
      payload: { code: `TPL-${run}`, name: "Collapse Test", channel: "EMAIL" },
    });
    assert.equal(created.statusCode, 201);
    templateId = created.json().data.id;
  });

  after(async () => {
    if (app) await app.close();
  });

  test("save content publishes it in one step; getContent returns it (no version chrome)", async () => {
    const saved = await app.inject({
      method: "PUT",
      url: `/communication-templates/${templateId}/content`,
      headers: auth(mgrTok),
      payload: emailVariant("Subject A", "Body A"),
    });
    assert.equal(saved.statusCode, 200);
    const data = saved.json().data;
    assert.ok(data.currentVersionId, "template should now have a live version");
    versionA = data.currentVersionId;
    assert.equal(data.variants[0].subject, "Subject A");
    // The projection is template-shaped — no versionNumber/status leaks to the client.
    assert.ok(!("versionNumber" in data));
    assert.ok(!("status" in data));

    const got = await app.inject({
      method: "GET",
      url: `/communication-templates/${templateId}/content`,
      headers: auth(mgrTok),
    });
    assert.equal(got.statusCode, 200);
    assert.equal(got.json().data.variants[0].subject, "Subject A");
  });

  test("editing creates a NEW live version; the old one stays FROZEN (historical safety)", async () => {
    const saved = await app.inject({
      method: "PUT",
      url: `/communication-templates/${templateId}/content`,
      headers: auth(mgrTok),
      payload: emailVariant("Subject B", "Body B"),
    });
    assert.equal(saved.statusCode, 200);
    versionB = saved.json().data.currentVersionId;
    assert.notEqual(versionB, versionA, "an edit must produce a NEW version");

    // The live content is the new one...
    const got = await app.inject({
      method: "GET",
      url: `/communication-templates/${templateId}/content`,
      headers: auth(mgrTok),
    });
    assert.equal(got.json().data.variants[0].subject, "Subject B");

    // ...but the OLD version (which a message sent earlier would be bound to) keeps
    // its exact original content — this is the historical snapshot.
    const oldVersion = await app.inject({
      method: "GET",
      url: `/communication-template-versions/${versionA}`,
      headers: auth(mgrTok),
    });
    assert.equal(oldVersion.statusCode, 200);
    assert.equal(
      oldVersion.json().data.variants[0].subject,
      "Subject A",
      "the previously-sent version must NOT change when the template is edited",
    );

    // Version bookkeeping (internal): old superseded, new published + current.
    const vA = await prisma.messageTemplateVersion.findUnique({ where: { id: versionA } });
    const vB = await prisma.messageTemplateVersion.findUnique({ where: { id: versionB } });
    const tpl = await prisma.messageTemplate.findUnique({ where: { id: templateId } });
    assert.equal(vA?.status, "SUPERSEDED");
    assert.equal(vB?.status, "PUBLISHED");
    assert.equal(tpl?.currentVersionId, versionB);
  });

  test("permissions preserved: read can VIEW content, only manage can SAVE", async () => {
    const readView = await app.inject({
      method: "GET",
      url: `/communication-templates/${templateId}/content`,
      headers: auth(readerTok),
    });
    assert.equal(readView.statusCode, 200, "a reader may view template content");

    const readSave = await app.inject({
      method: "PUT",
      url: `/communication-templates/${templateId}/content`,
      headers: auth(readerTok),
      payload: emailVariant("Subject C", "Body C"),
    });
    assert.equal(readSave.statusCode, 403, "a reader must NOT be able to save content");

    // The blocked save left the live content unchanged.
    const still = await app.inject({
      method: "GET",
      url: `/communication-templates/${templateId}/content`,
      headers: auth(mgrTok),
    });
    assert.equal(still.json().data.variants[0].subject, "Subject B");
  });
}
