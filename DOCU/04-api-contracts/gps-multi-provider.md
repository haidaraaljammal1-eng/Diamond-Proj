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

Provider adapters receive a provider-neutral runtime. The runtime resolves a
session manager by provider key; provider-specific clients keep ownership of
authentication, cookie/session payloads, and account-keyed single-flight
behavior. Generic GPS services do not depend on a vendor session type.

Phase 2 adds a memory-only `SevenStarsSessionManager` under
`providers/seven-stars/`. It is registered in the runtime under `SEVEN_STARS`
and keys both cached sessions and login flights by `providerAccountId`.
Authentication is limited to the confirmed `POST /api/session` login flow;
device, position, report, command, and WebSocket integrations are deferred.

Phase 3 adds read-only Seven Stars fleet snapshots through `GET /api/devices`
and `GET /api/positions`. Devices map to `externalDeviceId` from `device.id`;
positions are correlated by `deviceId`, with `fixTime` then `deviceTime` used
for `capturedAt` and `serverTime` used for `receivedAt`. Traccar speed is
treated as knots and converted once to `speedKph` using `1.852`. Invalid
positions produce metadata-only snapshots and do not refresh location state.
No Seven Stars accounts, bindings, database migrations, frontend behavior,
history, trips, commands, or WebSocket integration are included.

Seven Stars device connectivity is kept separate from GPS fix validity:
`device.status` is stored in the device-level `providerDeviceExtras` allowlist,
while invalid or missing positions still produce `telemetry = null`. This does
not create synthetic location data and does not alter LIVE_GPS telemetry
semantics.

## Seven Stars Phase 4A smoke test

The explicit local command `npm run gps:seven-stars:smoke` reads the five
`SEVEN_STARS_*` values from `APP/backend/.env` and uses only the existing
Seven Stars client, session manager, and in-memory mapper. It is intentionally
not part of server startup, scheduler execution, ingest, or database setup.
The allowlisted provider requests are `POST /api/session`, `GET /api/devices`,
and `GET /api/positions`. The command runs ELITE first, then UNIQUE only after
ELITE succeeds, recreates each in-memory session locally, and reports counts
and normalization checks without printing credentials, cookies, coordinates,
raw payloads, or device identifiers.

The first controlled real-network run stopped during the ELITE request with a
provider timeout before device/position shape verification. UNIQUE was not
attempted. No database client or write path is imported by the command, so no
accounts, bindings, vehicles, or latest states are created by Phase 4A.
The configured base URL is plaintext HTTP; production use requires a future
TLS, VPN, or private-network decision.

## Seven Stars Phase 4B account provisioning

The explicit command `npm run gps:seven-stars:provision:phase4b` provisions the
two disabled (`enabled = false`) `SEVEN_STARS` accounts only. It resolves the
`ELITE` and `UNIQUE` `OperatingCompany` rows, stores `{ username, password }`
through the existing AES-GCM `secretEncrypted` contract, and uses a single
transaction for the two account rows. It never creates bindings, vehicles, or
latest states and does not enable scheduler sync.

The Phase 4B provisioning transaction completed for both accounts with scopes
`ELITE` and `UNIQUE`. After the local PostgreSQL process was restored, a
read-only validation loaded and decrypted the stored secrets from the two
database accounts, authenticated both provider namespaces, read devices and
positions, normalized the responses in memory, and recreated each local
session. Both accounts remain disabled; no retry, overwrite, binding, or
latest-state ingest is performed by this validation.

The later controlled activation command
`npm run gps:seven-stars:activate:final` created new Seven Stars vehicles with
the provider name as the exact `vehicleName` and a deterministic
company-scoped `externalId`; it does not infer plates, years, or catalog model
IDs. It created one binding per real device and validated company scope before
enabling. A continuation then ran targeted ELITE and UNIQUE reads only, without
provisioning or a general sync cycle. Both accounts are now enabled after
successful targeted sync. The database contains 20 Seven Stars vehicles, 20
active bindings, six latest states, and the existing seven LIVE_GPS bindings
are unchanged.

The GPS vehicle list accepts an optional `providerKey` query value
(`LIVE_GPS` or `SEVEN_STARS`). Missing `providerKey` means all providers. The
list is limited to active bound vehicles, so a bound vehicle without a valid
latest location remains visible as metadata-only; map points still require
valid latest coordinates. The frontend exposes independent provider and company
filters.

## Seven Stars live tracking

Seven Stars live tracking uses the provider's passive WebSocket endpoint
`/api/socket` with the in-memory `JSESSIONID` created by the existing REST
session manager. The current single-service deployment starts one
`SevenStarsLiveConnectionManager` connection per enabled `providerAccountId`;
duplicate starts are ignored, reconnects use bounded backoff, and shutdown
closes all connections. The manager sends no application messages to the
provider. REST sync remains enabled as reconciliation and fallback.

Incoming `positions` frames reuse the existing Seven Stars mapper and GPS
ingest path. Binding lookup remains `(providerAccountId, externalDeviceId)`;
invalid, stale, duplicate, and unbound data do not overwrite latest state.
Normalized accepted positions are published through the authenticated
`GET /gps/realtime` SSE stream. The frontend consumes only sanitized
vehicle-position fields and keeps the existing 15-second REST polling fallback.
Leaflet marker motion is frontend-only visual interpolation between accepted real
points. Its duration is adaptive (`capturedAt` delta × 0.8, bounded to
500–3800 ms); it never writes interpolated coordinates to the database or
publishes synthetic realtime events. Initial, stale, invalid, long-gap, and
large-jump updates snap according to the frontend map rules.

The current deployment assumption is one backend runtime instance. If the API
is deployed with multiple live-socket instances, a dedicated distributed
ownership/lease strategy must be added before enabling this manager on every
replica. Seven Stars transport remains plaintext HTTP/WebSocket
(`http://`/`ws://`); this is an explicit transport security risk and is not
silently treated as secure.

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
| Cadence | **60s** minimum between real attempts per non–`LIVE_GPS` account (`lastAttemptAt`). **`LIVE_GPS`** uses a dedicated in-process fast timer (`LIVE_GPS_SYNC_CADENCE_MS`, default **5s**) plus the same `syncOneAccount` / lease / in-flight guards. General scheduler tick stays **30s** and excludes `LIVE_GPS` from `runGpsProviderSyncCycle`. Skipped lease/not-due cycles do not advance `lastAttemptAt`. |
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
