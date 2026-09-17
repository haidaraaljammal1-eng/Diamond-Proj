import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { imageMultipart, injectDocumentOcr, seedReadyIdentity, TEST_PNG } from "../helpers/public-identity";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test(
    "official contract interactive integration skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)",
    { skip: true },
  );
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("official contract — interactive paper, signatures, signing", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = `OCI${Date.now().toString(36).toUpperCase()}`;
    const admin = { email: `oci-admin-${run}@example.test`, password: "oci-admin-pass-123" };
    let staffToken = "";
    const auth = () => ({ authorization: `Bearer ${staffToken}` });

    let seq = 0;
    async function offer() {
      seq += 1;
      const vehicle = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(),
        payload: { vehicleName: `OCI-${run}-${seq}`, plateNumber: `C${run}${seq}`.slice(0, 20), dailyRate: 300, color: "Grey", modelYear: 2023 },
      });
      assert.equal(vehicle.statusCode, 201, vehicle.body);
      const created = await app.inject({
        method: "POST",
        url: "/contracts/offers",
        headers: auth(),
        payload: { vehicleId: vehicle.json().data.id, priceType: "WEEKLY", rentalDays: 7, agreedAmount: 2100 },
      });
      assert.equal(created.statusCode, 201, created.body);
      const contractId = created.json().data.id as string;
      const link = await app.inject({ method: "POST", url: `/contracts/${contractId}/rental-link`, headers: auth() });
      return { contractId, vehicleId: vehicle.json().data.id as number, token: link.json().data.link.token as string };
    }

    const url = (token: string, suffix = "") => `/contracts/rental/${token}/official-contract${suffix}`;
    const get = (token: string) => app.inject({ method: "GET", url: url(token) });
    const patch = (token: string, payload: Record<string, unknown>) =>
      app.inject({ method: "PATCH", url: url(token), payload });
    const sign = (token: string) => app.inject({ method: "POST", url: url(token, "/sign"), payload: {} });
    function putSignature(token: string, slot: string, file = imageMultipart("sig.png", "image/png", TEST_PNG)) {
      return app.inject({ method: "PUT", url: url(token, `/signatures/${slot}`), headers: file.headers, payload: file.payload });
    }

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("official contract interactive integration refuses to run unless DATABASE_URL is haidara_test");
      }
      const { buildApp } = await import("src/app");
      const { hashPassword } = await import("src/lib/security/password");
      const { normalizeEmail } = await import("src/lib/security/normalize");
      app = await buildApp();
      prisma = app.prisma;
      const role = await prisma.role.create({ data: { key: `oci_admin_${run}`, name: "oci admin" } });
      for (const key of ["vehicles.read", "vehicles.manage", "contracts.read", "contracts.manage"]) {
        const perm = await prisma.permission.upsert({ where: { key }, update: {}, create: { key, category: key.split(".")[0]!, description: key } });
        await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
      }
      const user = await prisma.user.create({
        data: { email: normalizeEmail(admin.email), name: "oci admin", status: "ACTIVE", passwordHash: await hashPassword(admin.password) },
      });
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
      staffToken = (await app.inject({ method: "POST", url: "/auth/login", payload: admin })).json().data.accessToken;
    });

    after(async () => {
      await injectDocumentOcr(undefined);
      if (app) await app.close();
    });

    test("staff-owned terms: plate code, notes, km terms — staff sets, customer reads, customer cannot write", async () => {
      const ctx = await offer();
      await seedReadyIdentity(app, ctx.token);

      const unauth = await app.inject({
        method: "PATCH",
        url: `/contracts/${ctx.contractId}/official-contract/terms`,
        payload: { plateCode: "Q" },
      });
      assert.equal(unauth.statusCode, 401);

      const staff = await app.inject({
        method: "PATCH",
        url: `/contracts/${ctx.contractId}/official-contract/terms`,
        headers: auth(),
        payload: { plateCode: "DUBAI T", contractNotes: "No smoking", includedKmPerDay: 250, extraKmRate: 0.75 },
      });
      assert.equal(staff.statusCode, 200, staff.body);

      const v = (await get(ctx.token)).json().data;
      assert.equal(v.vehicle.plateCode, "DUBAI T");
      assert.equal(v.vehicle.notes, "No smoking");
      assert.equal(v.rental.includedKmPerDay, 250);
      assert.equal(v.rental.extraKmRate, 0.75);

      for (const payload of [{ plateCode: "HACK" }, { contractNotes: "x" }, { includedKmPerDay: 9999 }, { extraKmRate: 0 }, { damageIn: [] }]) {
        const res = await patch(ctx.token, payload);
        assert.equal(res.statusCode, 422, `${JSON.stringify(payload)} ${res.body}`);
      }
      const bad = await app.inject({
        method: "PATCH",
        url: `/contracts/${ctx.contractId}/official-contract/terms`,
        headers: auth(),
        payload: { extraKmRate: 0.755 },
      });
      assert.equal(bad.statusCode, 422);
    });

    test("review link is read-only: personal text fields rejected; card/damage keys are schema-locked", async () => {
      const ctx = await offer();
      await seedReadyIdentity(app, ctx.token);
      // Schema-valid personal keys are service-locked because the review link is
      // a check + signature only (editableFields is empty).
      for (const payload of [
        { hirerName: "EDITED" },
        { telephone: "+971 50 000 0000" },
        { sponsorName: "X" },
      ]) {
        const res = await patch(ctx.token, payload);
        assert.equal(res.statusCode, 403, `${JSON.stringify(payload)} ${res.body}`);
        assert.equal(res.json().error.context.reason, "OFFICIAL_CONTRACT_FIELD_LOCKED");
      }
      // Card metadata and damage marks no longer exist on the review PATCH: the
      // schema itself rejects them (mass-assignment guard).
      for (const payload of [
        { cardNumberLast4: "4817", address: "X" },
        { damageOut: [{ zone: "TOP.HOOD", type: "SCRATCH" }] },
      ]) {
        const res = await patch(ctx.token, payload);
        assert.equal(res.statusCode, 422, `${JSON.stringify(payload)} ${res.body}`);
      }
      const view = (await get(ctx.token)).json().data;
      assert.deepEqual(view.permissions.editableFields, []);
      assert.equal(view.permissions.canMarkDamageOut, false);
      assert.deepEqual(view.permissions.signableSlots, ["HIRER", "ADDITIONAL_DRIVER", "SPONSOR"]);

      const staffIn = await app.inject({
        method: "PATCH",
        url: `/contracts/${ctx.contractId}/official-contract/terms`,
        headers: auth(),
        payload: { damageIn: [{ zone: "FRONT_REAR.BUMPER", type: "BROKEN" }] },
      });
      assert.equal(staffIn.statusCode, 200, staffIn.body);
      assert.deepEqual(staffIn.json().data.vehicleIn.damage, [{ zone: "FRONT_REAR.BUMPER", type: "BROKEN" }]);
    });

    test("card boxes are display-only: metadata comes from Stripe-hosted linking; PAN/CVV never enter the review link", async () => {
      const ctx = await offer();
      await seedReadyIdentity(app, ctx.token);
      // No card key is accepted anywhere on the review link (A4 boxes are display-only).
      assert.equal((await patch(ctx.token, { cardNumberLast4: "4242424242424242" })).statusCode, 422);
      assert.equal((await patch(ctx.token, { cardNumberLast4: "42a2" })).statusCode, 422);
      assert.equal((await patch(ctx.token, { cardNumber: "4242424242424242" })).statusCode, 422);
      assert.equal((await patch(ctx.token, { cardNumberLast4: "4817" })).statusCode, 422);

      // Stripe-hosted card linking (webhook) is the only writer: safe metadata only.
      await prisma.contractCardPaymentMethod.create({
        data: {
          contractId: ctx.contractId,
          provider: "stripe",
          stripeCustomerId: "cus_test_1",
          stripePaymentMethodId: "pm_test_1",
          cardBrand: "visa",
          cardLast4: "4817",
        },
      });

      const view = (await get(ctx.token)).json().data;
      assert.deepEqual(view.card, { last4: "4817" });
      assert.equal(JSON.stringify(view).includes("4242424242424242"), false, "no full PAN in the view");
      assert.equal(JSON.stringify(view).includes("stripePaymentMethodId"), false, "no provider reference leakage");
      assert.equal(JSON.stringify(view).toLowerCase().includes("cvv"), false);

      const row = await prisma.contractCardPaymentMethod.findUniqueOrThrow({ where: { contractId: ctx.contractId } });
      assert.equal(row.cardLast4, "4817");
      assert.equal(row.cardBrand, "visa");
      assert.equal(row.stripePaymentMethodId, "pm_test_1");

      const audit = JSON.stringify(await prisma.auditLog.findMany({ where: { entityId: ctx.contractId } }));
      const outbox = JSON.stringify(await prisma.domainOutboxEvent.findMany({ where: { aggregateId: ctx.contractId } }));
      assert.equal(audit.includes("4817"), false, "digits never reach audit");
      assert.equal(outbox.includes("4817"), false, "digits never reach outbox");
    });

    test("signatures: PNG capture/replace/clear, token-scoped stream, lifecycle-locked slots", async () => {
      const ctx = await offer();
      await seedReadyIdentity(app, ctx.token);

      const png = await putSignature(ctx.token, "hirer");
      assert.equal(png.statusCode, 200, png.body);
      const v = png.json().data;
      assert.equal(v.signatures.hirer.status, "SIGNED");
      assert.equal(v.signatures.hirer.hasImage, true);
      assert.equal(png.body.includes("storageKey"), false);

      const stream = await app.inject({ method: "GET", url: url(ctx.token, "/signatures/hirer") });
      assert.equal(stream.statusCode, 200);
      assert.equal(stream.headers["content-type"], "image/png");
      assert.equal(stream.headers["cache-control"], "private, no-store");

      const replaced = await putSignature(ctx.token, "hirer");
      assert.equal(replaced.statusCode, 200);
      assert.equal(await prisma.officialContractSignature.count({ where: { contractId: ctx.contractId, slot: "HIRER" } }), 1);

      const jpeg = await putSignature(ctx.token, "sponsor", imageMultipart("s.jpg", "image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46])));
      assert.equal(jpeg.statusCode, 422, jpeg.body);
      const svg = await putSignature(ctx.token, "sponsor", imageMultipart("s.svg", "image/svg+xml", Buffer.from("<svg/>")));
      assert.equal(svg.statusCode, 422);

      for (const custodySlot of ["vehicle-out-hirer", "vehicle-in-hirer"]) {
        const res = await putSignature(ctx.token, custodySlot);
        assert.equal(res.statusCode, 409);
        assert.equal(res.json().error.context.reason, "OFFICIAL_SIGNATURE_SLOT_UNAVAILABLE");
      }

      const cleared = await app.inject({ method: "DELETE", url: url(ctx.token, "/signatures/hirer") });
      assert.equal(cleared.json().data.signatures.hirer.status, "NOT_SIGNED");
      assert.equal((await app.inject({ method: "GET", url: url(ctx.token, "/signatures/hirer") })).statusCode, 404);

      const other = await offer();
      await seedReadyIdentity(app, other.token);
      await putSignature(other.token, "hirer");
      assert.equal((await app.inject({ method: "GET", url: url(ctx.token, "/signatures/hirer") })).statusCode, 404, "no cross-contract access");
    });

    test("sign: requires identity, required signatures (conditional additional driver/sponsor), then SIGNED with frozen snapshot", async () => {
      const early = await offer();
      const blocked = await sign(early.token);
      assert.equal(blocked.statusCode, 409);
      assert.equal(blocked.json().error.context.reason, "CONTRACT_IDENTITY_NOT_READY");

      const ctx = await offer();
      await seedReadyIdentity(app, ctx.token);
      const vehicleBefore = await prisma.vehicle.findUniqueOrThrow({ where: { id: ctx.vehicleId } });
      const customersBefore = await prisma.customer.count();

      let res = await sign(ctx.token);
      assert.equal(res.statusCode, 409, res.body);
      assert.equal(res.json().error.context.reason, "OFFICIAL_CONTRACT_INCOMPLETE");
      assert.deepEqual(res.json().error.context.missing, ["SIGNATURE_HIRER"]);

      await putSignature(ctx.token, "hirer");
      // Stripe-hosted linking already persisted the safe card reference before signing.
      await prisma.contractCardPaymentMethod.create({
        data: {
          contractId: ctx.contractId,
          provider: "stripe",
          stripeCustomerId: "cus_snap_1",
          stripePaymentMethodId: "pm_snap_1",
          cardBrand: "mastercard",
          cardLast4: "4817",
        },
      });
      await prisma.officialContractReviewDraft.update({ where: { contractId: ctx.contractId }, data: { sponsorName: "TEST SPONSOR" } });
      const view = (await get(ctx.token)).json().data;
      assert.equal(view.signatures.sponsor.required, true);
      assert.equal(view.signatures.additionalDriver.required, false);
      assert.equal(view.permissions.canSign, false);
      res = await sign(ctx.token);
      assert.deepEqual(res.json().error.context.missing, ["SIGNATURE_SPONSOR"]);

      await putSignature(ctx.token, "sponsor");
      res = await sign(ctx.token);
      assert.equal(res.statusCode, 200, res.body);
      const signed = res.json().data;
      assert.equal(signed.contract.status, "SIGNED");
      assert.equal(signed.permissions.canEdit, false);
      assert.equal(signed.permissions.canSign, false);
      assert.equal(signed.vehicleOut.signatureStatus, "NOT_SIGNED", "Vehicle OUT is signed at Car-Out");

      const contract = await prisma.contract.findUniqueOrThrow({ where: { id: ctx.contractId }, include: { acceptance: true } });
      assert.equal(contract.status, "SIGNED");
      assert.equal(contract.customerId, null, "no Customer created");
      assert.equal(await prisma.customer.count(), customersBefore);
      const hirerSig = await prisma.officialContractSignature.findUniqueOrThrow({
        where: { contractId_slot: { contractId: ctx.contractId, slot: "HIRER" } },
      });
      assert.equal(contract.acceptance?.signatureAttachmentId, hirerSig.attachmentId);
      const snapshot = contract.snapshot as { officialContract: { hirer: { name: string }; card: { last4: string } } };
      assert.equal(snapshot.officialContract.hirer.name, "TEST PERSON");
      assert.equal(snapshot.officialContract.card.last4, "4817");
      assert.equal(JSON.stringify(snapshot.officialContract).includes("agreedAmount"), false);

      const vehicleAfter = await prisma.vehicle.findUniqueOrThrow({ where: { id: ctx.vehicleId } });
      assert.equal(vehicleAfter.operationalStatus, vehicleBefore.operationalStatus);
      assert.equal(await prisma.contractPayment.count({ where: { contractId: ctx.contractId } }), 0);

      // Locked after signing; the legal content stays frozen.
      assert.equal((await patch(ctx.token, { sponsorName: "Y" })).statusCode, 409);
      assert.equal((await putSignature(ctx.token, "hirer")).statusCode, 409);
      assert.equal((await sign(ctx.token)).statusCode, 409);
      await prisma.officialContractReviewDraft.update({ where: { contractId: ctx.contractId }, data: { hirerName: "TAMPERED" } });
      const frozen = (await get(ctx.token)).json().data;
      assert.equal(frozen.hirer.name, "TEST PERSON");

      const rental = await app.inject({ method: "GET", url: `/contracts/rental/${ctx.token}` });
      assert.equal(rental.json().data.flow.step, "PAYMENT");

      const audit = JSON.stringify(await prisma.auditLog.findMany({ where: { entityId: ctx.contractId } }));
      assert.equal(audit.includes("TEST PERSON"), false);
      assert.equal(audit.includes("base64"), false);
    });
  });
}
