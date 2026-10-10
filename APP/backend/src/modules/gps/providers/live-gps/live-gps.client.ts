import {
  gpsProviderAuthFailedError,
  gpsProviderConnectionFailedError,
  gpsProviderInvalidResponseError,
  gpsProviderNotConfiguredError,
  gpsProviderRemoteError,
  gpsProviderTimeoutError,
} from "src/modules/gps/gps.errors";
import type {
  ProviderFleetFetchResult,
  ProviderHistoryFetchResult,
  ProviderNormalizedHistoryPoint,
  ProviderMileageSummary,
  ProviderOverspeedFetchResult,
} from "src/modules/gps/gps-provider.types";
import { parseLiveGpsLoginResponse } from "src/modules/gps/providers/live-gps/live-gps.auth";
import {
  LIVE_GPS_DEFAULT_BASE_URL,
  LIVE_GPS_PATH_DEVICE_LIST,
  LIVE_GPS_PATH_FLEET,
  LIVE_GPS_PATH_HISTORY,
  LIVE_GPS_PATH_DRIVEN_SHORT_SUMMARY,
  LIVE_GPS_PATH_OVERSPEED,
  LIVE_GPS_PATH_LOGIN,
  LIVE_GPS_TIMEOUT_MS,
} from "src/modules/gps/providers/live-gps/live-gps.constants";
import { cookieHeaderValue } from "src/modules/gps/providers/live-gps/live-gps.cookies";
import { mapLiveGpsHistoryRow } from "src/modules/gps/providers/live-gps/live-gps.history.mapper";
import { mapLiveGpsMileageSummary, mapLiveGpsOverspeedRows } from "src/modules/gps/providers/live-gps/live-gps.reports";
import { mapLiveGpsDeviceMetadata } from "src/modules/gps/providers/live-gps/live-gps.metadata";
import { mapLiveGpsFleetRows } from "src/modules/gps/providers/live-gps/live-gps.mapper";
import { asString, isRecord } from "src/modules/gps/providers/live-gps/live-gps.parse";
import { isLiveGpsAuthenticationLost } from "src/modules/gps/providers/live-gps/live-gps.response";
import {
  LiveGpsSessionManager,
  type LiveGpsSessionState,
} from "src/modules/gps/providers/live-gps/live-gps.session";
import {
  isValidTimezoneOffset,
  resolveLiveGpsTimezoneOffset,
} from "src/modules/gps/providers/live-gps/live-gps.time";

export type LiveGpsCredentials = {
  username: string;
  password: string;
};

export type LiveGpsClientContext = {
  providerAccountId: string;
  secrets: LiveGpsCredentials;
  config?: Record<string, unknown> | null;
};

export type LiveGpsClientOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sessionManager?: LiveGpsSessionManager;
  timeouts?: Partial<typeof LIVE_GPS_TIMEOUT_MS>;
};

function resolveSecrets(secrets: LiveGpsCredentials): LiveGpsCredentials {
  const username = secrets.username?.trim();
  const password = secrets.password?.trim();
  if (!username || !password) throw gpsProviderNotConfiguredError();
  return { username, password };
}

async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw gpsProviderTimeoutError();
    }
    throw gpsProviderConnectionFailedError();
  } finally {
    clearTimeout(timer);
  }
}

export function createLiveGpsClient(options: LiveGpsClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? LIVE_GPS_DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const sessions = options.sessionManager ?? new LiveGpsSessionManager();
  const timeouts = { ...LIVE_GPS_TIMEOUT_MS, ...options.timeouts };

  let lastKnownTimezone: string | null = null;

  async function login(accountId: string, secrets: LiveGpsCredentials): Promise<LiveGpsSessionState> {
    const creds = resolveSecrets(secrets);
    const body = new FormData();
    body.append("username", creds.username);
    body.append("pass", creds.password);

    const response = await fetchWithTimeout(
      `${baseUrl}${LIVE_GPS_PATH_LOGIN}`,
      { method: "POST", body, redirect: "manual" },
      timeouts.login,
      fetchImpl,
    );
    const cookie = parseLiveGpsLoginResponse(response);
    await response.text().catch(() => undefined);
    return sessions.setSession(accountId, cookie);
  }

  async function authenticatedTextFetch(
    ctx: LiveGpsClientContext,
    path: string,
    init: RequestInit,
    timeoutMs: number,
    retried = false,
  ): Promise<string> {
    const session = await sessions.ensureSession(ctx.providerAccountId, () =>
      login(ctx.providerAccountId, ctx.secrets),
    );

    const response = await fetchWithTimeout(
      `${baseUrl}${path}`,
      {
        ...init,
        redirect: "manual",
        headers: {
          ...init.headers,
          Cookie: cookieHeaderValue(session.cookieValue),
        },
      },
      timeoutMs,
      fetchImpl,
    );
    sessions.applyCookieFromResponse(ctx.providerAccountId, response.headers);
    const text = await response.text();

    if (isLiveGpsAuthenticationLost(response, text)) {
      sessions.invalidate(ctx.providerAccountId);
      if (!retried) {
        await sessions.ensureSession(ctx.providerAccountId, () =>
          login(ctx.providerAccountId, ctx.secrets),
        );
        return authenticatedTextFetch(ctx, path, init, timeoutMs, true);
      }
      throw gpsProviderAuthFailedError();
    }

    if (response.status >= 500) throw gpsProviderRemoteError();
    if (!response.ok) throw gpsProviderInvalidResponseError();
    return text;
  }

  async function fetchFleetSnapshotInternal(
    ctx: LiveGpsClientContext,
  ): Promise<{ fleet: ProviderFleetFetchResult; rawRows: unknown[] }> {
    const text = await authenticatedTextFetch(
      ctx,
      LIVE_GPS_PATH_FLEET,
      { method: "GET" },
      timeouts.fleet,
    );
    const rows = JSON.parse(text) as unknown;
    if (!Array.isArray(rows)) throw gpsProviderInvalidResponseError();

    const configOffset = resolveLiveGpsTimezoneOffset(
      ctx.config ?? null,
      lastKnownTimezone,
    );
    const receivedAt = new Date();
    const { snapshots, valid, invalid } = mapLiveGpsFleetRows(rows, {
      providerAccountId: ctx.providerAccountId,
      defaultOffset: configOffset,
      receivedAt,
    });

    for (const row of rows) {
      if (!isRecord(row)) continue;
      const tz = asString(row.UTimeZone);
      if (tz && isValidTimezoneOffset(tz)) {
        lastKnownTimezone = tz;
        break;
      }
    }
    if (!lastKnownTimezone && configOffset) {
      lastKnownTimezone = configOffset;
    }

    const fleet: ProviderFleetFetchResult = {
      providerAccountId: ctx.providerAccountId,
      snapshots,
      validRowCount: valid,
      invalidRowCount: invalid,
      timezoneOffset: lastKnownTimezone,
    };
    return { fleet, rawRows: rows };
  }

  async function fetchFleetSnapshot(ctx: LiveGpsClientContext): Promise<ProviderFleetFetchResult> {
    const { fleet } = await fetchFleetSnapshotInternal(ctx);
    return fleet;
  }

  async function fetchDeviceListRaw(ctx: LiveGpsClientContext): Promise<unknown[]> {
    const text = await authenticatedTextFetch(
      ctx,
      LIVE_GPS_PATH_DEVICE_LIST,
      { method: "GET" },
      timeouts.deviceList,
    );
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) throw gpsProviderInvalidResponseError();
    return parsed;
  }

  async function fetchDeviceMetadata(input: {
    ctx: LiveGpsClientContext;
    deviceId: string;
  }): Promise<{ deviceModel: string | null }> {
    const rows = await fetchDeviceListRaw(input.ctx);
    return mapLiveGpsDeviceMetadata(rows, input.deviceId);
  }

  async function fetchHistory(input: {
    ctx: LiveGpsClientContext;
    deviceId: string;
    startDate: string;
    endDate: string;
    timezoneOffset?: string;
  }): Promise<ProviderHistoryFetchResult> {
    const body = new FormData();
    body.append("deviceid", input.deviceId);
    body.append("stdate", input.startDate);
    body.append("eddate", input.endDate);

    const text = await authenticatedTextFetch(
      input.ctx,
      LIVE_GPS_PATH_HISTORY,
      { method: "POST", body },
      timeouts.history,
    );
    let rows: unknown;
    try {
      rows = JSON.parse(text) as unknown;
    } catch {
      throw gpsProviderInvalidResponseError();
    }

    if (!Array.isArray(rows)) throw gpsProviderInvalidResponseError();

    const tz =
      input.timezoneOffset ??
      resolveLiveGpsTimezoneOffset(input.ctx.config ?? null, lastKnownTimezone);
    if (!tz || !isValidTimezoneOffset(tz)) {
      throw gpsProviderInvalidResponseError();
    }
    const out: ProviderNormalizedHistoryPoint[] = [];
    let invalidRowCount = 0;
    for (const row of rows) {
      const mapped = mapLiveGpsHistoryRow(row, {
        timezoneOffset: tz,
        externalDeviceId: input.deviceId,
      });
      if (mapped) out.push(mapped);
      else invalidRowCount += 1;
    }
    return {
      points: out,
      providerRowCount: rows.length,
      invalidRowCount,
    };
  }

  async function fetchMileageSummary(input: {
    ctx: LiveGpsClientContext;
    deviceId: string;
  }): Promise<ProviderMileageSummary> {
    const body = new FormData();
    body.append("device", input.deviceId);
    const text = await authenticatedTextFetch(
      input.ctx,
      LIVE_GPS_PATH_DRIVEN_SHORT_SUMMARY,
      { method: "POST", body },
      timeouts.report,
    );
    let rows: unknown;
    try {
      rows = JSON.parse(text) as unknown;
    } catch {
      throw gpsProviderInvalidResponseError();
    }
    if (!Array.isArray(rows)) throw gpsProviderInvalidResponseError();
    return mapLiveGpsMileageSummary(rows);
  }

  async function fetchOverspeed(input: {
    ctx: LiveGpsClientContext;
    deviceId: string;
    date: string;
    thresholdKph: number;
    timezoneOffset: string;
  }): Promise<ProviderOverspeedFetchResult> {
    const body = new FormData();
    body.append("speed", String(input.thresholdKph));
    body.append("device", input.deviceId);
    body.append("date", input.date);
    body.append("time", "1");
    const text = await authenticatedTextFetch(
      input.ctx,
      LIVE_GPS_PATH_OVERSPEED,
      { method: "POST", body },
      timeouts.report,
    );
    let rows: unknown;
    try {
      rows = JSON.parse(text) as unknown;
    } catch {
      throw gpsProviderInvalidResponseError();
    }
    if (!Array.isArray(rows)) throw gpsProviderInvalidResponseError();
    const mapped = mapLiveGpsOverspeedRows(rows, input.date, input.timezoneOffset);
    return {
      events: mapped.events,
      providerRowCount: rows.length,
      invalidRowCount: mapped.invalidRowCount,
    };
  }

  return {
    sessions,
    login,
    fetchFleetSnapshot,
    /** Internal PoC/diagnostics — raw rows must never be logged or persisted. */
    fetchFleetSnapshotInternal,
    fetchDeviceListRaw,
    fetchDeviceMetadata,
    fetchHistory,
    fetchMileageSummary,
    fetchOverspeed,
    getLastKnownTimezone: () => lastKnownTimezone,
  };
}
