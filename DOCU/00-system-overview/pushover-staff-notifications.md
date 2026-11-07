# Pushover staff notifications (backend)

Updated 2026-11-07.

## Scope

Backend Pushover messages for Diamond business events and scheduler cycles. All
notifications use the shared Pushover app token and user key from environment
(`PUSHOVER_APP_TOKEN`, `PUSHOVER_USER_KEY`). Message title comes from
`PUSHOVER_NOTIFICATION_TITLE` (default `Diamond Rent Car`).

## Staff line (`By:`)

Action-driven notifications (outbox events 1–11) end with:

`By: {staffDisplayName}`

**Source of truth:** `User.name` (employee full name from the Team / Add Employee
form) for the domain actor of that event (e.g. `ContractPayment.createdByUserId`,
`ContractCarOut.performedByUserId`, `RoadLiability.staffEnteredByUserId`).

If `name` is blank, the code falls back to `User.email`. When there is no linked
user or no resolvable name/email, the message omits the `By:` line entirely
(no placeholder value).

## Instant business events (1–11)

Unchanged. Delivered by `business-notification-outbox.consumer` from
`DomainOutboxEvent` rows. Scheduler digests must not alter these paths.

## In-app inbox mirror

Successful Pushover sends are also written to the staff Notification Center
(`pushover.staff_alert`, 48h retention). See `DOCU/05-pages/notifications.md`.

## Unified scheduled digest — Daily Operations & Receivables

When `DAILY_OPERATIONS_DIGEST_ENABLED=true`, the worker sends **one** Pushover
message per due slot at `DAILY_OPERATIONS_DIGEST_TIMES` (default
`09:00,14:00,19:00`) in `ATTENTION_MONITOR_TIMEZONE` (`Asia/Dubai`).

- Appointment times stay 09:00 / 14:00 / 19:00. After a slot’s wall-clock time
  has arrived, the same `{date}:{slot}:{timezone}` key remains retryable until
  it reaches a terminal state (failed sends are retried on later scheduler
  ticks — including after the scheduled minute ends).
- Durable claim/delivery state on `IdempotencyKey.resultRef` (scope
  `pushover:daily-operations-digest`): `digest:inflight:{ms}`,
  `digest:failed:{ms}`, `digest:sent`, `digest:skipped-empty`.
- `runIdempotent` is **not** used here: it cannot reopen a key after a failed
  side effect. Claiming uses create-first + CAS reclaim for failed/stale
  inflight (stale window default 2 minutes).
- Fresh snapshot every attempt. Empty evaluation marks `skipped-empty`.
- Open receivables are loaded unpaginated (`listAllOpenReceivableRows`).
- Message is counts-only (no customer, vehicle, contract, or staff lines).

### Categories

| Section | Category | Source |
| --- | --- | --- |
| Financial | Unpaid Rentals | Finance open receivables `RENTAL` (`SIGNED`, no trusted rental collection) |
| Financial | Unpaid Renewals | Finance open receivables `RENEWAL` (awaiting payment **and** office unpaid) |
| Financial | Traffic Violations | Open `ROAD_LIABILITY` rows classified non-Salik |
| Financial | Salik | Open `ROAD_LIABILITY` rows classified Salik (`SALIK_*` / `staffChargeCategory=SALIK`) |
| Financial | Reconciliation | Finance open receivables `RECONCILIATION` |
| Financial | Post-Close Receivables | Finance open receivables `POST_CLOSE_RECEIVABLE` |
| Ops | Vehicles Awaiting Return | `Contract.status=ACTIVE` and `endAt < now` |
| Ops | Scheduled Maintenance Not Started | `MaintenanceOrder.status=SCHEDULED` and `scheduledAt < now` |
| Ops | Maintenance Completion Delayed | `MaintenanceOrder.status=IN_SERVICE` and `expectedCompletionAt < now` |

Financial rows use the same projection as Finance `listOpenReceivables` (no
paid/closed/cancelled obligations).

### Legacy monitors (superseded)

These five scheduled monitors are **not** wired in `background-runner` anymore.
If somehow invoked while the digest flag is on, they no-op:

1. Attention Monitor
2. Open Receivables Reminder
3. Overdue Rental Reminder
4. Maintenance Schedule Missed Reminder
5. Maintenance Delay Reminder

Keep their env flags `false` when the digest is enabled.

## Implementation files

- `daily-operations-digest.service.ts` / `.queries.ts` / `.types.ts` /
  `.delivery-state.ts`
- `business-notification.messages.ts` (`buildDailyOperationsDigestMessage`)
- `business-notification-outbox.consumer.ts` (instant 1–11)
- `worker/background-runner.ts` (digest cycle only for scheduled Pushover)
