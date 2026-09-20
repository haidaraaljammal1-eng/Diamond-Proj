import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

/**
 * Requires RUN_INTEGRATION=true and TEST_DATABASE_URL pointing at disposable
 * haidara_test — never Development haidara.
 */
const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test(
    "road-liabilities integration skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)",
    { skip: true },
  );
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("road liabilities integration", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    const admin = {
      email: `rl-admin-${run}@example.test`,
      password: "rl-admin-pass-123",
    };
    const reader = {
      email: `rl-reader-${run}@example.test`,
      password: "rl-reader-pass-123",
    };
    const stranger = {
      email: `rl-stranger-${run}@example.test`,
      password: "rl-stranger-pass-123",
    };
    let adminToken = "";
    let readerToken = "";
    let strangerToken = "";
    let adminUserId = 0;
    let vehicleId = 0;
    let otherVehicleId = 0;
    let gateId = "";
    let customerId = 0;

    const ADMIN_PERMS = [
      "violations.read",
      "gps.read",
      "vehicles.read",
      "vehicles.manage",
    ];

    async function seedUser(
      email: string,
      password: string,
      roleKey: string,
      perms: string[],
    ) {
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
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: canonicalEmail },
      });
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

    async function createVehicle(payload: Record<string, unknown>) {
      const res = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(adminToken),
        payload: { companyId: await testCompanyId(prisma), ...payload },
      });
      assert.equal(res.statusCode, 201, res.body);
      return res.json().data as { id: number };
    }

    async function bindGps(id: number, suffix: string) {
      await prisma.vehicleGpsBinding.create({
        data: {
          vehicleId: id,
          providerKey: "test",
          externalDeviceId: `rl-dev-${run}-${suffix}`,
          isActive: true,
        },
      });
    }

    async function createCustodyContract(input: {
      number: string;
      status: "ACTIVE" | "CLOSED";
      carOutAt: Date;
      carInAt?: Date | null;
      startAt?: Date;
      endAt?: Date;
    }) {
      return prisma.contract.create({
        data: {
          companyId: await testCompanyId(prisma),
          contractNumber: input.number,
          status: input.status,
          vehicleId,
          customerId,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 5,
          agreedAmount: 500,
          startAt: input.startAt ?? null,
          endAt: input.endAt ?? null,
          carOut: {
            create: {
              performedByUserId: adminUserId,
              occurredAt: input.carOutAt,
              mileageOut: 10,
              fuelOut: "FULL",
            },
          },
          ...(input.carInAt
            ? {
                carIn: {
                  create: {
                    occurredAt: input.carInAt,
                    mileageIn: 80,
                    fuelIn: "FULL",
                  },
                },
              }
            : {}),
        },
      });
    }

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error(
          "road-liabilities integration refuses to run unless DATABASE_URL is haidara_test",
        );
      }
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      adminUserId = await seedUser(admin.email, admin.password, `rl_admin_${run}`, ADMIN_PERMS);
      await seedUser(reader.email, reader.password, `rl_reader_${run}`, ["violations.read"]);
      await seedUser(stranger.email, stranger.password, `rl_stranger_${run}`, ["vehicles.read"]);
      adminToken = await login(admin);
      readerToken = await login(reader);
      strangerToken = await login(stranger);

      vehicleId = (
        await createVehicle({
          vehicleName: `RL Patrol ${run}`,
          plateNumber: `RL ${run} A`,
          modelYear: 2024,
          color: "White",
        })
      ).id;
      otherVehicleId = (
        await createVehicle({
          vehicleName: `RL Other ${run}`,
          plateNumber: `RL ${run} B`,
          modelYear: 2023,
          color: "Black",
        })
      ).id;
      await bindGps(vehicleId, "a");

      const customer = await prisma.customer.create({
        data: { name: `RL Customer ${run}` },
      });
      customerId = customer.id;

      const gate = await prisma.tollGate.create({
        data: {
          networkKey: "SALIK",
          nameEn: `Test Gate ${run}`,
          nameAr: "بوابة اختبار",
          lineStartLatitude: 25.0,
          lineStartLongitude: 55.0,
          lineEndLatitude: 25.001,
          lineEndLongitude: 55.0,
          corridorMeters: 30,
          isActive: true,
        },
      });
      gateId = gate.id;
    });

    after(async () => {
      await app.close();
    });

    test("read APIs work with unconfigured RTA/Salik and require violations.read", async () => {
      const summary = await app.inject({
        method: "GET",
        url: "/road-liabilities/summary",
        headers: auth(readerToken),
      });
      assert.equal(summary.statusCode, 200, summary.body);
      const data = summary.json().data;
      assert.equal(data.providers.rtaConfigured, false);
      assert.equal(data.providers.salikConfigured, false);
      assert.equal(data.providers.tarsTrafficCapabilityVerified, false);

      const anon = await app.inject({ method: "GET", url: "/road-liabilities/summary" });
      assert.ok(anon.statusCode === 401 || anon.statusCode === 403);

      const forbidden = await app.inject({
        method: "GET",
        url: "/road-liabilities",
        headers: auth(strangerToken),
      });
      assert.equal(forbidden.statusCode, 403);

      const me = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: auth(readerToken),
      });
      assert.equal(me.statusCode, 200, me.body);
      const keys: string[] = me.json().data.permissions ?? me.json().data.permissionKeys ?? [];
      const asString = JSON.stringify(me.json().data);
      assert.ok(
        keys.includes("violations.read") || asString.includes("violations.read"),
        asString,
      );
    });

    test("no staff mutation or public routes exist", async () => {
      for (const url of ["/road-liabilities", "/violations"]) {
        const post = await app.inject({
          method: "POST",
          url,
          headers: auth(adminToken),
          payload: { type: "rta_violation" },
        });
        assert.ok(post.statusCode === 404 || post.statusCode === 405, `${url} ${post.statusCode}`);
      }
      const patch = await app.inject({
        method: "PATCH",
        url: "/road-liabilities/00000000-0000-4000-8000-000000000001",
        headers: auth(adminToken),
        payload: { amount: 1 },
      });
      assert.ok(patch.statusCode === 404 || patch.statusCode === 405);
      const pub = await app.inject({ method: "GET", url: "/public/road-liabilities" });
      assert.equal(pub.statusCode, 404);
    });

    test("authoritative externalEventId and fingerprint are idempotent and do not duplicate liabilities", async () => {
      const { createRoadLiabilityService } = await import(
        "src/modules/road-liabilities/road-liability.service"
      );
      const service = createRoadLiabilityService(app);
      const occurredAt = new Date("2026-08-01T10:00:00.000Z");
      const first = await service.ingestRoadObservation({
        sourceKey: "SALIK",
        authoritative: true,
        externalEventId: `salik-${run}-1`,
        eventType: "SALIK_TOLL",
        vehicleId,
        occurredAt,
        amount: 4,
        currency: "AED",
        externalReference: `SALIK-REF-${run}-1`,
        gateId,
      });
      const again = await service.ingestRoadObservation({
        sourceKey: "SALIK",
        authoritative: true,
        externalEventId: `salik-${run}-1`,
        eventType: "SALIK_TOLL",
        vehicleId,
        occurredAt,
        amount: 4,
        currency: "AED",
        externalReference: `SALIK-REF-${run}-1`,
        gateId,
      });
      assert.equal(again.duplicated, true);
      assert.equal(again.observationId, first.observationId);
      assert.equal(again.liabilityId, first.liabilityId);

      const fingerA = await service.ingestRoadObservation({
        sourceKey: "RTA",
        authoritative: true,
        eventType: "RTA_VIOLATION",
        vehicleId,
        occurredAt: new Date("2026-08-02T10:00:00.000Z"),
        amount: 400,
        currency: "AED",
        externalReference: `RTA-FP-${run}`,
        locationLabel: "Sheikh Zayed Road",
      });
      const fingerB = await service.ingestRoadObservation({
        sourceKey: "RTA",
        authoritative: true,
        eventType: "RTA_VIOLATION",
        vehicleId,
        occurredAt: new Date("2026-08-02T10:00:00.000Z"),
        amount: 400,
        currency: "AED",
        externalReference: `RTA-FP-${run}`,
        locationLabel: "Sheikh Zayed Road",
      });
      assert.equal(fingerB.duplicated, true);
      assert.equal(fingerB.liabilityId, fingerA.liabilityId);
      const obsCount = await prisma.roadLiabilityObservation.count({
        where: { liabilityId: first.liabilityId! },
      });
      assert.equal(obsCount, 1);
    });

    test("GPS segment crossing creates a non-chargeable prediction; nearby/stale/jitter do not duplicate", async () => {
      const { createGpsService } = await import("src/modules/gps/gps.service");
      const gps = createGpsService(app);

      const created = await gps.ingestLatestPosition({
        vehicleId,
        capturedAt: new Date("2026-09-10T08:00:00.000Z"),
        latitude: 25.0005,
        longitude: 54.999,
        headingDegrees: 90,
        sourceEventId: `rl-gps-${run}-a`,
      });
      assert.equal(created.applied, true);

      const crossed = await gps.ingestLatestPosition({
        vehicleId,
        capturedAt: new Date("2026-09-10T08:00:10.000Z"),
        latitude: 25.0005,
        longitude: 55.001,
        headingDegrees: 90,
        sourceEventId: `rl-gps-${run}-b`,
      });
      assert.equal(crossed.applied, true);

      const predictions = await prisma.roadLiability.findMany({
        where: {
          vehicleId,
          observations: { some: { sourceKey: "GPS_INFERENCE" } },
        },
        include: { observations: true },
      });
      assert.equal(predictions.length, 1);
      const prediction = predictions[0]!;
      assert.equal(prediction.confirmationStatus, "PENDING_CONFIRMATION");
      assert.equal(prediction.collectionStatus, "NOT_READY");
      assert.equal(prediction.amount, null);
      assert.equal(prediction.authoritativeSourceKey, null);
      assert.ok(prediction.observations.every((o) => o.authoritative === false));

      await bindGps(otherVehicleId, "b");
      await gps.ingestLatestPosition({
        vehicleId: otherVehicleId,
        capturedAt: new Date("2026-09-10T08:01:00.000Z"),
        latitude: 25.0005,
        longitude: 55.0008,
        sourceEventId: `rl-gps-${run}-near-a2`,
      });
      const nearCross = await gps.ingestLatestPosition({
        vehicleId: otherVehicleId,
        capturedAt: new Date("2026-09-10T08:01:10.000Z"),
        latitude: 25.0005,
        longitude: 55.002,
        sourceEventId: `rl-gps-${run}-near-b`,
      });
      assert.equal(nearCross.applied, true);
      const otherPred = await prisma.roadLiability.count({
        where: { vehicleId: otherVehicleId },
      });
      assert.equal(otherPred, 0);

      const stale = await gps.ingestLatestPosition({
        vehicleId,
        capturedAt: new Date("2026-09-10T07:00:00.000Z"),
        latitude: 25.0005,
        longitude: 54.998,
        sourceEventId: `rl-gps-${run}-stale`,
      });
      assert.equal(stale.applied, false);
      assert.equal(
        await prisma.roadLiabilityObservation.count({
          where: { sourceKey: "GPS_INFERENCE", vehicleId },
        }),
        1,
      );

      const jitter = await gps.ingestLatestPosition({
        vehicleId,
        capturedAt: new Date("2026-09-10T08:00:20.000Z"),
        latitude: 25.0005,
        longitude: 54.9992,
        headingDegrees: 270,
        sourceEventId: `rl-gps-${run}-jitter-c`,
      });
      assert.equal(jitter.applied, true);
      const jitterBack = await gps.ingestLatestPosition({
        vehicleId,
        capturedAt: new Date("2026-09-10T08:00:30.000Z"),
        latitude: 25.0005,
        longitude: 55.0012,
        headingDegrees: 90,
        sourceEventId: `rl-gps-${run}-jitter-d`,
      });
      assert.equal(jitterBack.applied, true);
      assert.equal(
        await prisma.roadLiabilityObservation.count({
          where: { sourceKey: "GPS_INFERENCE", vehicleId },
        }),
        1,
      );
    });

    test("contract attribution uses Car-Out/Car-In custody, including CLOSED, unmatched, and ambiguous", async () => {
      const { createRoadLiabilityService } = await import(
        "src/modules/road-liabilities/road-liability.service"
      );
      const service = createRoadLiabilityService(app);
      const attrVehicle = (
        await createVehicle({
          vehicleName: `RL Attr ${run}`,
          plateNumber: `RL ${run} C`,
        })
      ).id;

      const closed = await createCustodyContract({
        number: `RL-C-${run}-1`,
        status: "CLOSED",
        carOutAt: new Date("2026-07-01T08:00:00.000Z"),
        carInAt: new Date("2026-07-10T08:00:00.000Z"),
      });
      await prisma.contract.update({
        where: { id: closed.id },
        data: { vehicleId: attrVehicle },
      });

      const inside = await service.ingestRoadObservation({
        sourceKey: "RTA",
        authoritative: true,
        externalEventId: `rta-in-${run}`,
        eventType: "RTA_VIOLATION",
        vehicleId: attrVehicle,
        occurredAt: new Date("2026-07-05T12:00:00.000Z"),
        amount: 600,
        currency: "AED",
      });
      const insideRow = await prisma.roadLiability.findUniqueOrThrow({
        where: { id: inside.liabilityId! },
      });
      assert.equal(insideRow.attributionStatus, "MATCHED");
      assert.equal(insideRow.attributedContractId, closed.id);

      const before = await service.ingestRoadObservation({
        sourceKey: "RTA",
        authoritative: true,
        externalEventId: `rta-before-${run}`,
        eventType: "RTA_VIOLATION",
        vehicleId: attrVehicle,
        occurredAt: new Date("2026-06-30T12:00:00.000Z"),
        amount: 200,
        currency: "AED",
      });
      const beforeRow = await prisma.roadLiability.findUniqueOrThrow({
        where: { id: before.liabilityId! },
      });
      assert.equal(beforeRow.attributionStatus, "UNMATCHED");
      assert.equal(beforeRow.collectionStatus, "NOT_READY");

      const after = await service.ingestRoadObservation({
        sourceKey: "RTA",
        authoritative: true,
        externalEventId: `rta-after-${run}`,
        eventType: "RTA_VIOLATION",
        vehicleId: attrVehicle,
        occurredAt: new Date("2026-07-11T12:00:00.000Z"),
        amount: 200,
        currency: "AED",
      });
      assert.equal(
        (await prisma.roadLiability.findUniqueOrThrow({ where: { id: after.liabilityId! } }))
          .attributionStatus,
        "UNMATCHED",
      );

      const scheduledOnly = await prisma.contract.create({
        data: {
          companyId: await testCompanyId(prisma),
          contractNumber: `RL-C-${run}-sched`,
          status: "SIGNED",
          vehicleId: attrVehicle,
          customerId,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 3,
          agreedAmount: 300,
          startAt: new Date("2026-07-20T00:00:00.000Z"),
          endAt: new Date("2026-07-25T00:00:00.000Z"),
        },
      });
      const scheduledEvent = await service.ingestRoadObservation({
        sourceKey: "RTA",
        authoritative: true,
        externalEventId: `rta-sched-${run}`,
        eventType: "RTA_VIOLATION",
        vehicleId: attrVehicle,
        occurredAt: new Date("2026-07-22T12:00:00.000Z"),
        amount: 300,
        currency: "AED",
      });
      assert.equal(
        (await prisma.roadLiability.findUniqueOrThrow({
          where: { id: scheduledEvent.liabilityId! },
        })).attributionStatus,
        "UNMATCHED",
      );
      assert.ok(scheduledOnly.id);

      const ambVehicle = (
        await createVehicle({
          vehicleName: `RL Amb ${run}`,
          plateNumber: `RL ${run} D`,
        })
      ).id;
      await prisma.contract.create({
        data: {
          companyId: await testCompanyId(prisma),
          contractNumber: `RL-C-${run}-amb1`,
          status: "ACTIVE",
          vehicleId: ambVehicle,
          customerId,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 5,
          agreedAmount: 500,
          carOut: {
            create: {
              performedByUserId: adminUserId,
              occurredAt: new Date("2026-08-01T08:00:00.000Z"),
              mileageOut: 1,
              fuelOut: "FULL",
            },
          },
        },
      });
      await prisma.contract.create({
        data: {
          companyId: await testCompanyId(prisma),
          contractNumber: `RL-C-${run}-amb2`,
          status: "ACTIVE",
          vehicleId: ambVehicle,
          customerId,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 5,
          agreedAmount: 500,
          carOut: {
            create: {
              performedByUserId: adminUserId,
              occurredAt: new Date("2026-08-02T08:00:00.000Z"),
              mileageOut: 1,
              fuelOut: "FULL",
            },
          },
        },
      });
      const amb = await service.ingestRoadObservation({
        sourceKey: "RTA",
        authoritative: true,
        externalEventId: `rta-amb-${run}`,
        eventType: "RTA_VIOLATION",
        vehicleId: ambVehicle,
        occurredAt: new Date("2026-08-05T12:00:00.000Z"),
        amount: 500,
        currency: "AED",
      });
      const ambRow = await prisma.roadLiability.findUniqueOrThrow({
        where: { id: amb.liabilityId! },
      });
      assert.equal(ambRow.attributionStatus, "AMBIGUOUS");
      assert.equal(ambRow.attributedContractId, null);
      assert.equal(ambRow.collectionStatus, "NOT_READY");
      const chargeableAmb = await service.listChargeableLiabilitiesForContract(
        closed.id,
      );
      assert.ok(chargeableAmb.some((row) => row.id === inside.liabilityId));
      assert.ok(!chargeableAmb.some((row) => row.id === amb.liabilityId));
    });

    test("official Salik upgrades one GPS prediction; without prediction still confirms; RTA reuses engine", async () => {
      const { createRoadLiabilityService } = await import(
        "src/modules/road-liabilities/road-liability.service"
      );
      const service = createRoadLiabilityService(app);
      const gpsLiability = await prisma.roadLiability.findFirstOrThrow({
        where: {
          vehicleId,
          confirmationStatus: "PENDING_CONFIRMATION",
          observations: { some: { sourceKey: "GPS_INFERENCE" } },
        },
      });
      const official = await service.ingestRoadObservation({
        sourceKey: "SALIK",
        authoritative: true,
        externalEventId: `salik-up-${run}`,
        eventType: "SALIK_TOLL",
        vehicleId,
        occurredAt: new Date("2026-09-10T08:05:00.000Z"),
        amount: 6,
        currency: "AED",
        gateId: gpsLiability.gateId,
        externalReference: `SALIK-UP-${run}`,
      });
      assert.equal(official.liabilityId, gpsLiability.id);
      const upgraded = await prisma.roadLiability.findUniqueOrThrow({
        where: { id: gpsLiability.id },
      });
      assert.equal(upgraded.confirmationStatus, "CONFIRMED");
      assert.equal(upgraded.amount, 6);
      assert.equal(upgraded.authoritativeSourceKey, "SALIK");
      const obs = await prisma.roadLiabilityObservation.count({
        where: { liabilityId: gpsLiability.id },
      });
      assert.equal(obs, 2);

      const noGps = await service.ingestRoadObservation({
        sourceKey: "SALIK",
        authoritative: true,
        externalEventId: `salik-nogps-${run}`,
        eventType: "SALIK_TOLL",
        plateNumber: `RL ${run} B`,
        occurredAt: new Date("2026-09-01T09:00:00.000Z"),
        amount: 8,
        currency: "AED",
      });
      assert.notEqual(noGps.liabilityId, gpsLiability.id);
      const noGpsRow = await prisma.roadLiability.findUniqueOrThrow({
        where: { id: noGps.liabilityId! },
      });
      assert.equal(noGpsRow.confirmationStatus, "CONFIRMED");
      assert.equal(noGpsRow.amount, 8);
      assert.equal(noGpsRow.vehicleId, otherVehicleId);

      const rta = await service.ingestRoadObservation({
        sourceKey: "RTA",
        authoritative: true,
        externalEventId: `rta-eng-${run}`,
        eventType: "RTA_VIOLATION",
        vehicleId: otherVehicleId,
        occurredAt: new Date("2026-09-01T10:00:00.000Z"),
        amount: 1000,
        currency: "AED",
        locationLabel: "Al Khail",
      });
      const rtaRow = await prisma.roadLiability.findUniqueOrThrow({
        where: { id: rta.liabilityId! },
      });
      assert.equal(rtaRow.type, "RTA_VIOLATION");
      assert.equal(rtaRow.confirmationStatus, "CONFIRMED");
    });

    test("summary, list, filters, search, detail provenance, and chargeable boundary", async () => {
      const summary = await app.inject({
        method: "GET",
        url: "/road-liabilities/summary",
        headers: auth(adminToken),
      });
      assert.equal(summary.statusCode, 200, summary.body);
      const s = summary.json().data;
      assert.ok(s.total >= 1);
      assert.equal(typeof s.confirmedOpenAmount, "number");
      const pending = await prisma.roadLiability.findMany({
        where: { confirmationStatus: "PENDING_CONFIRMATION", amount: { not: null } },
      });
      assert.equal(pending.length, 0);

      const listed = await app.inject({
        method: "GET",
        url: "/road-liabilities?page=1&pageSize=10",
        headers: auth(adminToken),
      });
      assert.equal(listed.statusCode, 200, listed.body);
      const listBody = listed.json();
      assert.ok(Array.isArray(listBody.data));
      assert.ok(listBody.meta.pageSize <= 10);
      const first = listBody.data[0];
      assert.ok(first.vehicle === null || first.vehicle.displayName);
      assert.ok("prediction" in first);
      assert.ok("authoritative" in first);

      const filtered = await app.inject({
        method: "GET",
        url: "/road-liabilities?type=salik_toll&confirmationStatus=confirmed",
        headers: auth(adminToken),
      });
      assert.equal(filtered.statusCode, 200);
      for (const row of filtered.json().data) {
        assert.equal(row.type, "salik_toll");
        assert.equal(row.confirmationStatus, "confirmed");
      }

      const searched = await app.inject({
        method: "GET",
        url: `/road-liabilities?search=${encodeURIComponent(`RL Patrol ${run}`)}`,
        headers: auth(adminToken),
      });
      assert.equal(searched.statusCode, 200);
      assert.ok(searched.json().data.length >= 1);

      const confirmed = await prisma.roadLiability.findFirstOrThrow({
        where: { confirmationStatus: "CONFIRMED", vehicleId },
      });
      const detail = await app.inject({
        method: "GET",
        url: `/road-liabilities/${confirmed.id}`,
        headers: auth(adminToken),
      });
      assert.equal(detail.statusCode, 200, detail.body);
      const d = detail.json().data;
      assert.ok(Array.isArray(d.provenance));
      assert.ok(d.provenance.length >= 1);
      const raw = detail.body as string;
      assert.equal(raw.includes("RTA_API_KEY"), false);
      assert.equal(raw.includes("SALIK_API_KEY"), false);
      assert.equal(raw.includes("client_secret"), false);
      assert.equal(raw.includes("rawPayload"), false);
      assert.equal(raw.includes("latitude"), false);
    });

    test("workState, queues, channel, unique needsAttentionCount, and existing filters", async () => {
      const { createRoadLiabilityService } = await import(
        "src/modules/road-liabilities/road-liability.service"
      );
      const service = createRoadLiabilityService(app);
      await service.ingestRoadObservation({
        sourceKey: "SALIK",
        authoritative: true,
        externalEventId: `salik-v-${run}`,
        eventType: "SALIK_VIOLATION",
        vehicleId,
        occurredAt: new Date("2026-08-20T09:00:00.000Z"),
        amount: 50,
        currency: "AED",
        externalReference: `SALIK-V-${run}`,
        gateId,
      });

      const summary = await app.inject({
        method: "GET",
        url: "/road-liabilities/summary",
        headers: auth(adminToken),
      });
      assert.equal(summary.statusCode, 200, summary.body);
      const s = summary.json().data;
      assert.equal(typeof s.needsAttentionCount, "number");
      const uniqueAttention = await prisma.roadLiability.count({
        where: {
          OR: [
            { collectionStatus: "DISPUTED", confirmationStatus: { not: "REJECTED" } },
            {
              confirmationStatus: "PENDING_CONFIRMATION",
              collectionStatus: { notIn: ["SETTLED", "VOID"] },
            },
            {
              confirmationStatus: "CONFIRMED",
              collectionStatus: { notIn: ["SETTLED", "VOID", "DISPUTED"] },
              attributionStatus: { in: ["AMBIGUOUS", "UNMATCHED", "UNRESOLVED"] },
            },
          ],
        },
      });
      assert.equal(s.needsAttentionCount, uniqueAttention);
      assert.ok(
        s.needsAttentionCount <=
          s.pendingConfirmationCount + s.unmatchedCount + s.ambiguousCount,
      );

      const listed = await app.inject({
        method: "GET",
        url: "/road-liabilities?page=1&pageSize=50",
        headers: auth(adminToken),
      });
      assert.equal(listed.statusCode, 200, listed.body);
      const listedRows = listed.json().data as Array<{ workState: string }>;
      assert.ok(listedRows.length >= 1);
      assert.ok(typeof listedRows[0]!.workState === "string");

      const collectible = await app.inject({
        method: "GET",
        url: "/road-liabilities?queue=collectible&pageSize=50",
        headers: auth(adminToken),
      });
      assert.equal(collectible.statusCode, 200);
      for (const row of collectible.json().data) {
        assert.equal(row.workState, "collectible");
      }

      const attention = await app.inject({
        method: "GET",
        url: "/road-liabilities?queue=needs_attention&pageSize=50",
        headers: auth(adminToken),
      });
      assert.equal(attention.statusCode, 200);
      const attentionStates = new Set([
        "awaiting_confirmation",
        "needs_contract",
        "ambiguous_match",
        "attribution_pending",
        "disputed",
      ]);
      for (const row of attention.json().data) {
        assert.ok(attentionStates.has(row.workState), row.workState);
      }

      const rta = await app.inject({
        method: "GET",
        url: "/road-liabilities?channel=RTA&pageSize=50",
        headers: auth(adminToken),
      });
      assert.equal(rta.statusCode, 200);
      assert.ok(rta.json().data.length >= 1);
      for (const row of rta.json().data) {
        assert.equal(row.type, "rta_violation");
      }

      const salik = await app.inject({
        method: "GET",
        url: "/road-liabilities?channel=SALIK&pageSize=50",
        headers: auth(adminToken),
      });
      assert.equal(salik.statusCode, 200);
      const salikTypes = new Set(["salik_toll", "salik_violation"]);
      let sawGpsSalikToll = false;
      let sawSalikToll = false;
      let sawSalikViolation = false;
      for (const row of salik.json().data) {
        assert.ok(salikTypes.has(row.type), row.type);
        if (row.type === "salik_toll") sawSalikToll = true;
        if (row.type === "salik_violation") sawSalikViolation = true;
        if (row.prediction?.predictedByGps && row.type === "salik_toll") {
          sawGpsSalikToll = true;
        }
      }
      assert.equal(sawSalikToll, true);
      assert.equal(sawSalikViolation, true);
      assert.equal(sawGpsSalikToll, true);

      const gpsSource = await app.inject({
        method: "GET",
        url: "/road-liabilities?sourceKey=GPS_INFERENCE&pageSize=50",
        headers: auth(adminToken),
      });
      assert.equal(gpsSource.statusCode, 200);
      assert.ok(gpsSource.json().data.length >= 1);
      for (const row of gpsSource.json().data) {
        assert.equal(row.prediction.predictedByGps, true);
      }

      const detailed = await app.inject({
        method: "GET",
        url: "/road-liabilities?type=salik_toll&confirmationStatus=pending_confirmation",
        headers: auth(adminToken),
      });
      assert.equal(detailed.statusCode, 200);
      for (const row of detailed.json().data) {
        assert.equal(row.type, "salik_toll");
        assert.equal(row.confirmationStatus, "pending_confirmation");
      }

      const paged = await app.inject({
        method: "GET",
        url: "/road-liabilities?page=1&pageSize=2",
        headers: auth(adminToken),
      });
      assert.equal(paged.statusCode, 200);
      assert.ok(paged.json().data.length <= 2);
      assert.equal(paged.json().meta.pageSize, 2);

      const toSettle = await prisma.roadLiability.findFirst({
        where: { confirmationStatus: "CONFIRMED", collectionStatus: "OPEN" },
      });
      assert.ok(toSettle);
      await prisma.roadLiability.update({
        where: { id: toSettle.id },
        data: { collectionStatus: "SETTLED" },
      });
      const settled = await app.inject({
        method: "GET",
        url: "/road-liabilities?queue=settled&pageSize=50",
        headers: auth(adminToken),
      });
      assert.equal(settled.statusCode, 200);
      assert.ok(settled.json().data.length >= 1);
      for (const row of settled.json().data) {
        assert.equal(row.workState, "settled");
      }

      const post = await app.inject({
        method: "POST",
        url: "/road-liabilities",
        headers: auth(adminToken),
        payload: { type: "rta_violation" },
      });
      assert.ok(post.statusCode === 404 || post.statusCode === 405);
    });
  });
}
