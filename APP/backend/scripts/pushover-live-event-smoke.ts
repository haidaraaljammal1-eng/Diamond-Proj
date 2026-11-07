/**
 * Live Pushover smoke — drives real Diamond business actions on an AVAILABLE
 * fleet vehicle (not Playwright). Sends the action-driven business notifications
 * (outbox events) through the same consumer that production uses.
 *
 * Usage (backend running optional; this process uses DATABASE_URL from .env):
 *   npx tsx scripts/pushover-live-event-smoke.ts
 *
 * Optional:
 *   --vehicleId=123   pin a specific AVAILABLE vehicle
 */
import "./e2e-script-env";

process.env.SCHEDULER_ENABLED = "false";

import { randomUUID } from "node:crypto";
import { buildApp } from "src/app";
import { CAR_OUT_REQUIRED_ANGLES } from "src/modules/contracts/contracts.constants";
import { createBusinessNotificationOutboxConsumer } from "src/modules/notification-delivery/business-notification-outbox.consumer";
import { BUSINESS_NOTIFICATION_OUTBOX_TYPES } from "src/modules/notification-delivery/business-notification.constants";
import { PUSHOVER_BUSINESS_IDEMPOTENCY_SCOPE } from "src/modules/notification-delivery/business-notification.constants";
import { seedReadyIdentity, imageMultipart, TEST_PNG } from "tests/helpers/public-identity";

const STAFF_EMAIL = process.env.SMOKE_STAFF_EMAIL ?? "admin@diamond.test";
const STAFF_PASSWORD = process.env.SMOKE_STAFF_PASSWORD ?? "Diamond123!";

type StepResult = {
  step: string;
  eventTypes: string[];
  ok: boolean;
  detail: string;
};

function arg(name: string): string | undefined {
  return process.argv.find((entry) => entry.startsWith(`--${name}=`))?.split("=")[1];
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

function multipart(token: string, bytes: Buffer = TEST_PNG) {
  const file = imageMultipart("evidence.png", "image/png", bytes);
  return {
    headers: { ...auth(token), ...file.headers },
    payload: file.payload,
  };
}

async function main() {
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const results: StepResult[] = [];
  const app = await buildApp();
  const prisma = app.prisma;
  const consumer = createBusinessNotificationOutboxConsumer(app);

  const since = new Date();

  async function flushNotifications(label: string, expectedTypes: string[]): Promise<StepResult> {
    const processed = await consumer.consumeOutbox();
    const rows = await prisma.domainOutboxEvent.findMany({
      where: {
        createdAt: { gte: since },
        eventType: { in: expectedTypes },
      },
      orderBy: { createdAt: "asc" },
    });
    // Only assert on rows created for this step's types since the previous mark.
    const matched = rows.filter((row) => expectedTypes.includes(row.eventType));
    const processedOk = matched.length > 0 && matched.every((row) => row.status === "PROCESSED");
    const idempotency = await prisma.idempotencyKey.findMany({
      where: {
        scope: PUSHOVER_BUSINESS_IDEMPOTENCY_SCOPE,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    const detail = [
      `consume=${processed}`,
      `outbox=${matched.map((r) => `${r.eventType}:${r.status}`).join(", ") || "none"}`,
      `pushoverKeys=${idempotency.length}`,
    ].join(" | ");
    const result: StepResult = {
      step: label,
      eventTypes: expectedTypes,
      ok: processedOk,
      detail,
    };
    results.push(result);
    console.log(`\n== ${label} ==`);
    console.log(result.ok ? "OK" : "CHECK", detail);
    return result;
  }

  try {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: STAFF_EMAIL,
        password: STAFF_PASSWORD,
      },
    });
    if (login.statusCode !== 200) {
      throw new Error(`Staff login failed (${login.statusCode}): ${login.body}`);
    }
    const token = login.json().data.accessToken as string;
    const staffHeaders = auth(token);

    const pinnedId = arg("vehicleId") ? Number(arg("vehicleId")) : null;
    const freeAvailableWhere = {
      isActive: true as const,
      operationalStatus: "AVAILABLE" as const,
      contracts: {
        none: {
          status: { in: ["PAID", "ACTIVE", "RETOUT"] as const },
        },
      },
      NOT: [
        { plateNumber: { startsWith: "E2E" } },
        { vehicleName: { startsWith: "E2E" } },
        { vehicleName: { startsWith: "Tmp E2E" } },
        { vehicleName: { contains: "Electronic E2E" } },
      ],
    };
    const vehicle =
      pinnedId && Number.isFinite(pinnedId)
        ? await prisma.vehicle.findFirst({
            where: {
              id: pinnedId,
              isActive: true,
              operationalStatus: "AVAILABLE",
            },
            include: { model: { select: { name: true } } },
          })
        : ((await prisma.vehicle.findFirst({
            where: {
              ...freeAvailableWhere,
              OR: [
                { vehicleName: { startsWith: "DEMO-FLEET" } },
                { plateNumber: { startsWith: "DEMO" } },
              ],
            },
            orderBy: { id: "asc" },
            include: { model: { select: { name: true } } },
          })) ??
          (await prisma.vehicle.findFirst({
            where: freeAvailableWhere,
            orderBy: { id: "asc" },
            include: { model: { select: { name: true } } },
          })));

    if (!vehicle) {
      throw new Error("No AVAILABLE active vehicle found in the live fleet");
    }

    const vehicleLabel =
      vehicle.vehicleName?.trim() ||
      vehicle.model?.name?.trim() ||
      vehicle.plateNumber ||
      `Vehicle #${vehicle.id}`;
    console.log(
      `Using live vehicle id=${vehicle.id} name="${vehicleLabel}" plate=${vehicle.plateNumber ?? "—"} companyId=${vehicle.companyId}`,
    );

    // 1) Cash offer on the live available vehicle
    const offer = await app.inject({
      method: "POST",
      url: "/contracts/offers",
      headers: staffHeaders,
      payload: {
        vehicleId: vehicle.id,
        priceType: "DAILY",
        rentalDays: 2,
        agreedAmount: vehicle.dailyRate && vehicle.dailyRate > 0 ? vehicle.dailyRate * 2 : 800,
        collectionMode: "CASH",
      },
    });
    if (offer.statusCode !== 201) {
      throw new Error(`Offer failed (${offer.statusCode}): ${offer.body}`);
    }
    const contractId = offer.json().data.id as string;
    const contractNumber = offer.json().data.contractNumber as string;
    console.log(`Offer created contract=${contractNumber} id=${contractId}`);

    const linkRes = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/rental-link`,
      headers: staffHeaders,
    });
    if (linkRes.statusCode !== 200) {
      throw new Error(`Rental link failed (${linkRes.statusCode}): ${linkRes.body}`);
    }
    const rentalToken = linkRes.json().data.link.token as string;

    await seedReadyIdentity(app, rentalToken, {
      licenseNumber: `DL-${run}`.slice(0, 20),
      expiryDate: "2031-06-01",
    });

    const form = await app.inject({
      method: "POST",
      url: `/contracts/rental/${rentalToken}/form`,
      payload: {
        name: `Pushover Smoke ${run}`,
        mobile: `+97150${String(Date.now()).slice(-7)}`,
        nationality: "AE",
        identityNumber: `784-${run}`,
        address: "Dubai Marina",
      },
    });
    if (form.statusCode !== 200) {
      throw new Error(`Form failed (${form.statusCode}): ${form.body}`);
    }

    // Official contract → SIGNED + CASH settle → payment.confirmed
    const contractUrl = (suffix = "") => `/contracts/rental/${rentalToken}/official-contract${suffix}`;
    const getOfficial = async () => {
      const res = await app.inject({ method: "GET", url: contractUrl() });
      if (res.statusCode !== 200) throw new Error(`Official GET ${res.statusCode}: ${res.body}`);
      return res.json().data as {
        permissions: { signableSlots: string[]; missingRequirements: string[] };
        contract: { status: string };
      };
    };
    let view = await getOfficial();
    if (view.contract.status === "AWAITING") {
      const reviewed = await app.inject({ method: "POST", url: contractUrl("/review/submit") });
      if (reviewed.statusCode !== 200) {
        throw new Error(`Review submit failed (${reviewed.statusCode}): ${reviewed.body}`);
      }
      view = reviewed.json().data;
    }
    const patchBody: Record<string, string> = {};
    if (view.permissions.missingRequirements.includes("TELEPHONE")) patchBody.telephone = "+971500000099";
    if (view.permissions.missingRequirements.includes("ADDRESS")) patchBody.address = "Dubai Marina";
    if (Object.keys(patchBody).length > 0) {
      const patched = await app.inject({ method: "PATCH", url: contractUrl(), payload: patchBody });
      if (patched.statusCode !== 200) {
        throw new Error(`Official patch failed (${patched.statusCode}): ${patched.body}`);
      }
      view = patched.json().data;
    }
    for (const slot of view.permissions.signableSlots) {
      const path =
        slot === "HIRER" ? "hirer" : slot === "ADDITIONAL_DRIVER" ? "additional-driver" : "sponsor";
      const saved = await app.inject({
        method: "PUT",
        url: contractUrl(`/signatures/${path}`),
        ...imageMultipart(`${path}.png`),
      });
      if (saved.statusCode !== 200) {
        throw new Error(`Signature ${path} failed (${saved.statusCode}): ${saved.body}`);
      }
    }
    const signed = await app.inject({ method: "POST", url: contractUrl("/sign"), payload: {} });
    if (signed.statusCode !== 200) {
      throw new Error(`Sign failed (${signed.statusCode}): ${signed.body}`);
    }
    const afterSign = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
    console.log(`After sign status=${afterSign.status} (expect PAID for CASH)`);
    await flushNotifications("payment.confirmed (cash rental settle)", ["payment.confirmed"]);

    // 2) Car-Out → contract.activated
    const carOutPatch = await app.inject({
      method: "PATCH",
      url: `/contracts/${contractId}/car-out`,
      headers: staffHeaders,
      payload: { mileageOut: 12_000, fuelOut: "F", damageOut: [] },
    });
    if (carOutPatch.statusCode !== 200) {
      throw new Error(`Car-Out draft failed (${carOutPatch.statusCode}): ${carOutPatch.body}`);
    }
    for (const angle of CAR_OUT_REQUIRED_ANGLES) {
      const uploaded = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/car-out/photos?angle=${angle}`,
        ...multipart(token),
      });
      if (uploaded.statusCode !== 200) {
        throw new Error(`Car-Out photo ${angle} failed (${uploaded.statusCode}): ${uploaded.body}`);
      }
    }
    const outSig = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/car-out/signature`,
      ...multipart(token),
    });
    if (outSig.statusCode !== 200) {
      throw new Error(`Car-Out signature failed (${outSig.statusCode}): ${outSig.body}`);
    }
    const carOut = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/car-out/complete`,
      headers: staffHeaders,
    });
    if (carOut.statusCode !== 200) {
      throw new Error(`Car-Out complete failed (${carOut.statusCode}): ${carOut.body}`);
    }
    console.log(`Car-Out status=${carOut.json().data.status} vehicle=${vehicleLabel}`);
    await flushNotifications("contract.activated (Car-Out)", ["contract.activated"]);

    // 3) Deferred Salik + traffic violation on this live contract/vehicle
    const salik = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/deferred-road-charge`,
      headers: { ...staffHeaders, "idempotency-key": randomUUID() },
      payload: {
        chargeCategory: "SALIK",
        amountAed: 8,
        referenceNumber: `SALIK-${run}`,
      },
    });
    if (salik.statusCode !== 200) {
      throw new Error(`Salik deferred failed (${salik.statusCode}): ${salik.body}`);
    }
    const violation = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/deferred-road-charge`,
      headers: { ...staffHeaders, "idempotency-key": randomUUID() },
      payload: {
        chargeCategory: "TRAFFIC_VIOLATION",
        amountAed: 400,
        referenceNumber: `RTA-${run}`,
      },
    });
    if (violation.statusCode !== 200) {
      throw new Error(`Traffic deferred failed (${violation.statusCode}): ${violation.body}`);
    }
    console.log(
      `Road charges registered salik=${salik.json().data.roadLiabilityId} traffic=${violation.json().data.roadLiabilityId}`,
    );
    await flushNotifications("road_liability.received (Salik + traffic)", ["road_liability.received"]);

    // 4) Zero-amount renewal → contract.renewed
    const renew = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/renew`,
      headers: { ...staffHeaders, "idempotency-key": randomUUID() },
      payload: {
        additionalDurationValue: 1,
        additionalDurationUnit: "DAY",
        additionalAmount: 0,
      },
    });
    if (renew.statusCode !== 200) {
      throw new Error(`Renew failed (${renew.statusCode}): ${renew.body}`);
    }
    await flushNotifications("contract.renewed", ["contract.renewed"]);

    // 5) Customer return → RETOUT, then staff Car-In → contract.return_submitted
    const returnLink = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/return-link`,
      headers: staffHeaders,
    });
    if (returnLink.statusCode !== 200) {
      throw new Error(`Return link failed (${returnLink.statusCode}): ${returnLink.body}`);
    }
    const returnToken = returnLink.json().data.link.token as string;
    const confirmReturn = await app.inject({
      method: "POST",
      url: `/contracts/return/${returnToken}/confirm`,
    });
    if (confirmReturn.statusCode !== 200) {
      throw new Error(`Return confirm failed (${confirmReturn.statusCode}): ${confirmReturn.body}`);
    }

    const carInPatch = await app.inject({
      method: "PATCH",
      url: `/contracts/${contractId}/car-in`,
      headers: staffHeaders,
      payload: { mileageIn: 12_180, fuelIn: "3/4", damageIn: [] },
    });
    if (carInPatch.statusCode !== 200) {
      throw new Error(`Car-In draft failed (${carInPatch.statusCode}): ${carInPatch.body}`);
    }
    for (const angle of CAR_OUT_REQUIRED_ANGLES) {
      const uploaded = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/car-in/photos?angle=${angle}`,
        ...multipart(token),
      });
      if (uploaded.statusCode !== 200) {
        throw new Error(`Car-In photo ${angle} failed (${uploaded.statusCode}): ${uploaded.body}`);
      }
    }
    const inSig = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/car-in/signature`,
      ...multipart(token),
    });
    if (inSig.statusCode !== 200) {
      throw new Error(`Car-In signature failed (${inSig.statusCode}): ${inSig.body}`);
    }
    const carIn = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/car-in/complete`,
      headers: { ...staffHeaders, "idempotency-key": randomUUID() },
    });
    if (carIn.statusCode !== 200) {
      throw new Error(`Car-In complete failed (${carIn.statusCode}): ${carIn.body}`);
    }
    console.log(`Car-In status=${carIn.json().data.status}`);
    await flushNotifications("contract.return_submitted (Car-In)", ["contract.return_submitted"]);

    // 6) Finalize + cash settle road/recon balance → collected payment + close
    const finalize = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/reconciliation/finalize`,
      headers: { ...staffHeaders, "idempotency-key": randomUUID() },
    });
    if (finalize.statusCode !== 200) {
      throw new Error(`Finalize failed (${finalize.statusCode}): ${finalize.body}`);
    }
    let closedStatus = finalize.json().data.status as string;
    if (closedStatus !== "CLOSED") {
      const cashSettle = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/reconciliation/cash/settle`,
        headers: { ...staffHeaders, "idempotency-key": randomUUID() },
      });
      if (cashSettle.statusCode !== 200) {
        throw new Error(`Recon cash settle failed (${cashSettle.statusCode}): ${cashSettle.body}`);
      }
      await flushNotifications("payment.confirmed (road/recon collection)", ["payment.confirmed"]);
      const close = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/close`,
        headers: { ...staffHeaders, "idempotency-key": randomUUID() },
      });
      if (close.statusCode !== 200) {
        throw new Error(`Close failed (${close.statusCode}): ${close.body}`);
      }
      closedStatus = close.json().data.status;
    }
    console.log(`Contract closed status=${closedStatus}`);
    await flushNotifications("contract.closed", ["contract.closed"]);

    // 7) Maintenance on a second AVAILABLE vehicle (or same if free again)
    const maintVehicle =
      (await prisma.vehicle.findFirst({
        where: {
          isActive: true,
          operationalStatus: "AVAILABLE",
          id: { not: vehicle.id },
          contracts: { none: { status: { in: ["PAID", "ACTIVE", "RETOUT"] } } },
        },
        orderBy: { updatedAt: "desc" },
      })) ??
      (await prisma.vehicle.findFirst({
        where: { id: vehicle.id, operationalStatus: "AVAILABLE", isActive: true },
      }));
    if (!maintVehicle) {
      throw new Error("No AVAILABLE vehicle for maintenance step");
    }
    const maintCreate = await app.inject({
      method: "POST",
      url: "/maintenance",
      headers: staffHeaders,
      payload: {
        vehicleId: maintVehicle.id,
        issueDescription: `Pushover smoke maintenance ${run}`,
        maintenanceType: "other",
        startMode: "now",
        workshopName: "Diamond Workshop",
        odometerIn: 50_000,
        cost: 150,
      },
    });
    if (maintCreate.statusCode !== 201) {
      throw new Error(`Maintenance create failed (${maintCreate.statusCode}): ${maintCreate.body}`);
    }
    const maintenanceOrderId = maintCreate.json().data.id as number;
    await flushNotifications("maintenance.started", ["maintenance.started"]);

    const maintComplete = await app.inject({
      method: "POST",
      url: `/maintenance/${maintenanceOrderId}/complete`,
      headers: staffHeaders,
    });
    if (maintComplete.statusCode !== 200) {
      // some flows require ready first
      const ready = await app.inject({
        method: "POST",
        url: `/maintenance/${maintenanceOrderId}/ready`,
        headers: staffHeaders,
      });
      if (ready.statusCode !== 200) {
        throw new Error(`Maintenance ready failed (${ready.statusCode}): ${ready.body}`);
      }
      const completed = await app.inject({
        method: "POST",
        url: `/maintenance/${maintenanceOrderId}/complete`,
        headers: staffHeaders,
      });
      if (completed.statusCode !== 200) {
        throw new Error(`Maintenance complete failed (${completed.statusCode}): ${completed.body}`);
      }
    }
    await flushNotifications("maintenance.completed", ["maintenance.completed"]);

    // 8) Manual expense
    const expense = await app.inject({
      method: "POST",
      url: "/finance/expenses",
      headers: staffHeaders,
      payload: {
        amount: 75,
        category: "OPERATIONS",
        recognizedAt: new Date().toISOString(),
        description: `Pushover smoke expense ${run}`,
        vehicleId: vehicle.id,
        vendorName: "Diamond Ops",
      },
    });
    if (expense.statusCode !== 200) {
      throw new Error(`Manual expense failed (${expense.statusCode}): ${expense.body}`);
    }
    await flushNotifications("manual_expense.created", ["manual_expense.created"]);

    // Final sweep for any remaining business outbox rows from this run
    await consumer.consumeOutbox();
    const all = await prisma.domainOutboxEvent.findMany({
      where: {
        createdAt: { gte: since },
        eventType: { in: [...BUSINESS_NOTIFICATION_OUTBOX_TYPES] },
      },
      orderBy: { createdAt: "asc" },
    });
    const idem = await prisma.idempotencyKey.findMany({
      where: { scope: PUSHOVER_BUSINESS_IDEMPOTENCY_SCOPE, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
    });

    console.log("\n========== PUSHOVER LIVE SMOKE SUMMARY ==========");
    console.log(`Vehicle: ${vehicleLabel} (#${vehicle.id}) plate=${vehicle.plateNumber ?? "—"}`);
    console.log(`Contract: ${contractNumber}`);
    for (const row of results) {
      console.log(`${row.ok ? "PASS" : "FAIL"}  ${row.step}  — ${row.detail}`);
    }
    console.log("\nOutbox events this run:");
    for (const ev of all) {
      console.log(`  ${ev.eventType}  ${ev.status}  id=${ev.id}`);
    }
    console.log(`\nPushover idempotency rows this run: ${idem.length}`);
    for (const row of idem) {
      console.log(`  key=${row.key}`);
    }

    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      console.error(`\n${failed.length} step(s) did not confirm processed outbox.`);
      process.exitCode = 1;
    } else {
      console.log("\nAll driven action notifications processed. Check your Pushover device for the messages.");
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
