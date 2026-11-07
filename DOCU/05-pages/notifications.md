# Header Notification Center

Updated 2026-11-07.

## Scope

The AppShell header bell opens the staff Notification Center. Inbox rows come
from Backend `GET /notifications` (permission `notifications.read`), newest
first, and include **only** mirrored Pushover alerts (`eventKey =
pushover.staff_alert`). Other IN_APP notifications (e.g. legacy
`road_liability.chargeable`) are not listed in the bell.

The list is polled about every 30 seconds while the tab is visible and
refreshed when the popover opens — no full page reload required.

## Pushover → in-app mirror

Every **successful** shared Pushover send (instant business events and the
Daily Operations & Receivables digest) is mirrored centrally in
`NotificationService.send` into IN_APP rows for every ACTIVE user who holds
`notifications.read`.

- Event key: `pushover.staff_alert`
- Stored fields: title, body, createdAt (send time)
- Deduped with `dedupeKeyPrefix` from the business idempotency key (or
  provider request id / content fingerprint)
- Failed Pushover sends are not mirrored
- Secrets (tokens/keys) are never stored

### Retention

Mirrored Pushover rows expire after **48 hours** from `createdAt`:

- List / unread APIs hide expired rows even before cleanup
- Background runner deletes expired `pushover.staff_alert` rows

Other IN_APP event keys (e.g. complaints) are not TTL-deleted by this cycle.

## Header placement

Unchanged: action cluster (rail, bell, user, language) left; search middle;
breadcrumb right. RTL keeps the same physical arrangement.

## Center behavior

Filters: Unread / All. Mark one or mark-all-read. Rows show title, body text,
and relative send time. Clicking an unread row marks it read.
