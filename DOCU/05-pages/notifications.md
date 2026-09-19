# Header Notification Center

Updated 2026-09-19.

## Scope

The header bell opens a browser-only Notification Center. It uses the shared
Popover and an isolated Zustand store; it does not call an API, write a
database record, schedule delivery, register a service worker, or use Web Push.

The demo is enabled only when `NEXT_PUBLIC_DEMO_SIMULATION_ENABLED=true` and
`isUiDemoSimulationEnabled("notifications")` is true. It is separate from the
three rental provider substitutions (`NEXT_PUBLIC_DIAMOND_SIMULATION`): License
OCR, Passport OCR, and successful Payment remain backend development actions.

## Header placement

The AppShell header keeps the action cluster (rail controls, bell, user, and
language) in the left grid area, the search field in the middle, and the
breadcrumb on the right. RTL uses explicit grid-column placement so the same
physical arrangement is preserved in Arabic. On compact phone widths the
inactive global search and breadcrumb are hidden, leaving the menu, brand,
bell, user, and language controls in one overflow-free row. The bell never uses
detached coordinates.

## Notification data and targeting

The fixture contains lifecycle examples such as unpaid contracts, unpaid
violations, overdue returns, and paid contracts awaiting handover. A fixture is
created only after a real record is loaded by one of the Contracts, Vehicles,
Dashboard, or Violations pages. Each item carries:

```text
actionTarget = {
  entityType: "vehicle" | "contract" | "violation",
  entityId: string,
  route: "/vehicles" | "/contracts" | "/violations"
}
```

Frontend-only Road Liabilities simulation rows are excluded from target
registration, so the demo never points at a synthetic identifier. If no real
record has been loaded, no notification is shown. Clicking an item marks it
read and navigates to the locale route with `?focus=<entityId>`.

## Record focus

Vehicles, Contracts, and Violations pages expose `data-record-id` (and the
contract number / vehicle external ID where applicable). The shared
`useRecordFocus` hook reads the focus query, safely does nothing for an unknown
record, and otherwise scrolls the matching row/card into view and applies a
temporary Diamond gold highlight. The highlight is removed automatically and
uses reduced-motion behavior when the user requests it.

## Center behavior

The existing filters, unread badge, mark-read actions, and scoped desktop
Notification API demo are unchanged. Desktop popover width is approximately
460px with an internal scrolling list; mobile uses the existing viewport-safe
width with a 12px outer margin. Desktop notification delivery is one summary
notification while the browser context is open, not production push.
