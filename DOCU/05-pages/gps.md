# GPS Operations Center

Staff Operations page for Diamond fleet tracking. No GPS vendor is integrated yet. The backend is safe with **GPS Provider = NOT CONFIGURED**: read APIs return 200, never fake coordinates, and never invent a vendor.

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
| GET | `/gps/vehicles` | Paginated vehicle cards with GPS + current rental |
| GET | `/gps/map-points` | Lightweight points with real coordinates only |
| GET | `/gps/vehicles/:vehicleId` | One vehicle GPS detail |

A future GPS page can be built from these four calls. Do not hydrate per-row Vehicle/Contract/GPS detail APIs.

## Provider boundary

```
Vehicle / Contract  →  GPS domain  →  GpsProvider  →  future adapter  →  vendor API
```

Today: `GpsUnconfiguredProvider` (`configured = false`, no network). `GPS_ENABLED` is intent only and does not conjure a configured provider.

When a real vendor is documented, add an adapter under `providers/` and select it from `createGpsProvider()`. Do not put vendor HTTP inside Vehicles or Contracts.

## Persistence

- `VehicleGpsBinding` — one Diamond Vehicle to one future external device (`providerKey` string, `externalDeviceId`). **Not auto-created.**
- `VehicleGpsLatestState` — one latest normalized position per vehicle/binding.

No GPS history/event table in this phase. No reverse geocoding. No engine/lock/geofence/trip APIs.

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
