import {
  gpsProviderAuthFailedError,
  gpsProviderConnectionFailedError,
  gpsProviderInvalidResponseError,
  gpsProviderTimeoutError,
} from "src/modules/gps/gps.errors";
import {
  extractSevenStarsSessionCookie,
  sevenStarsCookieHeader,
} from "src/modules/gps/providers/seven-stars/seven-stars.cookies";
import {
  SEVEN_STARS_DEFAULT_BASE_URL,
  SEVEN_STARS_PATH_DEVICES,
  SEVEN_STARS_PATH_LOGIN,
  SEVEN_STARS_PATH_POSITIONS,
  SEVEN_STARS_TIMEOUT_MS,
} from "src/modules/gps/providers/seven-stars/seven-stars.constants";
import {
  SevenStarsSessionManager,
  type SevenStarsSessionState,
} from "src/modules/gps/providers/seven-stars/seven-stars.session";

export type SevenStarsCredentials = {
  username: string;
  password: string;
};

export type SevenStarsClientContext = {
  providerAccountId: string;
  credentials: SevenStarsCredentials;
};

export type SevenStarsClientOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sessionManager?: SevenStarsSessionManager;
  timeouts?: Partial<typeof SEVEN_STARS_TIMEOUT_MS>;
};

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw gpsProviderTimeoutError();
    }
    throw gpsProviderConnectionFailedError();
  } finally {
    clearTimeout(timer);
  }
}

function resolveCredentials(credentials: SevenStarsCredentials): SevenStarsCredentials {
  const username = credentials.username.trim();
  const password = credentials.password.trim();
  if (!username || !password) throw gpsProviderAuthFailedError();
  return { username, password };
}

export function createSevenStarsClient(options: SevenStarsClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? SEVEN_STARS_DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const sessions = options.sessionManager ?? new SevenStarsSessionManager();
  const timeouts = { ...SEVEN_STARS_TIMEOUT_MS, ...options.timeouts };

  async function login(
    providerAccountId: string,
    credentials: SevenStarsCredentials,
  ): Promise<SevenStarsSessionState> {
    const resolved = resolveCredentials(credentials);
    const body = new URLSearchParams({
      email: resolved.username,
      password: resolved.password,
      undefined: "false",
    });
    const response = await fetchWithTimeout(
      `${baseUrl}${SEVEN_STARS_PATH_LOGIN}`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
        redirect: "manual",
      },
      timeouts.login,
      fetchImpl,
    );
    const cookie = extractSevenStarsSessionCookie(response.headers);
    await response.text().catch(() => undefined);
    if (!response.ok || !cookie) throw gpsProviderAuthFailedError();
    return sessions.setSession(providerAccountId, cookie);
  }

  async function ensureSession(ctx: SevenStarsClientContext): Promise<SevenStarsSessionState> {
    return sessions.ensureSession(ctx.providerAccountId, () =>
      login(ctx.providerAccountId, ctx.credentials),
    );
  }

  async function readJson(
    ctx: SevenStarsClientContext,
    path: string,
    retried = false,
  ): Promise<unknown> {
    const session = await ensureSession(ctx);
    const response = await fetchWithTimeout(
      `${baseUrl}${path}`,
      {
        method: "GET",
        headers: { Cookie: sevenStarsCookieHeader(session.cookieValue) },
        redirect: "manual",
      },
      timeouts.session,
      fetchImpl,
    );
    if (response.status === 401) {
      sessions.invalidate(ctx.providerAccountId);
      if (!retried) return readJson(ctx, path, true);
      throw gpsProviderAuthFailedError();
    }
    if (!response.ok) throw gpsProviderInvalidResponseError();
    try {
      return (await response.json()) as unknown;
    } catch {
      throw gpsProviderInvalidResponseError();
    }
  }

  async function fetchDevices(ctx: SevenStarsClientContext): Promise<unknown> {
    return readJson(ctx, SEVEN_STARS_PATH_DEVICES);
  }

  async function fetchPositions(ctx: SevenStarsClientContext): Promise<unknown> {
    return readJson(ctx, SEVEN_STARS_PATH_POSITIONS);
  }

  return {
    login,
    ensureSession,
    fetchDevices,
    fetchPositions,
  };
}
