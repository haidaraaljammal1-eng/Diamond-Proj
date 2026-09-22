# Home Dashboard Backend

`GET /dashboard/overview` (`dashboard.read`) is a read/aggregation layer. It
composes existing Prisma counts and domain services. It does **not** call
`/finance`, `/contracts`, or `/vehicles` over HTTP.

## Response (projection only)

```
{
  generatedAt, range: { from, to }, today: { from, to, offsetMinutes },
  kpis: {
    activeRentals, fleetTotal, fleetRented, fleetAvailable, fleetService,
    pendingLinks, deliveriesToday, readyForDelivery, contractsTotal
  },
  weeklyFinance: { from, to, collected, expenses, netMovement, currency, breakdown },
  weeklyRentalActivity: [{ date, rented, returned }],
  fleetStatus: { total, available, rented, service },
  todayDeliveries: [{ id, contractNumber, customerName, vehicleName, startAt, status, company }],
  recentContracts: [{ id, contractNumber, customerName, vehicleName, employeeName, status, company }],
  gpsOnline
}
```

Every cross-domain field/section is **nullable** when the viewer lacks that
domain read permission, or when the section failed. `null` never means zero.

## Operating company scope

`GET /dashboard/overview?companyId=<OperatingCompany id>` filters the overview.
Omitting it is All Companies. `companyScope` (including GENERAL) is 422
`DASHBOARD_COMPANY_SCOPE_UNSUPPORTED` — GENERAL is a Finance classification, not
a dashboard company.

| Section | Filter |
| ------- | ------ |
| Fleet counts / `fleetStatus` | `Vehicle.companyId` |
| Contract KPIs, today's deliveries, recent contracts | `Contract.companyId` |
| Weekly rental activity | Contract company on Car-Out / Car-In |
| Weekly finance | `FinancialLedgerEntry.companyId`. All Companies adds no predicate, so GENERAL stays in the total. A selected company excludes it. |
| GPS online | `Vehicle.companyId` inside `gps.summary`. The GPS HTTP route is unscoped. |

Row `company` is still `{ id, code, displayName, accentColor }` from
`Contract.companyId` in the same query (`COMPANY_REF_SELECT`), never the
Vehicle's current company.

## Composition

| Section | Source |
| ------- | ------ |
| Fleet counts | `VehiclesService.activeFleetStatusCounts()` — `isActive = true`, grouped by `operationalStatus` |
| Contract KPIs / lists | Prisma `count` / `findMany` with status sets in `dashboard.constants.ts`, vehicle labels via `vehicleDisplayName` |
| Weekly finance | `FinanceAnalyticsService.sumCollected` + `sumExpenses` + `movementBreakdown` (same Collected / Expenses rules as Finance) |
| Weekly rental | `ContractCarOut.occurredAt` / `ContractCarIn.occurredAt` in the 7-day window |
| GPS online | `GpsService.summary().online` (`providerConfigured: false` still returns 0, no throw) |

## Window

Last **7 consecutive calendar days** in the BUSINESS timezone
(`resolveLastNCalendarDays` — `resolveLastNBusinessDays` is a compatibility
alias). “Business” means the reporting offset, **not** weekdays. Saturday and
Sunday are included. A day with no Car-Out / Car-In / finance movement still
appears (rental buckets as zero). `to` is exclusive. Today’s deliveries use
`resolveBusinessDay` against Contract `startAt`. Weekly finance uses the same
`from` / `to` as weekly rental activity.

## Status sets

- Active rentals: `ACTIVE`, `RETOUT`
- Pending links: `AWAITING`, `FORM`
- Today’s deliveries (pending hand-over): `AWAITING`, `FORM`, `SIGNED`, `PAID`
- Ready for delivery: `PAID`

Queries are bounded: fleet `groupBy`, 7-day Car-Out/Car-In timestamps only,
today’s `startAt` range, recent contracts `take 5`. Customer and vehicle names
are selected in the same `findMany` (no N+1).
