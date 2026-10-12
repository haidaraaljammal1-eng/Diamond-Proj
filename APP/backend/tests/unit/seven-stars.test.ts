import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { GpsErrorReason } from "src/modules/gps/gps.errors";
import { getSharedGpsProviderRuntime, resetSharedLiveGpsSessionManagerForTests } from "src/modules/gps/gps-live-gps-sessions";
import { createSevenStarsClient } from "src/modules/gps/providers/seven-stars/seven-stars.client";
import {
  SEVEN_STARS_PATH_DEVICES,
  SEVEN_STARS_PATH_LOGIN,
  SEVEN_STARS_PROVIDER_KEY,
} from "src/modules/gps/providers/seven-stars/seven-stars.constants";
import { parseSevenStarsSessionCookie } from "src/modules/gps/providers/seven-stars/seven-stars.cookies";
import { SevenStarsSessionManager } from "src/modules/gps/providers/seven-stars/seven-stars.session";
import { mapSevenStarsFleet } from "src/modules/gps/providers/seven-stars/seven-stars.mapper";
import { SevenStarsAdapter } from "src/modules/gps/providers/seven-stars/seven-stars.adapter";
import { AppError } from "src/lib/errors/app-error";

afterEach(() => {
  resetSharedLiveGpsSessionManagerForTests();
});

function loginResponse(cookie: string): Response {
  return new Response(JSON.stringify({ id: 1 }), {
    status: 200,
    headers: { "set-cookie": `JSESSIONID=${cookie}; Path=/` },
  });
}

describe("Seven Stars cookies and sessions", () => {
  it("extracts only the JSESSIONID value", () => {
    const parsed = parseSevenStarsSessionCookie("JSESSIONID=session-a; Path=/");
    assert.deepEqual(parsed?.value, "session-a");
  });

  it("isolates sessions and login flights by providerAccountId", async () => {
    const manager = new SevenStarsSessionManager();
    let eliteLogins = 0;
    let uniqueLogins = 0;
    const login = (accountId: string) => async () => {
      if (accountId === "elite-account") eliteLogins += 1;
      else uniqueLogins += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return manager.setSession(accountId, {
        value: accountId,
        expiresAt: null,
      });
    };

    const [eliteA, eliteB, unique] = await Promise.all([
      manager.ensureSession("elite-account", login("elite-account")),
      manager.ensureSession("elite-account", login("elite-account")),
      manager.ensureSession("unique-account", login("unique-account")),
    ]);

    assert.equal(eliteLogins, 1);
    assert.equal(uniqueLogins, 1);
    assert.equal(eliteA.cookieValue, "elite-account");
    assert.equal(eliteB.cookieValue, "elite-account");
    assert.equal(unique.cookieValue, "unique-account");
    assert.notEqual(eliteA.cookieValue, unique.cookieValue);
  });
});

describe("Seven Stars authentication", () => {
  it("posts the confirmed form and reuses the session", async () => {
    const calls: { url: string; method: string; body: string }[] = [];
    const client = createSevenStarsClient({
      baseUrl: "http://seven-stars.test",
      fetchImpl: (async (url, init) => {
        calls.push({
          url: String(url),
          method: String(init?.method),
          body: String(init?.body),
        });
        return loginResponse("session-a");
      }) as typeof fetch,
    });

    await client.ensureSession({
      providerAccountId: "elite-account",
      credentials: { username: "elite-user", password: "elite-pass" },
    });
    const second = await client.ensureSession({
      providerAccountId: "elite-account",
      credentials: { username: "different", password: "ignored" },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, `http://seven-stars.test${SEVEN_STARS_PATH_LOGIN}`);
    assert.equal(calls[0]?.method, "POST");
    assert.match(calls[0]?.body ?? "", /email=elite-user/);
    assert.match(calls[0]?.body ?? "", /password=elite-pass/);
    assert.match(calls[0]?.body ?? "", /undefined=false/);
    assert.equal(second.cookieValue, "session-a");
  });

  it("invalidates only the affected account and retries once after 401", async () => {
    const calls: string[] = [];
    let eliteLoginCount = 0;
    const client = createSevenStarsClient({
      baseUrl: "http://seven-stars.test",
      fetchImpl: (async (url, init) => {
        const path = new URL(String(url)).pathname;
        const method = String(init?.method);
        calls.push(`${path}:${method}`);
        if (path === SEVEN_STARS_PATH_LOGIN && method === "POST") {
          eliteLoginCount += 1;
          return loginResponse(`session-${eliteLoginCount}`);
        }
        if (calls.filter((call) => call === `${SEVEN_STARS_PATH_DEVICES}:GET`).length === 1) {
          return new Response("", { status: 401 });
        }
        return new Response(JSON.stringify({ id: 1 }), { status: 200 });
      }) as typeof fetch,
    });

    const result = await client.fetchDevices({
      providerAccountId: "elite-account",
      credentials: { username: "elite-user", password: "elite-pass" },
    });

    assert.deepEqual(result, { id: 1 });
    assert.equal(eliteLoginCount, 2);
    assert.equal(
      calls.filter((call) => call === `${SEVEN_STARS_PATH_DEVICES}:GET`).length,
      2,
    );
  });

  it("fails after one retry when authentication remains lost", async () => {
    let sessionReads = 0;
    const client = createSevenStarsClient({
      baseUrl: "http://seven-stars.test",
      fetchImpl: (async (url, init) => {
        if (new URL(String(url)).pathname === SEVEN_STARS_PATH_LOGIN && String(init?.method) === "POST") {
          return loginResponse(`session-${sessionReads}`);
        }
        sessionReads += 1;
        return new Response("", { status: 401 });
      }) as typeof fetch,
    });

    await assert.rejects(
      client.fetchPositions({
        providerAccountId: "elite-account",
        credentials: { username: "elite-user", password: "elite-pass" },
      }),
      (error: unknown) =>
        error instanceof AppError &&
        error.context?.reason === GpsErrorReason.PROVIDER_AUTH_FAILED,
    );
    assert.equal(sessionReads, 2);
  });
});

describe("Seven Stars runtime registration", () => {
  it("resolves distinct LIVE_GPS and SEVEN_STARS managers", () => {
    const runtime = getSharedGpsProviderRuntime();
    assert.ok(runtime.getSessionManager(SEVEN_STARS_PROVIDER_KEY) instanceof SevenStarsSessionManager);
    assert.notStrictEqual(
      runtime.getSessionManager(SEVEN_STARS_PROVIDER_KEY),
      runtime.getSessionManager("LIVE_GPS"),
    );
  });
});

describe("Seven Stars fleet mapping", () => {
  it("maps device ids, metadata, latest valid positions, knots, and timestamps", () => {
    const result = mapSevenStarsFleet(
      [
        { id: 7, name: "Plate must not be the key", uniqueId: "imei-7", model: "FMC", status: "online" },
      ],
      [
        {
          id: 1,
          deviceId: 7,
          valid: true,
          latitude: 25.2,
          longitude: 55.3,
          speed: 10,
          course: 90,
          fixTime: "2026-10-10T10:00:00.000Z",
          deviceTime: "2026-10-10T09:59:00.000Z",
          serverTime: "2026-10-10T10:01:00.000Z",
          engine: false,
          attributes: { ignition: true, motion: true, raw: "must-not-persist" },
        },
      ],
      { providerAccountId: "elite-account", receivedAt: new Date("2026-10-10T10:02:00.000Z") },
    );

    const snapshot = result.snapshots[0]!;
    assert.equal(snapshot.externalDeviceId, "7");
    assert.equal(snapshot.deviceMetadata.externalDeviceUid, "imei-7");
    assert.equal(snapshot.deviceMetadata.providerDeviceExtras?.status, "online");
    assert.equal(snapshot.telemetry?.providerDeviceState, null);
    assert.equal(snapshot.telemetry?.speedKph, 18.52);
    assert.equal(snapshot.telemetry?.headingDegrees, 90);
    assert.equal(snapshot.telemetry?.ignitionOn, true);
    assert.equal(snapshot.telemetry?.capturedAt.toISOString(), "2026-10-10T10:00:00.000Z");
    assert.equal(snapshot.telemetry?.receivedAt?.toISOString(), "2026-10-10T10:01:00.000Z");
    assert.equal(snapshot.telemetry?.providerExtras?.raw, undefined);
  });

  it("keeps invalid and missing positions as metadata-only snapshots", () => {
    const result = mapSevenStarsFleet(
      [{ id: 1, status: "offline" }, { id: 2, status: "unknown" }],
      [
        {
          id: 1,
          deviceId: 1,
          valid: false,
          latitude: 25,
          longitude: 55,
          fixTime: "2026-10-10T10:00:00.000Z",
        },
      ],
      { providerAccountId: "elite-account", receivedAt: new Date() },
    );
    assert.equal(result.snapshots.length, 2);
    assert.equal(result.snapshots[0]?.deviceMetadata.providerDeviceExtras?.status, "offline");
    assert.equal(result.snapshots[1]?.deviceMetadata.providerDeviceExtras?.status, "unknown");
    assert.equal(result.snapshots[0]?.telemetry, null);
    assert.equal(result.snapshots[1]?.telemetry, null);
  });

  it("preserves offline connectivity separately from a historical valid position", () => {
    const result = mapSevenStarsFleet(
      [{ id: 3, status: "offline" }],
      [{
        id: 3,
        deviceId: 3,
        valid: true,
        latitude: 25,
        longitude: 55,
        fixTime: "2026-10-09T10:00:00.000Z",
      }],
      { providerAccountId: "elite-account", receivedAt: new Date("2026-10-10T10:00:00.000Z") },
    );
    const snapshot = result.snapshots[0]!;
    assert.equal(snapshot.deviceMetadata.providerDeviceExtras?.status, "offline");
    assert.equal(snapshot.telemetry?.providerDeviceState, null);
    assert.equal(snapshot.telemetry?.latitude, 25);
  });

  it("handles missing status without inventing connectivity", () => {
    const result = mapSevenStarsFleet(
      [{ id: 4, status: null }],
      [],
      { providerAccountId: "elite-account", receivedAt: new Date() },
    );
    assert.equal(result.snapshots[0]?.deviceMetadata.providerDeviceExtras, null);
    assert.equal(result.snapshots[0]?.telemetry, null);
  });

  it("selects the latest position by fixTime then serverTime", () => {
    const result = mapSevenStarsFleet(
      [{ id: 1 }],
      [
        { id: 1, deviceId: 1, valid: true, latitude: 1, longitude: 1, fixTime: "2026-10-10T09:00:00Z", serverTime: "2026-10-10T12:00:00Z" },
        { id: 2, deviceId: 1, valid: true, latitude: 2, longitude: 2, fixTime: "2026-10-10T10:00:00Z", serverTime: "2026-10-10T10:01:00Z" },
      ],
      { providerAccountId: "elite-account", receivedAt: new Date() },
    );
    assert.equal(result.snapshots[0]?.telemetry?.latitude, 2);
  });

  it("resolves Seven Stars through the read-only adapter", async () => {
    let getCount = 0;
    const adapter = new SevenStarsAdapter({
      baseUrl: "http://seven-stars.test",
      fetchImpl: (async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (path === "/api/session") return loginResponse("adapter-session");
        assert.equal(String(init?.method), "GET");
        getCount += 1;
        if (path === "/api/devices") return new Response(JSON.stringify([{ id: 1 }]), { status: 200 });
        return new Response(JSON.stringify([{ deviceId: 1, valid: false }]), { status: 200 });
      }) as typeof fetch,
    });
    const runtime = getSharedGpsProviderRuntime();
    const result = await adapter.fetchFleetSnapshot!(
      {
        providerAccountId: "adapter-account",
        providerKey: "SEVEN_STARS",
        accountKey: "elite",
        config: null,
        credentials: { username: "u", password: "p" },
      },
      {
        getSessionManager: <T>(key: string) =>
          runtime.getSessionManager<T>(key),
      },
    );
    assert.equal(result.snapshots.length, 1);
    assert.equal(getCount, 2);
  });
});
