# GPS multi-provider foundation and read contracts

Data model and invariants for multiple GPS vendor accounts. Provider transport,
scheduled latest-state sync, transient reports, and health projections are now
implemented read-only capabilities.

## Concepts

| Concept | Role |
| --- | --- |
| `GpsProviderAccount` | Technical integration account (credentials, sync health, optional company scope). |
| `OperatingCompany` | Diamond business owner on `Vehicle.companyId` — authoritative for fleet UI filters. |
| `VehicleGpsBinding` | **Current** device assignment for one vehicle. |
| `VehicleGpsBindingHistory` | Append-only row when assignment changes (rebind/deactivate). |
| `VehicleGpsLatestState` | Normalized **latest** telemetry only (no history table). |

Provider account scope (`companyScopeId`) is optional. When set, only vehicles with matching `Vehicle.companyId` may bind. Example deployment: Live GPS account scoped to ELITE is **configuration**, never `providerKey === ELITE` hardcode.

## Provider registry

Adapters register by `providerKey` (e.g. `LIVE_GPS`). `LiveGpsAdapter` implements **transport + mapping only** under `providers/live-gps/` (client, session, mappers). It does **not** ingest, schedule sync, or set staff `providerConfigured`.

## Account semantics (Phase 1.1)

| Concept | Meaning |
| --- | --- |
| **Configured** | Local prerequisites to *attempt* provider use: supported `providerKey` + stored credentials (`secretEncrypted`). Not auth success, not reachability. See `gps-provider-account.semantics.ts`. |
| **Enabled** | `GpsProviderAccount.enabled` — automatic background sync **may** run. Does **not** gate binding/rebind. |
| **Health** | Derived at runtime from sync/auth outcomes (`CONNECTED`, `STALE`, …). Persist only operational **facts** (`lastFailureCode`, `lastSuccessfulSyncAt`, …), not ephemeral session state. |

Staff `providerConfigured` on read APIs reflects **local configuration** (supported provider + stored credentials), not `enabled` or sync health. Test override via `setGpsProviderForTests` excepted.

Disabling an account stops future sync (later phases) but does **not** remove bindings or clear `VehicleGpsLatestState`.

## Binding invariants

Enforced by `createGpsBindingService()`:

1. Vehicle exists; provider account exists (enabled flag is **not** required).
2. Company scope respected when `companyScopeId` is set.
3. At most one **active** binding per vehicle (`vehicleId` unique).
4. At most one **active** vehicle per `(providerAccountId, externalDeviceId)` (partial unique index).
5. Rebind appends history and clears latest state when account or device id changes.
6. `providerKey` on binding is denormalized from the account and updated on write.

## Telemetry vs metadata

- **Binding:** static device fields (`externalDeviceUid`, `simNumber`, `installationDate`, `providerDeviceExtras`, …).
- **Latest state:** coordinates, motion, unit-aware odometer/fuel/battery fields, `providerDeviceState` (not Diamond offline status).
- **Live GPS units (verified):** fleet `speed` → km/h (`speedKph`); fleet `meter` → cumulative odometer **meters**; `driventoday` → **kilometers** today; history `meter` → **segment** meters (not odometer).
- **DeviceOnOFF:** allowlisted extras only — not Diamond online/offline (`capturedAt` + threshold remains authoritative).

## Provider extras policy

`providerDeviceExtras` and latest `providerExtras` accept small allowlisted primitives only. Forbidden: passwords, cookies/tokens, raw fleet JSON, driver phone/name/id.

## Credentials

`GpsProviderAccount.secretEncrypted` uses the same AES-GCM helpers as integrations (`secret-blob.ts`). Never returned by APIs or logs. Session cookies (`Userlog`) are **not** stored.

## Read API compatibility

`providerConfigured` on `GET /gps/*` still follows `createGpsProvider().configured` (false until sync phase). Provider-account filters and health UI come in later phases.

## Live GPS transport (Phase 2)

| Item | Status |
| --- | --- |
| Login `POST /auth/MainUser` (`username`, `pass`) | VERIFIED |
| Session cookie `Userlog` + Max-Age | VERIFIED |
| `text/plain` bodies with JSON arrays | VERIFIED |
| Fleet `GET /User/dash_getAllMainDeviceList` | VERIFIED — primary live snapshot |
| Devices `GET /User/getvehiclelistbyid` | VERIFIED — static metadata (not per poll) |
| History `POST /User/getHistory` (`deviceid`, `stdate`, `eddate`) | VERIFIED — read-only client, not persisted |
| `lastdata` + `UTimeZone` → `capturedAt` | VERIFIED |
| `Cutdate` | VERIFIED snapshot reference time — not `capturedAt` |
| Provider `ign` → `ignitionOn` | VERIFIED — boolean; readable telemetry only (not remote control) |
| Provider `motion` | OBSERVED — non-authoritative; Diamond motion from `speedKph` at ingest |
| `actign`, `actspeed`, `actmotion` | OBSERVED mirror / not canonical — provider extras only |
| fuel/battery/charge | UNRESOLVED |
| Remote immobilizer API | UNRESOLVED — no commands in Diamond |
| Official/public API stability, rate limits | UNRESOLVED |

`sourceEventId` for Live GPS is a **Diamond SHA-256 idempotency key**, not a provider event id.

Session `Userlog` is **in-memory only** (never Prisma). Staff `providerConfigured` remains fail-closed.

## Current read-only contract

Detail, history, mileage, overspeed, and health responses are provider-neutral.
Provider keys, provider account IDs, external device IDs, device IDs, IMEI/SIM
values, cookies, and raw provider fields remain backend-only. History,
mileage, and overspeed are on-demand and transient; no report or playback
history is persisted.

LIVE_GPS provider-local timestamps are parsed explicitly with the account
timezone offset when valid, otherwise `+04:00`. Host machine timezone is never
used. Fleet odometer values remain cumulative meters, history distances remain
segment meters, mileage values are kilometers, speeds are km/h, and health age
is seconds.

Deferred capabilities are alerts/events, battery/power authority, trip
semantics, geofence geometry/overlay, POIs, expiry warnings, and remote
control. `DeviceOnOFF`, battery, charge, fuel, and provider status fields are
not Diamond health authorities.

## Device health and model (Phase 6E-B)

`GET /gps/vehicles/:vehicleId/health` is a staff-only, read-only projection. It
requires `gps.read` and returns Diamond-derived health from the latest accepted
`capturedAt`, plus the last communication timestamp and an optional provider
device model.

- `ONLINE` means communication age is at most 2 minutes.
- `STALE` means age is over 2 minutes and at most the configured
  `GPS_OFFLINE_AFTER_MINUTES` threshold (10 minutes by default).
- `OFFLINE` means age exceeds that threshold or no latest state exists.
- The derived health state is not persisted.
- `DeviceOnOFF`, provider `status`, `LastSec`, `shr`, battery, charge, and fuel
  are not connectivity authorities.
- `deviceModel` is fetched on demand from provider metadata and is never
  coupled to health availability.
- Provider identifiers, IMEI, SIM, raw provider fields, installation date, and
  expiry are not returned.
- Installation-date and `experied` semantics remain unresolved; no expiry
  warning or installation business behavior is implemented.

## Phase 3 — controlled real-account PoC

Operator-only script (not HTTP): `npm run gps:poc:store-credentials` then `npm run gps:poc:run` from `APP/backend`.

- Loads ELITE-scoped `LIVE_GPS` `GpsProviderAccount` (creates `accountKey=elite` when none exists).
- Credentials via `LIVE_GPS_POC_USERNAME` / `LIVE_GPS_POC_PASSWORD` in local `.env` or interactive prompts → `secretEncrypted` only.
- One `POST /auth/MainUser`, one `GET /User/dash_getAllMainDeviceList`, optional `--device-list`.
- Prints **sanitized aggregate JSON only** (counts, units, offsets) — no coordinates, PII, cookies, or raw JSON.
- Does **not** call `ingestLatestPosition`, scheduler, or change staff `providerConfigured`.

Optional DB override: `GPS_POC_DATABASE_URL` (defaults to `DATABASE_URL`).

## Phase 5B — automatic sync foundation

| Item | Behavior |
| --- | --- |
| Driver | `runGpsProviderSyncCycle()` in `background-runner` (scheduler tick; isolated try/catch). |
| Account selection | `enabled = true` **and** locally configured (`supported providerKey` + `secretEncrypted`). Disabled → **zero** provider HTTP. |
| Cadence | **60s** minimum between real attempts per account (`lastAttemptAt`). Skipped lease/not-due cycles do not advance `lastAttemptAt`. |
| Multi-replica lock | `syncLeaseOwner` + `syncLeaseExpiresAt` on `GpsProviderAccount`; acquire only when lease null or expired; **no** same-owner re-acquire while active; TTL **120s**; release in `finally` when owner matches. |
| In-process guard | Per `providerAccountId` in-flight set (defense in depth). |
| Fleet read | **One** `fetchFleetSnapshot` per account per cycle via registry adapter — never per-vehicle HTTP, never history/control in sync. |
| Binding | Active `VehicleGpsBinding` by `(providerAccountId, externalDeviceId)` only — no plate auto-bind. Unbound fleet rows counted, not ingested. |
| Ingest | Existing `ingestLatestPosition` — stale/duplicate skip observers; replace runs Salik inference (informational `GPS_INFERENCE` only). |
| Sync facts | `lastAttemptAt`, `lastSuccessfulSyncAt`, `lastFailureAt`, `lastFailureCode`, `lastDeviceCount` on fetch outcome. |
| Staff `providerConfigured` | `true` when **any** locally configured supported account exists (independent of `enabled` / health). |
| Activation | `enabled` remains operator-controlled — infrastructure can ship with all accounts `enabled=false`. |
| Remote control | **Not supported** — sync is read-only (auth + fleet list). |

Live GPS session `Userlog` stays in-memory per process (`LiveGpsSessionManager`), keyed by `providerAccountId`.

## Phase 6B — on-demand history and client-side playback

Staff history is an additive read path behind the same provider registry:

```
GET /gps/vehicles/:vehicleId/history
  → active VehicleGpsBinding
  → GpsProviderAccount
  → adapter.fetchHistory()
  → normalized transient DTO
```

The caller supplies only a Diamond `vehicleId` plus optional ISO `from` / `to`
timestamps. Provider account/device identity, credentials, endpoint and
`Userlog` remain backend-only. Permission remains `gps.read`; there is no public
or customer history route.

| Policy | Behavior |
| --- | --- |
| Default range | Last 24 hours when both `from` and `to` are omitted |
| Maximum range | 7 days; no silent expansion |
| Maximum result | 10,000 provider rows/normalized points; larger results return `GPS_HISTORY_RESULT_TOO_LARGE` |
| Fetch | Explicit staff action only; no polling and no GPS sync lease |
| Persistence | None — no history/trip/playback table and no DB cache |
| Playback | Frontend-only over the returned points; no additional provider requests |

LIVE_GPS converts UTC request instants to provider-local UAE time (`+04:00`) in
exact `YYYY-MM-DD HH:mm` form. Response `device_dt` values are parsed explicitly
with `+04:00` and returned as UTC ISO timestamps. History `meter` is segment
distance in **meters**; it is never mapped to the live cumulative odometer.
History `speed` is km/h. Provider `motion` remains non-authoritative and is not
returned by the staff history DTO; ignition and heading are omitted because the
verified history payload does not provide them.

History reads share the in-process `LiveGpsSessionManager` with scheduled fleet
sync, including the existing single-flight login and one auth-loss retry. They
do not call `ingestLatestPosition`, mutate `VehicleGpsLatestState`, invoke GPS
accepted-position observers, create Salik inference, update Vehicle/Contract, or
change scheduler cadence/account leases.

Providers with `staticCapabilities.history=false` or no `fetchHistory`
implementation return `GPS_HISTORY_UNSUPPORTED`. Other sanitized history
reasons include invalid/range-too-large/result-too-large, missing active binding,
provider auth/unavailable, and invalid provider response. Responses and routine
logs never include external device id, coordinates in log fields, addresses,
cookies, credentials, IMEI, SIM or raw provider payload.

## Phase 6D — read-only reports

Staff report routes use the same active binding, provider account and
`LiveGpsSessionManager` resolution as History. The frontend sends only the
Diamond vehicle id.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/gps/vehicles/:vehicleId/mileage-summary` | Today, yesterday, this month and last month in kilometers |
| GET | `/gps/vehicles/:vehicleId/overspeed?date=YYYY-MM-DD&thresholdKph=N` | Normalized overspeed events for the selected provider-local date |

Mileage Summary is a provider quick-summary report. Custom-range mileage
continues to be derived from History segment distances and is not persisted.
The overspeed threshold is a report request parameter; Diamond does not expose
or mutate a provider speed setting. Trips are not inferred or segmented:
Timeline/Playback remains the existing History path.

Overspeed rows provide a report date plus local start/end times. Diamond parses
each timestamp explicitly with the configured provider offset (`+04:00`) and
does not use generic JavaScript date parsing. The provider contract does not
prove whether an end time earlier than its start is a next-day event, so the
current mapper preserves the supplied report date for both values rather than
guessing midnight-crossing semantics.

Both report responses are transient, staff-only (`gps.read`) and provider
neutral. External device identifiers and provider-specific row fields remain
backend-only. Unsupported provider capabilities return a stable unsupported
error rather than a fabricated result. Report calls are read-only and do not
touch scheduled sync, leases, latest state, observers, bindings or schema.
