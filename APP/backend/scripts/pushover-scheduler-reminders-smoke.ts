/**
 * Live smoke for 3×/day Pushover scheduler reminders (no Playwright).
 *
 * Pins synthetic Asia/Dubai wall-clock to each configured slot and runs the
 * real reminder cycles so Pushover fires without waiting for the clock.
 *
 * Usage:
 *   npx tsx scripts/pushover-scheduler-reminders-smoke.ts
 */
import "./e2e-script-env";

process.env.SCHEDULER_ENABLED = "false";
process.env.ATTENTION_MONITOR_ENABLED = "true";
process.env.OPEN_RECEIVABLES_REMINDER_ENABLED = "true";
process.env.OVERDUE_RENTAL_MONITOR_ENABLED = "true";
process.env.MAINTENANCE_SCHEDULE_MISSED_MONITOR_ENABLED = "true";
process.env.MAINTENANCE_DELAY_MONITOR_ENABLED = "true";
process.env.ATTENTION_MONITOR_TIMES ??= "09:00,14:00,19:00";
process.env.OPEN_RECEIVABLES_REMINDER_TIMES ??= "10:00,14:00,19:00";
process.env.OVERDUE_RENTAL_MONITOR_TIMES ??= "09:00,14:00,19:00";
process.env.MAINTENANCE_SCHEDULE_MISSED_MONITOR_TIMES ??= "09:00,14:00,19:00";
process.env.MAINTENANCE_DELAY_MONITOR_TIMES ??= "09:00,14:00,19:00";

const STAFF_EMAIL = process.env.SMOKE_STAFF_EMAIL ?? "admin@diamond.test";
const STAFF_PASSWORD = process.env.SMOKE_STAFF_PASSWORD ?? "Diamond123!";
const TZ = "Asia/Dubai";

type SlotReport = {
  slotLabel: string;
  nowIso: string;
  attention: boolean;
  openReceivables: boolean;
  overdueSent: number;
  maintenanceMissedSent: number;
  maintenanceDelaySent: number;
};

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

/** Asia/Dubai is UTC+4 year-round. */
function nowAtDubaiSlot(dateKey: string, slot: string): Date {
  return new Date(`${dateKey}T${slot}:00+04:00`);
}

function unionSlots(parse: (raw: string) => string[], ...rawLists: string[]): string[] {
  const set = new Set<string>();
  for (const raw of rawLists) {
    for (const slot of parse(raw)) set.add(slot);
  }
  return [...set].sort();
}

async function main() {
  // Dynamic imports AFTER env flags so src/config/env sees the smoke overrides.
  const { randomUUID } = await import("node:crypto");
  const { buildApp } = await import("src/app");
  const { env } = await import("src/config/env");
  const { CAR_OUT_REQUIRED_ANGLES } = await import("src/modules/contracts/contracts.constants");
  const {
    ATTENTION_MONITOR_IDEMPOTENCY_SCOPE,
    MAINTENANCE_DELAY_IDEMPOTENCY_SCOPE,
    MAINTENANCE_SCHEDULE_MISSED_IDEMPOTENCY_SCOPE,
    OPEN_RECEIVABLES_REMINDER_IDEMPOTENCY_SCOPE,
    OVERDUE_RENTAL_REMINDER_IDEMPOTENCY_SCOPE,
  } = await import("src/modules/notification-delivery/business-notification.constants");
  const {
    formatLocalDateParts,
    parseAttentionMonitorTimes,
    runAttentionMonitorCycle,
  } = await import("src/modules/notification-delivery/attention-monitor.service");
  const {
    runMaintenanceDelayCycle,
    runMaintenanceScheduleMissedCycle,
    runOpenReceivablesReminderCycle,
    runOverdueRentalReminderCycle,
  } = await import("src/modules/notification-delivery/business-notification-reminders.service");
  const { seedReadyIdentity, imageMultipart, TEST_PNG } = await import(
    "tests/helpers/public-identity"
  );

  console.log("Monitor flags:", {
    attention: env.ATTENTION_MONITOR_ENABLED,
    openReceivables: env.OPEN_RECEIVABLES_REMINDER_ENABLED,
    overdue: env.OVERDUE_RENTAL_MONITOR_ENABLED,
    maintMissed: env.MAINTENANCE_SCHEDULE_MISSED_MONITOR_ENABLED,
    maintDelay: env.MAINTENANCE_DELAY_MONITOR_ENABLED,
  });

  function multipart(token: string) {
    const file = imageMultipart("evidence.png", "image/png", TEST_PNG);
    return { headers: { ...auth(token), ...file.headers }, payload: file.payload };
  }

  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const app = await buildApp();
  const prisma = app.prisma;

  try {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: STAFF_EMAIL, password: STAFF_PASSWORD },
    });
    if (login.statusCode !== 200) {
      throw new Error(`Login failed (${login.statusCode}): ${login.body}`);
    }
    const token = login.json().data.accessToken as string;
    const staffHeaders = auth(token);

    const vehicle = await prisma.vehicle.findFirst({
      where: {
        isActive: true,
        operationalStatus: "AVAILABLE",
        contracts: { none: { status: { in: ["PAID", "ACTIVE", "RETOUT"] } } },
        NOT: [
          { plateNumber: { startsWith: "E2E" } },
          { vehicleName: { startsWith: "E2E" } },
          { vehicleName: { startsWith: "Tmp E2E" } },
        ],
      },
      orderBy: { id: "asc" },
      include: { model: { select: { name: true } } },
    });
    if (!vehicle) throw new Error("No AVAILABLE fleet vehicle for scheduler smoke");

    const vehicleLabel =
      vehicle.vehicleName?.trim() ||
      vehicle.model?.name?.trim() ||
      vehicle.plateNumber ||
      `Vehicle #${vehicle.id}`;
    console.log(`Vehicle: ${vehicleLabel} (#${vehicle.id}) plate=${vehicle.plateNumber ?? "—"}`);

    const offer = await app.inject({
      method: "POST",
      url: "/contracts/offers",
      headers: staffHeaders,
      payload: {
        vehicleId: vehicle.id,
        priceType: "DAILY",
        rentalDays: 1,
        agreedAmount: vehicle.dailyRate && vehicle.dailyRate > 0 ? vehicle.dailyRate : 400,
        collectionMode: "CASH",
      },
    });
    if (offer.statusCode !== 201) {
      throw new Error(`Offer failed (${offer.statusCode}): ${offer.body}`);
    }
    const contractId = offer.json().data.id as string;
    const contractNumber = offer.json().data.contractNumber as string;

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
      licenseNumber: `DL-S${run}`.slice(0, 20),
      expiryDate: "2031-06-01",
    });
    const form = await app.inject({
      method: "POST",
      url: `/contracts/rental/${rentalToken}/form`,
      payload: {
        name: `Scheduler Smoke ${run}`,
        mobile: `+97150${String(Date.now()).slice(-7)}`,
        nationality: "AE",
        identityNumber: `784-S${run}`,
        address: "Dubai Marina",
      },
    });
    if (form.statusCode !== 200) {
      throw new Error(`Form failed (${form.statusCode}): ${form.body}`);
    }

    const contractUrl = (suffix = "") =>
      `/contracts/rental/${rentalToken}/official-contract${suffix}`;
    let view = (
      await app.inject({ method: "GET", url: contractUrl() })
    ).json().data as {
      permissions: { signableSlots: string[]; missingRequirements: string[] };
      contract: { status: string };
    };
    const patchBody: Record<string, string> = {};
    if (view.permissions.missingRequirements.includes("TELEPHONE")) {
      patchBody.telephone = "+971500000099";
    }
    if (view.permissions.missingRequirements.includes("ADDRESS")) {
      patchBody.address = "Dubai Marina";
    }
    if (Object.keys(patchBody).length > 0) {
      view = (await app.inject({ method: "PATCH", url: contractUrl(), payload: patchBody })).json()
        .data;
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

    const carOutPatch = await app.inject({
      method: "PATCH",
      url: `/contracts/${contractId}/car-out`,
      headers: staffHeaders,
      payload: { mileageOut: 20_000, fuelOut: "F", damageOut: [] },
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

    const pastEnd = new Date(Date.now() - 36 * 60 * 60 * 1000);
    await prisma.contract.update({
      where: { id: contractId },
      data: { endAt: pastEnd },
    });
    console.log(`Overdue ACTIVE ready: ${contractNumber} endAt=${pastEnd.toISOString()}`);

    const deferred = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/deferred-road-charge`,
      headers: { ...staffHeaders, "idempotency-key": randomUUID() },
      payload: {
        chargeCategory: "SALIK",
        amountAed: 12,
        referenceNumber: `SCHED-SALIK-${run}`,
      },
    });
    if (deferred.statusCode !== 200) {
      throw new Error(`Deferred Salik failed (${deferred.statusCode}): ${deferred.body}`);
    }
    console.log(`Open receivable seeded liability=${deferred.json().data.roadLiabilityId}`);

    const freeForMaintenance = {
      isActive: true as const,
      operationalStatus: "AVAILABLE" as const,
      contracts: { none: { status: { in: ["PAID", "ACTIVE", "RETOUT"] as const } } },
      maintenanceOrders: {
        none: { status: { in: ["SCHEDULED", "IN_SERVICE", "READY_FOR_PICKUP"] as const } },
      },
    };
    const maintVehicle =
      (await prisma.vehicle.findFirst({
        where: { ...freeForMaintenance, id: { not: vehicle.id } },
        orderBy: { id: "asc" },
      })) ??
      (await prisma.vehicle.findFirst({
        where: freeForMaintenance,
        orderBy: { id: "asc" },
      }));
    if (!maintVehicle) {
      throw new Error("No AVAILABLE vehicle free of active maintenance for missed-schedule seed");
    }

    const scheduledFuture = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const missed = await app.inject({
      method: "POST",
      url: "/maintenance",
      headers: staffHeaders,
      payload: {
        vehicleId: maintVehicle.id,
        issueDescription: `Scheduler missed smoke ${run}`,
        maintenanceType: "periodic",
        startMode: "scheduled",
        scheduledAt: scheduledFuture.toISOString(),
        workshopName: "Diamond Workshop",
      },
    });
    if (missed.statusCode !== 201) {
      throw new Error(`Scheduled maintenance failed (${missed.statusCode}): ${missed.body}`);
    }
    const missedOrderId = missed.json().data.id as number;
    await prisma.maintenanceOrder.update({
      where: { id: missedOrderId },
      data: {
        scheduledAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        status: "SCHEDULED",
      },
    });
    console.log(`Maintenance SCHEDULED past: order #${missedOrderId}`);

    const delayVehicle =
      (await prisma.vehicle.findFirst({
        where: {
          ...freeForMaintenance,
          id: { notIn: [vehicle.id, maintVehicle.id] },
        },
        orderBy: { id: "asc" },
      })) ??
      (await prisma.vehicle.findFirst({
        where: {
          ...freeForMaintenance,
          id: { not: maintVehicle.id },
        },
        orderBy: { id: "asc" },
      }));
    if (!delayVehicle) {
      throw new Error("No AVAILABLE vehicle free of active maintenance for delay seed");
    }

    const delayedCreate = await app.inject({
      method: "POST",
      url: "/maintenance",
      headers: staffHeaders,
      payload: {
        vehicleId: delayVehicle.id,
        issueDescription: `Scheduler delay smoke ${run}`,
        maintenanceType: "mechanical",
        startMode: "now",
        workshopName: "Diamond Workshop",
        odometerIn: 60_000,
        expectedCompletionAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        cost: 200,
      },
    });
    if (delayedCreate.statusCode !== 201) {
      throw new Error(`Delayed maintenance failed (${delayedCreate.statusCode}): ${delayedCreate.body}`);
    }
    const delayedOrderId = delayedCreate.json().data.id as number;
    await prisma.maintenanceOrder.update({
      where: { id: delayedOrderId },
      data: {
        expectedCompletionAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
        status: "IN_SERVICE",
      },
    });
    console.log(`Maintenance IN_SERVICE overdue: order #${delayedOrderId}`);

    const { dateKey } = formatLocalDateParts(new Date(), TZ);
    const slots = unionSlots(
      parseAttentionMonitorTimes,
      env.ATTENTION_MONITOR_TIMES,
      env.OPEN_RECEIVABLES_REMINDER_TIMES,
      env.OVERDUE_RENTAL_MONITOR_TIMES,
      env.MAINTENANCE_SCHEDULE_MISSED_MONITOR_TIMES,
      env.MAINTENANCE_DELAY_MONITOR_TIMES,
    );
    console.log(`\nDubai date=${dateKey} slots=${slots.join(", ")}`);

    const scopes = [
      ATTENTION_MONITOR_IDEMPOTENCY_SCOPE,
      OPEN_RECEIVABLES_REMINDER_IDEMPOTENCY_SCOPE,
      OVERDUE_RENTAL_REMINDER_IDEMPOTENCY_SCOPE,
      MAINTENANCE_SCHEDULE_MISSED_IDEMPOTENCY_SCOPE,
      MAINTENANCE_DELAY_IDEMPOTENCY_SCOPE,
    ];
    const cleared = await prisma.idempotencyKey.deleteMany({
      where: {
        scope: { in: scopes },
        key: { contains: dateKey },
      },
    });
    console.log(`Cleared ${cleared.count} idempotency key(s) for ${dateKey}`);

    const reports: SlotReport[] = [];
    for (const slot of slots) {
      const now = nowAtDubaiSlot(dateKey, slot);
      console.log(`\n== Slot ${slot} Asia/Dubai (now=${now.toISOString()}) ==`);

      const attention = await runAttentionMonitorCycle(prisma, {
        enabled: true,
        timeZone: TZ,
        monitorTimes: env.ATTENTION_MONITOR_TIMES,
        now,
      });
      const openReceivables = await runOpenReceivablesReminderCycle(prisma, now);
      const overdueSent = await runOverdueRentalReminderCycle(prisma, now);
      const maintenanceMissedSent = await runMaintenanceScheduleMissedCycle(prisma, now);
      const maintenanceDelaySent = await runMaintenanceDelayCycle(prisma, now);

      const report: SlotReport = {
        slotLabel: slot,
        nowIso: now.toISOString(),
        attention,
        openReceivables,
        overdueSent,
        maintenanceMissedSent,
        maintenanceDelaySent,
      };
      reports.push(report);
      console.log(
        [
          `attention=${attention}`,
          `openReceivables=${openReceivables}`,
          `overdueSent=${overdueSent}`,
          `maintMissed=${maintenanceMissedSent}`,
          `maintDelay=${maintenanceDelaySent}`,
        ].join(" | "),
      );
    }

    const attentionSlots = parseAttentionMonitorTimes(env.ATTENTION_MONITOR_TIMES);
    const openRecSlots = parseAttentionMonitorTimes(env.OPEN_RECEIVABLES_REMINDER_TIMES);
    const overdueSlots = parseAttentionMonitorTimes(env.OVERDUE_RENTAL_MONITOR_TIMES);

    const attentionOk = reports
      .filter((r) => attentionSlots.includes(r.slotLabel))
      .every((r) => r.attention);
    const openRecOk = reports
      .filter((r) => openRecSlots.includes(r.slotLabel))
      .every((r) => r.openReceivables);
    const overdueOk = reports
      .filter((r) => overdueSlots.includes(r.slotLabel))
      .every((r) => r.overdueSent > 0);
    const maintMissedOk = reports.some((r) => r.maintenanceMissedSent > 0);
    const maintDelayOk = reports.some((r) => r.maintenanceDelaySent > 0);

    console.log("\n========== SCHEDULER 3×/DAY SMOKE SUMMARY ==========");
    console.log(`Vehicle: ${vehicleLabel} (#${vehicle.id})`);
    console.log(`Overdue contract: ${contractNumber}`);
    console.log(`Maintenance missed #${missedOrderId} | delayed #${delayedOrderId}`);
    for (const r of reports) {
      console.log(
        `  ${r.slotLabel}: attention=${r.attention} openRec=${r.openReceivables} overdue=${r.overdueSent} missed=${r.maintenanceMissedSent} delay=${r.maintenanceDelaySent}`,
      );
    }
    console.log(
      [
        `attention 3× (${attentionSlots.join("/")}): ${attentionOk ? "PASS" : "FAIL"}`,
        `openReceivables 3× (${openRecSlots.join("/")}): ${openRecOk ? "PASS" : "FAIL"}`,
        `overdue rental 3× (${overdueSlots.join("/")}): ${overdueOk ? "PASS" : "FAIL"}`,
        `maintenance missed (1×/day gated by slots): ${maintMissedOk ? "PASS" : "FAIL"}`,
        `maintenance delay (1×/day gated by slots): ${maintDelayOk ? "PASS" : "FAIL"}`,
      ].join("\n"),
    );

    if (!attentionOk || !openRecOk || !overdueOk || !maintMissedOk || !maintDelayOk) {
      process.exitCode = 1;
      console.error("\nOne or more scheduler reminders did not send. Check Pushover + seed data.");
    } else {
      console.log("\nAll scheduler reminder paths sent. Check your Pushover device (multiple messages).");
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
