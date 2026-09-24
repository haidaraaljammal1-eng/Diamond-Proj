export const PUSHOVER_BUSINESS_IDEMPOTENCY_SCOPE = "pushover:business-notification";
export const ATTENTION_MONITOR_IDEMPOTENCY_SCOPE = "pushover:attention-monitor";

export const BUSINESS_NOTIFICATION_OUTBOX_TYPES = [
  "contract.signed",
  "payment.confirmed",
  "payment.failed",
  "contract.activated",
  "contract.renewed",
  "contract.return_submitted",
  "road_liability.chargeable",
  "maintenance.started",
  "maintenance.completed",
  "manual_expense.created",
] as const;

export type BusinessNotificationOutboxType = (typeof BUSINESS_NOTIFICATION_OUTBOX_TYPES)[number];
