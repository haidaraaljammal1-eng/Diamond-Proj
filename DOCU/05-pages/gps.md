# GPS Operations Center

Staff Operations page for Diamond fleet tracking. LIVE_GPS / ELITE supplies
read-only live telemetry through the provider adapter and the backend remains
safe when no provider is configured: ordinary read APIs return 200, never fake
coordinates, and never invent a vendor.

Demo Simulation, if used, is frontend-only and must never persist fake GPS to this API.

## Frontend

Route: `/ar/gps` and `/en/gps`. Permission: `gps.read`. Architecture: Page → `useGps` → Zustand store → `gps.api.ts` → Fastify.

Visual hierarchy: map is the working surface, then selected vehicle, then fleet panel, then compact KPIs. Desktop uses a ~70/30 map/panel split filling remaining viewport height. Mobile stacks map (~45vh), selected row, then the list.

Map: Leaflet + OpenStreetMap tiles, `dynamic(..., { ssr: false })`. Markers only from `GET /gps/map-points` in real mode. Custom champagne pins — no default Leaflet blue markers.

Row-level `trackingStatus=online` still means fresh + unknown motion. Summary KPI Online is all fresh locations (moving + parked + row-level online). The frontend displays backend values; it does not re-derive them.

Fleet GPS actions route to `/gps?vehicleId=`. Missing coordinates still select the vehicle and show “No GPS data available for this vehicle.”

The historical GPS presentation simulation remains disabled by the general demo gate. Its retained fixture code overlays 5–8 real vehicles with in-memory Dubai points and one moving path, with no GPS writes. `NEXT_PUBLIC_DEMO_SIMULATION_ENABLED=true` currently activates only scoped Dashboard, WhatsApp, and Road Liabilities demos, not GPS.

## Endpoints

All staff-authenticated. Permission: `gps.read`. No public or customer GPS routes.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/gps/summary` | Fleet GPS KPIs |
| GET | `/gps/vehicles` | Paginated vehicle cards with GPS + current rental. Filters: `search`, `status`, `trackingStatus`, `companyId`, `sort`, paging |
| GET | `/gps/map-points` | Lightweight points with real coordinates only |
| GET | `/gps/vehicles/:vehicleId` | One vehicle GPS detail |
| GET | `/gps/vehicles/:vehicleId/history?from=&to=` | Bounded, on-demand normalized history |

History defaults to the last 24 hours, has a 7-day maximum and rejects results
over 10,000 points. It is fetched only after explicit staff action and is never
polled by the live scheduler.

## Provider boundary

```
Vehicle / Contract  →  GPS domain  →  provider registry  →  adapter  →  vendor API
```

Today, the LIVE_GPS adapter owns authentication, live fleet reads and on-demand
history reads. Automatic fleet sync runs through the Phase 5B orchestrator;
history goes directly through the adapter and shared session manager without a
sync lease. Other providers remain capability-gated.

`GpsProviderAccount.enabled` controls whether automatic sync may run later — it does **not** block binding/rebind. Disabling an account does not clear bindings or latest GPS state.

Adapters live under `providers/` (e.g. `LIVE_GPS` skeleton). Do not put vendor HTTP inside Vehicles or Contracts.

See [gps-multi-provider.md](../04-api-contracts/gps-multi-provider.md).

## Persistence

- `GpsProviderAccount` — vendor login / fleet namespace; optional `companyScopeId` (restricts which `Vehicle.companyId` may bind). ELITE-only Live GPS is **configured scope**, not code hardcode. Credentials in `secretEncrypted` only.
- `VehicleGpsBinding` — **current** device assignment per vehicle (`providerAccountId`, `externalDeviceId`, static device metadata). **Not auto-created.**
- `VehicleGpsBindingHistory` — append-only prior assignments on rebind/deactivate.
- `VehicleGpsLatestState` — one latest normalized position per vehicle; extended nullable telemetry with explicit units where needed.

There is no GPS position history/event table. History/Playback is transient:
the backend resolves the active binding, fetches a bounded provider range and
returns normalized points. It does not mutate latest state, run observers or
create Salik inference. No reverse geocoding and no immobilizer commands.

## History / Playback

The detail drawer exposes History / Playback only for an actively bound vehicle.
Presets are Last 1 hour, Last 6 hours and Last 24 hours; Custom uses the shared
DateRangePicker and cannot be fetched above 7 days. UAE provider time is shown
as UTC+4 while timestamps use normal localized display.

The history map renders one polyline plus start, end and active playback markers.
Play, Pause, Restart, scrubber and 1×/2×/4×/8× are entirely client-side over the
already-fetched point array. The summary shows total segment distance, maximum
speed, range, duration and point count. It does not invent trip count, idle time
or parking duration. Provider device id, IMEI and SIM are never shown.

## Tracking status (row-level)

Derived centrally (`deriveTrackingStatus`). `OFFLINE` is never stored. These values are unchanged on list, map, and detail.

| Status | When |
| --- | --- |
| `not_configured` | Provider not configured |
| `unassigned` | Configured, no active binding |
| `no_data` | Active binding, no location |
| `offline` | Location older than `GPS_OFFLINE_AFTER_MINUTES` (default 10) — stale location |
| `moving` | Fresh + motion MOVING (`speed > GPS_MOVING_SPEED_THRESHOLD_KPH`, default 3) |
| `parked` | Fresh + motion PARKED |
| `online` | Fresh location + motion UNKNOWN (speed missing) |

List filter `trackingStatus=online` still matches this row-level value (fresh + unknown motion), not the summary Online total.

## Summary KPIs (`GET /gps/summary`)

API field names are unchanged. Summary `online` is **not** the row-level `online` count.

| Field | Meaning |
| --- | --- |
| `trackedVehicles` | Active GPS bindings on active vehicles |
| `moving` | Row-level `moving` count — subset of Online |
| `parked` | Row-level `parked` count — subset of Online |
| `online` | **All vehicles with a fresh GPS location** = `moving` + `parked` + row-level `online` |
| `offline` | Stale location |
| `noData` | Active binding, no location yet |
| `unassigned` | Active vehicles with no active binding |

Moving and Parked are subsets of summary Online. Offline, no-data, and unassigned are not.

## Mileage and overspeed reports

The selected vehicle drawer provides explicit, read-only actions for the
provider quick Mileage Summary and the Overspeed report. Mileage shows Today,
Yesterday, This Month and Last Month in kilometers. Custom-range mileage and
Timeline/Playback remain History-derived; the UI does not invent trip
segments, idle time or parking duration.

Overspeed accepts a provider-local date and a report-level threshold in km/h.
Returned events show start, end, duration, maximum speed, average speed and
address when supplied by the provider. Report data is fetched on demand only,
is not persisted, and never changes provider settings, scheduled sync, latest
state, bindings or observers. Provider identities remain backend-only.

## Device health

The detail drawer also loads a compact, read-only health projection. Health is
derived only from the latest accepted Diamond `capturedAt`:

- Online: communication age up to 2 minutes.
- Stale: over 2 minutes through the configured 10-minute offline threshold.
- Offline: older than that threshold or no latest state.

The drawer shows localized last-communication time and the provider device model
when available. Device model metadata is fetched on demand and is not polled
with live synchronization. Provider `DeviceOnOFF`, provider status, battery,
charge, fuel, installation date, expiry, IMEI, and SIM are not displayed or
used as health authority.

## Deferred GPS capabilities

Alerts/events, battery/power health, expiry warnings, trip semantics,
geofence geometry/overlay, and POIs are not implemented. Remote vehicle
control is prohibited; the GPS integration is read-only.

Provider identity and device identifiers are not part of the staff-facing GPS
detail, history, mileage, overspeed, or health contracts.

## Current not-configured behaviour

- `GET /gps/summary` → 200, `providerConfigured: false`, motion buckets 0
- `GET /gps/vehicles` → real active Diamond vehicles, `gps.trackingStatus = not_configured`, coordinates `null`
- `GET /gps/map-points` → `[]`
- Do **not** return `GPS_NOT_CONFIGURED` on ordinary reads (that error is reserved for a future sync/management action)

## Ingestion

Internal `ingestLatestPosition` (not a public route). Future adapters call it **after** the provider HTTP round-trip, then a short DB transaction persists latest state. Validates lat/lng/speed/heading; ignores stale `capturedAt`; same `sourceEventId` is idempotent. Exact coordinates are not logged.

Accepted ingest (not stale/duplicate) notifies a GPS position observer **after** the GPS transaction with `{ previous, current }` only. Road Liabilities uses that for Salik crossing **predictions**. A GPS possible Salik crossing is derived Contract intelligence (`roadLiabilitySignals`) only: informational, non-blocking, never debt, never a Contract/Vehicle status change. Observer failure must not roll back GPS latest-state. See `DOCU/05-pages/violations-salik.md`.

## currentRental

Reuses `loadCurrentRentalsByVehicleIds` (PAID / ACTIVE / RETOUT). GPS adds `contractNumber` and `startAt`. Staff may see customer display name because Vehicles already does. Map points expose only `contractId` / `contractNumber`. REVIEW after Car-In is not currentRental.

## Operating company

GPS is company-aware without storing a company anywhere.

| Question | Answer |
| --- | --- |
| Where does the company come from? | `Vehicle.company` on the GPS read models |
| Is it persisted? | **No.** `VehicleGpsBinding` and `VehicleGpsLatestState` hold no company |
| Does a provider ever see it? | **No.** Provider accounts store integration metadata only |

`GpsVehicleSummary` and `GpsMapPoint` carry the compact ref (`id`, `code`,
`displayName`, `accentColor`). `GET /gps/vehicles?companyId=` filters
`Vehicle.companyId` inside Diamond's own query layer and composes with `search`,
`status` and `trackingStatus`. Company is Diamond business metadata — it is
never part of a vendor payload, a device binding or a normalized position.

Frontend: the shared `CompanyIdentity` appears on the fleet-panel row (beside the
vehicle name, above the tracking and operational chips) and in the vehicle detail
drawer under the plate. The panel gains a Company filter (All Companies / UNIQUE /
ELITE) from the authoritative `useOperatingCompanies()` chain.

**The map is deliberately not company-filtered.** Search and tracking filters
already scope the fleet list only, and markers stay free of company chrome;
company identity belongs to the row and the detail surface. Demo Simulation still
never persists GPS, and an overlay point with no real vehicle behind it carries
`company: null` rather than an invented company.

See [operating-companies.md](../00-system-overview/operating-companies.md).

## Privacy

- `gps.read` staff only
- No public rental-token GPS
- No provider credentials or raw payloads in API/logs/DB
- No fake backend GPS / demo telemetry seed

## Config

```
GPS_ENABLED=false
GPS_OFFLINE_AFTER_MINUTES=10
GPS_MOVING_SPEED_THRESHOLD_KPH=3
```

Do not add vendor URL/key env vars until official provider documentation exists.
