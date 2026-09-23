import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient, RoadLiabilityType } from "@prisma/client";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

/**
 * Road-liability charge review. Requires RUN_INTEGRATION=true and
 * TEST_DATABASE_URL pointing at disposable haidara_test — never Development haidara.
 */
const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test(
    "road-liability charge review integration skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)",
    { skip: true },
  );
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("road liability charge review", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    const admin = { email: `rlc-admin-${run}@example.test`, password: "rlc-admin-pass-123" };
    const stranger = { email: `rlc-stranger-${run}@example.test`, password: "rlc-stranger-pass-123" };
    let adminToken = "";
    let strangerToken = "";
    let adminUserId = 0;
    let vehicleId = 0;
    let customerId = 0;
    let seq = 0;

    async function seedUser(email: string, password: string, roleKey: string, perms: string[]) {
      const { hashPassword } = await import("src/lib/security/password");
      const { normalizeEmail } = await import("src/lib/security/normalize");
      const canonicalEmail = normalizeEmail(email);
      const role = await prisma.role.upsert({
        where: { key: roleKey },
        update: {},
        create: { key: roleKey, name: roleKey },
      });
      for (const key of perms) {
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
      await prisma.user.upsert({
        where: { email: canonicalEmail },
        update: { status: "ACTIVE", passwordHash },
        create: { email: canonicalEmail, name: roleKey, status: "ACTIVE", passwordHash },
      });
      const user = await prisma.user.findUniqueOrThrow({ where: { email: canonicalEmail } });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
      return user.id;
    }

    async function login(creds: { email: string; password: string }) {
      const res = await app.inject({ method: "POST", url: "/auth/login", payload: creds });
      assert.equal(res.statusCode, 200, res.body);
      return res.json().data.accessToken as string;
    }

    const auth = (token: string) => ({ authorization: `Bearer ${token}` });

    async function seedReviewContract() {
      seq += 1;
      const contract = await prisma.contract.create({
        data: {
          companyId: await testCompanyId(prisma),
          contractNumber: `RLC-${run}-${seq}`,
          status: "REVIEW",
          vehicleId,
          customerId,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 3,
          agreedAmount: 1500,
          collectionMode: "ELECTRONIC",
          depositAmount: 500,
          carOut: {
            create: {
              performedByUserId: adminUserId,
              occurredAt: new Date("2026-09-01T08:00:00.000Z"),
              mileageOut: 10,
              fuelOut: "F",
            },
          },
          carIn: {
            create: {
              occurredAt: new Date("2026-09-04T08:00:00.000Z"),
              mileageIn: 80,
              fuelIn: "1/2",
            },
          },
        },
      });
      return contract;
    }

    async function seedLiability(input: {
      contractId: string | null;
      type?: RoadLiabilityType;
      amount?: number | null;
      confirmationStatus?: "PENDING_CONFIRMATION" | "CONFIRMED" | "REJECTED";
      attributionStatus?: "UNRESOLVED" | "MATCHED" | "UNMATCHED" | "AMBIGUOUS";
      collectionStatus?: "NOT_READY" | "OPEN" | "SETTLED" | "DISPUTED" | "VOID";
      gps?: boolean;
    }) {
      seq += 1;
      return prisma.roadLiability.create({
        data: {
          type: input.type ?? "RTA_VIOLATION",
          vehicleId,
          occurredAt: new Date("2026-09-02T12:00:00.000Z"),
          amount: input.amount === undefined ? 100 : input.amount,
          currency: input.amount === null ? null : "AED",
          authoritativeSourceKey: input.gps ? null : "RTA",
          authoritativeExternalReference: input.gps ? null : `RTA-${run}-${seq}`,
          confirmationStatus: input.confirmationStatus ?? "CONFIRMED",
          attributionStatus: input.attributionStatus ?? "MATCHED",
          collectionStatus: input.collectionStatus ?? "OPEN",
          attributedContractId: input.contractId,
          confirmedAt: input.confirmationStatus === "PENDING_CONFIRMATION" ? null : new Date(),
          observations: input.gps
            ? {
                create: {
                  sourceKey: "GPS_INFERENCE",
                  authoritative: false,
                  ingestionFingerprint: `gps-${run}-${seq}`,
                  eventType: input.type ?? "SALIK_TOLL",
                  vehicleId,
                  occurredAt: new Date("2026-09-02T12:00:00.000Z"),
                  receivedAt: new Date("2026-09-02T12:00:01.000Z"),
                },
              }
            : undefined,
        },
      });
    }

    function confirmUrl(contractId: string, roadLiabilityId: string) {
      return `/contracts/${contractId}/reconciliation/road-liabilities/${roadLiabilityId}/confirm-charge`;
    }

    function listUrl(contractId: string) {
      return `/contracts/${contractId}/reconciliation/road-liabilities`;
    }

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error(
          "road-liability charge review refuses to run unless DATABASE_URL is haidara_test",
        );
      }
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      adminUserId = await seedUser(admin.email, admin.password, `rlc_admin_${run}`, [
        "vehicles.read",
        "vehicles.manage",
        "contracts.read",
        "contracts.reconcile",
        "contracts.close",
        "violations.read",
        "violations.charge",
      ]);
      await seedUser(stranger.email, stranger.password, `rlc_stranger_${run}`, ["vehicles.read"]);
      adminToken = await login(admin);
      strangerToken = await login(stranger);

      const vehicle = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(adminToken),
        payload: { companyId: await testCompanyId(prisma), vehicleName: `RLC ${run}`, plateNumber: `RLC ${run}`, dailyRate: 400 },
      });
      assert.equal(vehicle.statusCode, 201, vehicle.body);
      vehicleId = vehicle.json().data.id as number;
      const customer = await prisma.customer.create({ data: { name: `RLC Customer ${run}` } });
      customerId = customer.id;
    });

    after(async () => {
      await app.close();
    });

    test("confirmed matched OPEN liability is accepted at official amount", async () => {
      const contract = await seedReviewContract();
      const liability = await seedLiability({ contractId: contract.id });
      const res = await app.inject({
        method: "POST",
        url: confirmUrl(contract.id, liability.id),
        headers: auth(adminToken),
        payload: { customerChargeAmount: 100 },
      });
      assert.equal(res.statusCode, 200, res.body);
      const line = res.json().data.reconciliation.lines[0];
      assert.equal(line.amount, 100);
      assert.equal(line.officialAmountSnapshot, 100);
      assert.equal(line.adjustmentAmount, 0);
      assert.equal(line.roadLiabilityId, liability.id);
      assert.equal(line.type, "VIOLATION");
      assert.equal(res.json().data.reconciliation.chargesTotal, 100);
      const fresh = await prisma.roadLiability.findUniqueOrThrow({ where: { id: liability.id } });
      assert.equal(fresh.amount, 100);
      assert.equal(fresh.collectionStatus, "OPEN");
      assert.equal(res.json().data.status, "REVIEW");
    });

    test("GPS pending, unmatched, and ambiguous liabilities are rejected", async () => {
      const contract = await seedReviewContract();
      const gps = await seedLiability({
        contractId: contract.id,
        type: "SALIK_TOLL",
        amount: null,
        confirmationStatus: "PENDING_CONFIRMATION",
        collectionStatus: "NOT_READY",
        gps: true,
      });
      const unmatched = await seedLiability({
        contractId: contract.id,
        attributionStatus: "UNMATCHED",
      });
      const ambiguous = await seedLiability({
        contractId: contract.id,
        attributionStatus: "AMBIGUOUS",
      });
      for (const id of [gps.id, unmatched.id, ambiguous.id]) {
        const res = await app.inject({
          method: "POST",
          url: confirmUrl(contract.id, id),
          headers: auth(adminToken),
          payload: { customerChargeAmount: 100 },
        });
        assert.equal(res.statusCode, 409, res.body);
        assert.equal(res.json().error.context.reason, "ROAD_LIABILITY_NOT_CHARGEABLE");
      }
    });

    test("liability attributed to another contract is rejected", async () => {
      const a = await seedReviewContract();
      const b = await seedReviewContract();
      const liability = await seedLiability({ contractId: b.id });
      const res = await app.inject({
        method: "POST",
        url: confirmUrl(a.id, liability.id),
        headers: auth(adminToken),
        payload: { customerChargeAmount: 100 },
      });
      assert.equal(res.statusCode, 409, res.body);
      assert.equal(res.json().error.context.reason, "ROAD_LIABILITY_CONTRACT_MISMATCH");
    });

    test("increased customer charge snapshots adjustment and uses 120 in totals", async () => {
      const contract = await seedReviewContract();
      const liability = await seedLiability({ contractId: contract.id });
      const res = await app.inject({
        method: "POST",
        url: confirmUrl(contract.id, liability.id),
        headers: auth(adminToken),
        payload: { customerChargeAmount: 120, adjustmentReason: "Administration fee" },
      });
      assert.equal(res.statusCode, 200, res.body);
      const line = res.json().data.reconciliation.lines[0];
      assert.equal(line.amount, 120);
      assert.equal(line.officialAmountSnapshot, 100);
      assert.equal(line.adjustmentAmount, 20);
      assert.equal(line.adjustmentReason, "Administration fee");
      assert.equal(res.json().data.reconciliation.chargesTotal, 120);
      assert.equal(res.json().data.reconciliation.lines.length, 1);
      const fresh = await prisma.roadLiability.findUniqueOrThrow({ where: { id: liability.id } });
      assert.equal(fresh.amount, 100);
      assert.equal(fresh.collectionStatus, "OPEN");
    });

    test("customer charge below official and increase without reason are rejected", async () => {
      const contract = await seedReviewContract();
      const liability = await seedLiability({ contractId: contract.id });
      const below = await app.inject({
        method: "POST",
        url: confirmUrl(contract.id, liability.id),
        headers: auth(adminToken),
        payload: { customerChargeAmount: 80 },
      });
      assert.equal(below.statusCode, 422, below.body);
      assert.equal(below.json().error.context.reason, "CUSTOMER_CHARGE_BELOW_OFFICIAL");
      const noReason = await app.inject({
        method: "POST",
        url: confirmUrl(contract.id, liability.id),
        headers: auth(adminToken),
        payload: { customerChargeAmount: 120 },
      });
      assert.equal(noReason.statusCode, 422, noReason.body);
      assert.equal(noReason.json().error.context.reason, "ADJUSTMENT_REASON_REQUIRED");
    });

    test("same liability cannot create two lines; replay is idempotent; changed amount conflicts", async () => {
      const contract = await seedReviewContract();
      const liability = await seedLiability({ contractId: contract.id });
      const headers = { ...auth(adminToken), "idempotency-key": `rlc-${run}-${liability.id}` };
      const first = await app.inject({
        method: "POST",
        url: confirmUrl(contract.id, liability.id),
        headers,
        payload: { customerChargeAmount: 100 },
      });
      assert.equal(first.statusCode, 200, first.body);
      const replay = await app.inject({
        method: "POST",
        url: confirmUrl(contract.id, liability.id),
        headers,
        payload: { customerChargeAmount: 100 },
      });
      assert.equal(replay.statusCode, 200, replay.body);
      assert.equal(replay.json().data.reconciliation.lines.length, 1);

      const changed = await app.inject({
        method: "POST",
        url: confirmUrl(contract.id, liability.id),
        headers: { ...auth(adminToken), "idempotency-key": `rlc-${run}-${liability.id}-b` },
        payload: { customerChargeAmount: 120, adjustmentReason: "Administration fee" },
      });
      assert.equal(changed.statusCode, 409, changed.body);
      assert.equal(changed.json().error.context.reason, "ROAD_LIABILITY_ALREADY_CHARGED");

      await assert.rejects(async () => {
        await prisma.contractReconciliationLine.create({
          data: {
            reconciliationId: first.json().data.reconciliation.id,
            type: "VIOLATION",
            description: "duplicate",
            amount: 100,
            roadLiabilityId: liability.id,
          },
        });
      }, isUniqueViolation);

      const count = await prisma.contractReconciliationLine.count({
        where: { roadLiabilityId: liability.id },
      });
      assert.equal(count, 1);
    });

    test("concurrent confirmations create one line", async () => {
      const contract = await seedReviewContract();
      const liability = await seedLiability({ contractId: contract.id });
      const [a, b] = await Promise.all([
        app.inject({
          method: "POST",
          url: confirmUrl(contract.id, liability.id),
          headers: auth(adminToken),
          payload: { customerChargeAmount: 100 },
        }),
        app.inject({
          method: "POST",
          url: confirmUrl(contract.id, liability.id),
          headers: auth(adminToken),
          payload: { customerChargeAmount: 100 },
        }),
      ]);
      assert.equal(a.statusCode, 200, a.body);
      assert.equal(b.statusCode, 200, b.body);
      const count = await prisma.contractReconciliationLine.count({
        where: { roadLiabilityId: liability.id },
      });
      assert.equal(count, 1);
    });

    test("new manual SALIK and VIOLATION lines are rejected; DAMAGE FUEL LATE OTHER remain", async () => {
      const contract = await seedReviewContract();
      for (const type of ["SALIK", "VIOLATION"] as const) {
        const res = await app.inject({
          method: "POST",
          url: `/contracts/${contract.id}/reconcile`,
          headers: auth(adminToken),
          payload: { lines: [{ type, description: "manual", amount: 40 }] },
        });
        assert.equal(res.statusCode, 409, res.body);
        assert.equal(res.json().error.context.reason, "ROAD_LIABILITY_REQUIRED");
      }

      const allowed = await app.inject({
        method: "POST",
        url: `/contracts/${contract.id}/reconcile`,
        headers: auth(adminToken),
        payload: {
          lines: [
            { type: "DAMAGE", description: "bumper", amount: 100 },
            { type: "FUEL", description: "fuel", amount: 80 },
            { type: "LATE", description: "late", amount: 50 },
            { type: "OTHER", description: "cleaning", amount: 30 },
          ],
        },
      });
      assert.equal(allowed.statusCode, 200, allowed.body);
      assert.equal(allowed.json().data.reconciliation.chargesTotal, 260);

      const legacy = await prisma.contractReconciliationLine.create({
        data: {
          reconciliationId: allowed.json().data.reconciliation.id,
          type: "SALIK",
          description: "legacy manual salik",
          amount: 4,
        },
      });
      const detail = await app.inject({
        method: "GET",
        url: `/contracts/${contract.id}`,
        headers: auth(adminToken),
      });
      assert.equal(detail.statusCode, 200, detail.body);
      assert.ok(
        detail.json().data.reconciliation.lines.some((line: { id: string }) => line.id === legacy.id),
      );
    });

    test("available excludes attached and attached projection is locked", async () => {
      const contract = await seedReviewContract();
      const first = await seedLiability({ contractId: contract.id, type: "SALIK_TOLL" });
      const second = await seedLiability({ contractId: contract.id, type: "SALIK_VIOLATION" });
      const before = await app.inject({
        method: "GET",
        url: listUrl(contract.id),
        headers: auth(adminToken),
      });
      assert.equal(before.statusCode, 200, before.body);
      assert.equal(before.json().data.available.length, 2);
      assert.equal(before.json().data.attached.length, 0);
      assert.equal(before.json().data.available[0].suggestedCustomerChargeAmount, 100);
      assert.equal(before.json().data.available[0].minimumCustomerChargeAmount, 100);

      const confirm = await app.inject({
        method: "POST",
        url: confirmUrl(contract.id, first.id),
        headers: auth(adminToken),
        payload: { customerChargeAmount: 120, adjustmentReason: "Processing fee" },
      });
      assert.equal(confirm.statusCode, 200, confirm.body);

      const after = await app.inject({
        method: "GET",
        url: listUrl(contract.id),
        headers: auth(adminToken),
      });
      assert.equal(after.statusCode, 200, after.body);
      assert.equal(after.json().data.available.length, 1);
      assert.equal(after.json().data.available[0].id, second.id);
      assert.equal(after.json().data.attached.length, 1);
      assert.equal(after.json().data.attached[0].roadLiabilityId, first.id);
      assert.equal(after.json().data.attached[0].officialAmount, 100);
      assert.equal(after.json().data.attached[0].customerChargeAmount, 120);
      assert.equal(after.json().data.attached[0].adjustmentAmount, 20);
      assert.equal(after.json().data.attached[0].locked, true);
      const attachedLine = confirm.json().data.reconciliation.lines.find(
        (line: { roadLiabilityId: string | null }) => line.roadLiabilityId === first.id,
      );
      assert.equal(attachedLine?.type, "SALIK");

      const listed = await app.inject({
        method: "GET",
        url: `/road-liabilities/${first.id}`,
        headers: auth(adminToken),
      });
      assert.equal(listed.statusCode, 200, listed.body);
      assert.equal(listed.json().data.reconciliationAttached, true);
      assert.ok(listed.json().data.reconciliationLineId);
      assert.equal(listed.json().data.customerCharge.confirmed, true);
      assert.equal(listed.json().data.customerCharge.destination, "RECONCILIATION");

      const recon = await app.inject({
        method: "POST",
        url: `/contracts/${contract.id}/reconcile`,
        headers: auth(adminToken),
        payload: { lines: [{ type: "DAMAGE", description: "bumper", amount: 50 }] },
      });
      assert.equal(recon.statusCode, 200, recon.body);
      assert.equal(recon.json().data.reconciliation.chargesTotal, 170);
      assert.equal(
        recon.json().data.reconciliation.lines.filter((line: { roadLiabilityId: string | null }) =>
          Boolean(line.roadLiabilityId),
        ).length,
        1,
      );
    });

    test("contracts.reconcile is required and official amount cannot be supplied", async () => {
      const contract = await seedReviewContract();
      const liability = await seedLiability({ contractId: contract.id });
      const forbidden = await app.inject({
        method: "POST",
        url: confirmUrl(contract.id, liability.id),
        headers: auth(strangerToken),
        payload: { customerChargeAmount: 100 },
      });
      assert.equal(forbidden.statusCode, 403);
      const anon = await app.inject({
        method: "POST",
        url: confirmUrl(contract.id, liability.id),
        payload: { customerChargeAmount: 100 },
      });
      assert.ok(anon.statusCode === 401 || anon.statusCode === 403);
      const extra = await app.inject({
        method: "POST",
        url: confirmUrl(contract.id, liability.id),
        headers: auth(adminToken),
        payload: { customerChargeAmount: 100, officialAmount: 1 },
      });
      assert.ok(extra.statusCode === 400 || extra.statusCode === 422, extra.body);
    });

    test("unified charge review supports REVIEW reconciliation and CLOSED post-close", async () => {
      const reviewContract = await seedReviewContract();
      const gps = await seedLiability({
        contractId: reviewContract.id,
        type: "SALIK_TOLL",
        amount: null,
        confirmationStatus: "PENDING_CONFIRMATION",
        collectionStatus: "NOT_READY",
        gps: true,
      });
      const contractGet = await app.inject({
        method: "GET",
        url: `/contracts/${reviewContract.id}`,
        headers: auth(adminToken),
      });
      assert.equal(contractGet.statusCode, 200, contractGet.body);
      assert.equal(contractGet.json().data.roadLiabilitySignals.hasSalikGpsSignal, true);
      assert.equal(contractGet.json().data.roadLiabilitySignals.unconfirmedSalikGpsSignalCount, 1);
      const gpsReview = await app.inject({
        method: "GET",
        url: `/road-liabilities/${gps.id}/customer-charge`,
        headers: auth(adminToken),
      });
      assert.equal(gpsReview.statusCode, 200, gpsReview.body);
      assert.equal(gpsReview.json().data.state, "NOT_ELIGIBLE");
      assert.equal(gpsReview.json().data.reasonCode, "GPS_PENDING");

      const open = await seedLiability({ contractId: reviewContract.id });
      const available = await app.inject({
        method: "GET",
        url: `/road-liabilities/${open.id}/customer-charge`,
        headers: auth(adminToken),
      });
      assert.equal(available.json().data.state, "AVAILABLE");
      assert.equal(available.json().data.destination, "RECONCILIATION");
      const confirmed = await app.inject({
        method: "POST",
        url: `/road-liabilities/${open.id}/customer-charge/confirm`,
        headers: { ...auth(adminToken), "idempotency-key": `k-${open.id}` },
        payload: { customerChargeAmount: 100 },
      });
      assert.equal(confirmed.statusCode, 200, confirmed.body);
      assert.equal(confirmed.json().data.state, "LOCKED");
      assert.equal(confirmed.json().data.destination, "RECONCILIATION");
      const replay = await app.inject({
        method: "POST",
        url: `/road-liabilities/${open.id}/customer-charge/confirm`,
        headers: { ...auth(adminToken), "idempotency-key": `k-${open.id}` },
        payload: { customerChargeAmount: 100 },
      });
      assert.equal(replay.statusCode, 200, replay.body);
      const conflict = await app.inject({
        method: "POST",
        url: `/road-liabilities/${open.id}/customer-charge/confirm`,
        headers: auth(adminToken),
        payload: { customerChargeAmount: 130, adjustmentReason: "Administration fee" },
      });
      assert.equal(conflict.statusCode, 409);

      seq += 1;
      const closed = await prisma.contract.create({
        data: {
          companyId: await testCompanyId(prisma),
          contractNumber: `RLC-CL-${run}-${seq}`,
          status: "CLOSED",
          vehicleId,
          customerId,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 2,
          agreedAmount: 800,
          collectionMode: "ELECTRONIC",
          depositAmount: 200,
          closedAt: new Date("2026-09-04T12:00:00.000Z"),
          carOut: {
            create: {
              performedByUserId: adminUserId,
              occurredAt: new Date("2026-09-01T08:00:00.000Z"),
              mileageOut: 10,
              fuelOut: "F",
            },
          },
          carIn: {
            create: {
              occurredAt: new Date("2026-09-04T08:00:00.000Z"),
              mileageIn: 40,
              fuelIn: "1/2",
            },
          },
          reconciliation: {
            create: {
              chargesTotal: 350,
              depositAmount: 200,
              deductions: 200,
              finalAmount: 150,
              approvedAt: new Date("2026-09-04T11:00:00.000Z"),
              lines: {
                create: { type: "DAMAGE", description: "scuff", amount: 350 },
              },
            },
          },
        },
      });
      const late = await seedLiability({ contractId: closed.id });
      const lateReview = await app.inject({
        method: "GET",
        url: `/road-liabilities/${late.id}/customer-charge`,
        headers: auth(adminToken),
      });
      assert.equal(lateReview.json().data.state, "AVAILABLE");
      assert.equal(lateReview.json().data.destination, "POST_CLOSE_RECEIVABLE");
      const lateConfirm = await app.inject({
        method: "POST",
        url: `/road-liabilities/${late.id}/customer-charge/confirm`,
        headers: auth(adminToken),
        payload: { customerChargeAmount: 120, adjustmentReason: "Administration fee" },
      });
      assert.equal(lateConfirm.statusCode, 200, lateConfirm.body);
      assert.equal(lateConfirm.json().data.state, "LOCKED");
      assert.equal(lateConfirm.json().data.destination, "POST_CLOSE_RECEIVABLE");
      assert.ok(lateConfirm.json().data.postCloseReceivableId);
      assert.equal(lateConfirm.json().data.reconciliationLineId, null);

      const closedGet = await app.inject({
        method: "GET",
        url: `/contracts/${closed.id}`,
        headers: auth(adminToken),
      });
      assert.equal(closedGet.json().data.status, "CLOSED");
      assert.equal(closedGet.json().data.reconciliation.chargesTotal, 350);
      assert.equal(closedGet.json().data.postCloseReceivables.count, 1);
      assert.equal(closedGet.json().data.postCloseReceivables.openAmount, 120);

      const wrapper = await app.inject({
        method: "POST",
        url: confirmUrl(closed.id, late.id),
        headers: auth(adminToken),
        payload: { customerChargeAmount: 120, adjustmentReason: "Administration fee" },
      });
      assert.equal(wrapper.statusCode, 409);

      const both = await app.inject({
        method: "POST",
        url: confirmUrl(reviewContract.id, late.id),
        headers: auth(adminToken),
        payload: { customerChargeAmount: 120, adjustmentReason: "Administration fee" },
      });
      assert.ok(both.statusCode === 409 || both.statusCode === 404 || both.statusCode >= 400);
    });

    test("concurrent confirms on the same liability create one customer charge", async () => {
      const contract = await seedReviewContract();
      const liability = await seedLiability({ contractId: contract.id });
      const [first, second] = await Promise.all([
        app.inject({
          method: "POST",
          url: `/road-liabilities/${liability.id}/customer-charge/confirm`,
          headers: auth(adminToken),
          payload: { customerChargeAmount: 100 },
        }),
        app.inject({
          method: "POST",
          url: `/road-liabilities/${liability.id}/customer-charge/confirm`,
          headers: auth(adminToken),
          payload: { customerChargeAmount: 100 },
        }),
      ]);
      const codes = [first.statusCode, second.statusCode].sort();
      assert.equal(codes[0], 200, `${first.body}\n${second.body}`);
      assert.ok(codes[1] === 200 || codes[1] === 409, `${first.body}\n${second.body}`);
      const charges = await prisma.roadLiabilityCustomerCharge.count({
        where: { roadLiabilityId: liability.id },
      });
      assert.equal(charges, 1);
      const lines = await prisma.contractReconciliationLine.count({
        where: { roadLiabilityId: liability.id },
      });
      assert.equal(lines, 1);
    });
  });
}
