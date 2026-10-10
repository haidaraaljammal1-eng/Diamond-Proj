import {
  extractUserlogFromResponseHeaders,
  type ParsedUserlogCookie,
} from "src/modules/gps/providers/live-gps/live-gps.cookies";

export type LiveGpsSessionState = {
  cookieValue: string;
  expiresAt: Date | null;
};

export class LiveGpsSessionManager {
  private readonly sessions = new Map<string, LiveGpsSessionState>();
  private readonly loginFlights = new Map<string, Promise<LiveGpsSessionState>>();

  getSession(accountId: string): LiveGpsSessionState | null {
    const state = this.sessions.get(accountId);
    if (!state) return null;
    if (state.expiresAt && state.expiresAt.getTime() <= Date.now()) {
      this.sessions.delete(accountId);
      return null;
    }
    return state;
  }

  setSession(accountId: string, cookie: ParsedUserlogCookie): LiveGpsSessionState {
    const state: LiveGpsSessionState = {
      cookieValue: cookie.value,
      expiresAt: cookie.expiresAt,
    };
    this.sessions.set(accountId, state);
    return state;
  }

  applyCookieFromResponse(accountId: string, headers: Headers): void {
    const parsed = extractUserlogFromResponseHeaders(headers);
    if (parsed) this.setSession(accountId, parsed);
  }

  invalidate(accountId: string): void {
    this.sessions.delete(accountId);
  }

  async ensureSession(
    accountId: string,
    login: () => Promise<LiveGpsSessionState>,
  ): Promise<LiveGpsSessionState> {
    const existing = this.getSession(accountId);
    if (existing) return existing;

    const inFlight = this.loginFlights.get(accountId);
    if (inFlight) return inFlight;

    const flight = login()
      .then((state) => {
        this.sessions.set(accountId, state);
        return state;
      })
      .finally(() => {
        this.loginFlights.delete(accountId);
      });

    this.loginFlights.set(accountId, flight);
    return flight;
  }
}
