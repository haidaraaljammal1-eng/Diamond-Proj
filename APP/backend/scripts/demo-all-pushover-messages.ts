/**
 * Sends one Pushover notification per business Pushover message shape (English, multi-line body).
 * Uses NotificationService + .env (PUSHOVER_*). Run locally only.
 *
 * Run: npm run demo:pushover:all
 * Optional: DEMO_PUSHOVER_GAP_MS=1200 (ms between sends)
 */
import "dotenv/config";

import { notificationService } from "src/modules/notification-delivery/notification.service";
import {
  buildAttentionSummaryMessage,
  buildCarInMessage,
  buildCarOutMessage,
  buildContractFleetReturnMessage,
  buildContractSignedMessage,
  buildMaintenanceCompletedMessage,
  buildMaintenanceDelayedMessage,
  buildMaintenanceScheduleMissedMessage,
  buildMaintenanceStartedMessage,
  buildManualExpenseMessage,
  buildOpenReceivablesReminderMessage,
  buildOverdueRentalReminderMessage,
  buildPaymentAuthorizationIncompleteMessage,
  buildPaymentFailedMessage,
  buildPaymentReceivedMessage,
  buildRentalExtendedMessage,
  buildRoadLiabilityCollectionFailedMessage,
  buildRoadLiabilityCollectedMessage,
  buildRoadLiabilityReceivedMessage,
} from "src/modules/notification-delivery/business-notification.messages";

const actor = { staffUsername: "demo.staff@example.com" };
const staffActor = { staffUsername: "registrar@example.com" };
const demoNow = new Date();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function send(label: string, payload: { title: string; message: string }): Promise<void> {
  const result = await notificationService.send(payload);
  const ok = result.success ? "ok" : "FAIL";
  console.log(`[${ok}] ${label}`);
  if (!result.success) {
    console.error(`       errorCode=${result.errorCode ?? "?"}`);
  }
}

async function main(): Promise<void> {
  const gapMs = Number(process.env.DEMO_PUSHOVER_GAP_MS ?? "900");

  const samples: Array<{ name: string; payload: () => { title: string; message: string } }> = [
    {
      name: "contract.signed (builder only — not wired to outbox)",
      payload: () =>
        buildContractSignedMessage({
          contractNumber: "DEMO-1000",
          vehicleName: "Toyota Camry",
          customerName: "Demo Customer",
          amountDue: 2000,
          currency: "AED",
          paymentState: "SIGNED",
          occurredAt: demoNow,
          actor,
        }),
    },
    {
      name: "payment.confirmed RENTAL",
      payload: () =>
        buildPaymentReceivedMessage({
          contractNumber: "DEMO-1001",
          vehicleName: "Toyota Camry — White 2022",
          actor,
        }),
    },
    {
      name: "road_liability.received (RTA_VIOLATION)",
      payload: () =>
        buildRoadLiabilityReceivedMessage({
          liabilityType: "RTA_VIOLATION",
          contractNumber: "DEMO-1002",
          vehicleName: "Nissan Altima",
          staffActor,
        }),
    },
    {
      name: "road_liability.received (SALIK_TOLL)",
      payload: () =>
        buildRoadLiabilityReceivedMessage({
          liabilityType: "SALIK_TOLL",
          contractNumber: "DEMO-1002B",
          vehicleName: "Nissan Altima",
          staffActor,
        }),
    },
    {
      name: "road_liability.received (ingestion — no staff)",
      payload: () =>
        buildRoadLiabilityReceivedMessage({
          liabilityType: "RTA_VIOLATION",
          contractNumber: "DEMO-1003",
          vehicleName: "Honda Accord",
          staffActor: undefined,
        }),
    },
    {
      name: "contract.activated (Car-Out)",
      payload: () =>
        buildCarOutMessage({
          contractNumber: "DEMO-1004",
          vehicleName: "Hyundai Tucson",
          actor,
        }),
    },
    {
      name: "contract.return_submitted (Car-In)",
      payload: () =>
        buildCarInMessage({
          contractNumber: "DEMO-1005",
          vehicleName: "Kia Sportage",
          actor,
        }),
    },
    {
      name: "contract.closed (fleet return)",
      payload: () =>
        buildContractFleetReturnMessage({
          contractNumber: "DEMO-1006",
          vehicleName: "Mazda 6",
          actor,
        }),
    },
    {
      name: "contract.renewed",
      payload: () =>
        buildRentalExtendedMessage({
          contractNumber: "DEMO-1007",
          vehicleName: "Mitsubishi ASX",
          actor,
        }),
    },
    {
      name: "payment.failed (general)",
      payload: () =>
        buildPaymentFailedMessage({
          contractNumber: "DEMO-1008",
          vehicleName: "VW Golf",
          actor,
        }),
    },
    {
      name: "payment.authorization_incomplete",
      payload: () =>
        buildPaymentAuthorizationIncompleteMessage({
          contractNumber: "DEMO-1009",
          vehicleName: "BMW 320",
          actor,
        }),
    },
    {
      name: "payment.confirmed ROAD_LIABILITY (collected)",
      payload: () =>
        buildRoadLiabilityCollectedMessage({
          contractNumber: "DEMO-1010",
          vehicleName: "Ford Edge",
          actor,
        }),
    },
    {
      name: "payment.failed ROAD_LIABILITY (collection failed)",
      payload: () =>
        buildRoadLiabilityCollectionFailedMessage({
          contractNumber: "DEMO-1011",
          vehicleName: "Chevrolet Tahoe",
          actor,
        }),
    },
    {
      name: "maintenance.started",
      payload: () =>
        buildMaintenanceStartedMessage({
          vehicleName: "Toyota Land Cruiser",
          actor,
        }),
    },
    {
      name: "maintenance.completed",
      payload: () =>
        buildMaintenanceCompletedMessage({
          vehicleName: "Toyota Land Cruiser",
          actor,
        }),
    },
    {
      name: "REMINDER: overdue rental (ACTIVE past end)",
      payload: () =>
        buildOverdueRentalReminderMessage({
          contractNumber: "DEMO-1012",
          vehicleName: "Jeep Wrangler",
        }),
    },
    {
      name: "REMINDER: open receivables",
      payload: () => buildOpenReceivablesReminderMessage(),
    },
    {
      name: "REMINDER: maintenance schedule missed",
      payload: () =>
        buildMaintenanceScheduleMissedMessage({
          vehicleName: "Mercedes Sprinter",
        }),
    },
    {
      name: "REMINDER: maintenance delayed",
      payload: () =>
        buildMaintenanceDelayedMessage({
          vehicleName: "Mercedes Sprinter",
        }),
    },
    {
      name: "manual_expense.created",
      payload: () => buildManualExpenseMessage({ actor }),
    },
    {
      name: "ATTENTION_MONITOR summary",
      payload: () => buildAttentionSummaryMessage(),
    },
  ];

  console.log(`Sending ${samples.length} demo Pushover messages (gap ${gapMs}ms)...`);
  for (const { name, payload } of samples) {
    await send(name, payload());
    await sleep(gapMs);
  }
  console.log("Done.");
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
