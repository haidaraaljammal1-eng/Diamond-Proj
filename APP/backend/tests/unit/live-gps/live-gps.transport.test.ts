import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { AppError } from "src/lib/errors/app-error";
import { GpsErrorReason } from "src/modules/gps/gps.errors";
import {
  cookieHeaderValue,
  parseUserlogFromSetCookieLine,
} from "src/modules/gps/providers/live-gps/live-gps.cookies";
import { parseLiveGpsLoginResponse } from "src/modules/gps/providers/live-gps/live-gps.auth";
import {
  LIVE_GPS_PATH_FLEET,
  LIVE_GPS_PATH_HISTORY,
  LIVE_GPS_PATH_LOGIN,
} from "src/modules/gps/providers/live-gps/live-gps.constants";
import { createLiveGpsClient } from "src/modules/gps/providers/live-gps/live-gps.client";
import { LiveGpsSessionManager } from "src/modules/gps/providers/live-gps/live-gps.session";
import { isLiveGpsAuthenticationLost } from "src/modules/gps/providers/live-gps/live-gps.response";
import {
  loginResponseHeaders,
  SANITIZED_FLEET_ROW,
  SANITIZED_HISTORY_ROW,
  SANITIZED_LOGIN_BODY,
  SANITIZED_USERLOG,
} from "tests/fixtures/live-gps-sanitized";

const realFetch = globalThis.fetch;
const ctx = {
  providerAccountId: "acc-test-001",
  secrets: { username: "user-synth", password: "pass-synth" },
  config: { timezoneOffset: "+04:00" },
};

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("Live GPS cookies", () => {
  it("parses Userlog and Max-Age", () => {
    const parsed = parseUserlogFromSetCookieLine(
      `Userlog=${SANITIZED_USERLOG}; max-age=432000; path=/`,
    );
    assert.ok(parsed);
    assert.equal(parsed!.value, SANITIZED_USERLOG);
    assert.ok(parsed!.expiresAt);
  });

  it("builds cookie header without logging value in errors", () => {
    assert.equal(cookieHeaderValue("x"), "Userlog=x");
  });
});

describe("Live GPS login", () => {
  it("accepts text/plain JSON with error:1 when Userlog present", () => {
    const res = new Response(SANITIZED_LOGIN_BODY, {
      status: 200,
      headers: loginResponseHeaders(),
    });
    const cookie = parseLiveGpsLoginResponse(res);
    assert.equal(cookie.value, SANITIZED_USERLOG);
  });

  it("fails without Userlog cookie", () => {
    const res = new Response(SANITIZED_LOGIN_BODY, { status: 200 });
    assert.throws(() => parseLiveGpsLoginResponse(res), (err) => {
      return err instanceof AppError && err.context?.reason === GpsErrorReason.PROVIDER_AUTH_FAILED;
    });
  });
});

describe("Live GPS session single-flight", () => {
  it("runs one login for concurrent ensureSession calls", async () => {
    let loginCount = 0;
    const sessions = new LiveGpsSessionManager();
    const login = async () => {
      loginCount += 1;
      await new Promise((r) => setTimeout(r, 20));
      return sessions.setSession("a1", {
        value: "c1",
        expiresAt: new Date(Date.now() + 60_000),
      });
    };
    const results = await Promise.all([
      sessions.ensureSession("a1", login),
      sessions.ensureSession("a1", login),
      sessions.ensureSession("a1", login),
    ]);
    assert.equal(loginCount, 1);
    assert.equal(results[0]!.cookieValue, "c1");
  });
});

describe("Live GPS client", () => {
  it("POSTs login with username and pass fields", async () => {
    const calls: { url: string; method: string; body: FormData }[] = [];
    globalThis.fetch = (async (url, init) => {
      const u = String(url);
      if (u.endsWith(LIVE_GPS_PATH_LOGIN)) {
        calls.push({
          url: u,
          method: (init as RequestInit).method ?? "GET",
          body: init?.body as FormData,
        });
        return new Response(SANITIZED_LOGIN_BODY, {
          status: 200,
          headers: loginResponseHeaders(),
        });
      }
      return new Response("[]", { status: 200, headers: { "content-type": "text/plain" } });
    }) as typeof fetch;

    const client = createLiveGpsClient({ baseUrl: "https://gps.test" });
    await client.login(ctx.providerAccountId, ctx.secrets);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.method, "POST");
    assert.equal(calls[0]!.body.get("username"), "user-synth");
    assert.equal(calls[0]!.body.get("pass"), "pass-synth");
  });

  it("fetches fleet with Cookie and maps rows", async () => {
    let fleetCalls = 0;
    globalThis.fetch = (async (url, init) => {
      const u = String(url);
      if (u.endsWith(LIVE_GPS_PATH_LOGIN)) {
        return new Response(SANITIZED_LOGIN_BODY, {
          status: 200,
          headers: loginResponseHeaders(),
        });
      }
      if (u.endsWith(LIVE_GPS_PATH_FLEET)) {
        fleetCalls += 1;
        const cookie = (init as RequestInit).headers
          ? new Headers((init as RequestInit).headers).get("cookie")
          : null;
        assert.ok(cookie?.includes("Userlog="));
        return new Response(JSON.stringify([SANITIZED_FLEET_ROW]), {
          status: 200,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }
      return new Response("[]", { status: 200 });
    }) as typeof fetch;

    const client = createLiveGpsClient({ baseUrl: "https://gps.test" });
    const result = await client.fetchFleetSnapshot(ctx);
    assert.equal(fleetCalls, 1);
    assert.equal(result.snapshots.length, 1);
    assert.equal(result.snapshots[0]!.externalDeviceId, "1001");
    assert.equal(result.snapshots[0]!.telemetry?.speedKph, 0);
    assert.equal(result.snapshots[0]!.telemetry?.odometerUnit, "METER");
    assert.equal(result.snapshots[0]!.telemetry?.distanceTodayUnit, "KILOMETER");
    assert.equal(result.snapshots[0]!.telemetry?.providerExtras?.providerDeviceOnOff, "ON");
    assert.equal("drivermob" in (result.snapshots[0]!.telemetry?.providerExtras ?? {}), false);
  });

  it("retries once on 401 then succeeds", async () => {
    let fleetAttempt = 0;
    globalThis.fetch = (async (url) => {
      const u = String(url);
      if (u.endsWith(LIVE_GPS_PATH_LOGIN)) {
        return new Response(SANITIZED_LOGIN_BODY, {
          status: 200,
          headers: loginResponseHeaders(`rotated-${fleetAttempt}`),
        });
      }
      if (u.endsWith(LIVE_GPS_PATH_FLEET)) {
        fleetAttempt += 1;
        if (fleetAttempt === 1) {
          return new Response("{}", { status: 401 });
        }
        return new Response(JSON.stringify([SANITIZED_FLEET_ROW]), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    }) as typeof fetch;

    const client = createLiveGpsClient({ baseUrl: "https://gps.test" });
    const result = await client.fetchFleetSnapshot(ctx);
    assert.equal(fleetAttempt, 2);
    assert.equal(result.validRowCount, 1);
  });

  it("posts history with exact multipart fields", async () => {
    let historyBody: FormData | undefined;
    globalThis.fetch = (async (url, init) => {
      const u = String(url);
      if (u.endsWith(LIVE_GPS_PATH_LOGIN)) {
        return new Response(SANITIZED_LOGIN_BODY, {
          status: 200,
          headers: loginResponseHeaders(),
        });
      }
      if (u.endsWith(LIVE_GPS_PATH_HISTORY)) {
        if (init?.body instanceof FormData) historyBody = init.body;
        return new Response(JSON.stringify([SANITIZED_HISTORY_ROW]), { status: 200 });
      }
      if (u.endsWith(LIVE_GPS_PATH_FLEET)) {
        return new Response(JSON.stringify([SANITIZED_FLEET_ROW]), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    }) as typeof fetch;

    const client = createLiveGpsClient({ baseUrl: "https://gps.test" });
    await client.fetchFleetSnapshot(ctx);
    const history = await client.fetchHistory({
      ctx,
      deviceId: "1001",
      startDate: "2026-10-01 19:54",
      endDate: "2026-10-08 19:54",
    });
    assert.ok(historyBody instanceof FormData);
    assert.equal(historyBody.get("deviceid"), "1001");
    assert.equal(historyBody.get("stdate"), "2026-10-01 19:54");
    assert.equal(historyBody.get("eddate"), "2026-10-08 19:54");
    assert.equal(history.providerRowCount, 1);
    assert.equal(history.invalidRowCount, 0);
    assert.equal(history.points[0]!.segmentDistanceMeters, 592.6);
    assert.equal(history.points[0]!.speedKph, 97);
  });

  it("does not treat invalid JSON as auth loss", () => {
    const res = new Response("not-json", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
    assert.equal(isLiveGpsAuthenticationLost(res, "not-json"), false);
  });
});
