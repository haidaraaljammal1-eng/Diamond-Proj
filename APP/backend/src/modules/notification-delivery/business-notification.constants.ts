export const PUSHOVER_BUSINESS_IDEMPOTENCY_SCOPE = "pushover:business-notification";
export const ATTENTION_MONITOR_IDEMPOTENCY_SCOPE = "pushover:attention-monitor";
export const OVERDUE_RENTAL_REMINDER_IDEMPOTENCY_SCOPE = "pushover:overdue-rental-reminder";
export const OPEN_RECEIVABLES_REMINDER_IDEMPOTENCY_SCOPE = "pushover:open-receivables-reminder";
export const MAINTENANCE_SCHEDULE_MISSED_IDEMPOTENCY_SCOPE = "pushover:maintenance-schedule-missed";
export const MAINTENANCE_DELAY_IDEMPOTENCY_SCOPE = "pushover:maintenance-delay";
/** Unified 3×/day scheduled digest (replaces the five legacy scheduled monitors). */
export const DAILY_OPERATIONS_DIGEST_IDEMPOTENCY_SCOPE = "pushover:daily-operations-digest";

export const BUSINESS_NOTIFICATION_OUTBOX_TYPES = [
  "payment.confirmed",
  "payment.failed",
  "payment.authorization_incomplete",
  "contract.activated",
  "contract.renewed",
  "contract.return_submitted",
  "contract.closed",
  "road_liability.received",
  "maintenance.started",
  "maintenance.completed",
  "manual_expense.created",
] as const;

export type BusinessNotificationOutboxType = (typeof BUSINESS_NOTIFICATION_OUTBOX_TYPES)[number];
