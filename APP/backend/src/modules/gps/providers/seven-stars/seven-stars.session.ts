import type { ParsedSevenStarsCookie } from "src/modules/gps/providers/seven-stars/seven-stars.cookies";

export type SevenStarsSessionState = {
  providerAccountId: string;
  cookieValue: string;
  createdAt: Date;
  expiresAt: Date | null;
};

export class SevenStarsSessionManager {
  private readonly sessions = new Map<string, SevenStarsSessionState>();
  private readonly loginFlights = new Map<string, Promise<SevenStarsSessionState>>();

  getSession(providerAccountId: string): SevenStarsSessionState | null {
    const session = this.sessions.get(providerAccountId);
    if (!session) return null;
    if (session.expiresAt && session.expiresAt.getTime() <= Date.now()) {
      this.sessions.delete(providerAccountId);
      return null;
    }
    return session;
  }

  setSession(
    providerAccountId: string,
    cookie: ParsedSevenStarsCookie,
  ): SevenStarsSessionState {
    const session: SevenStarsSessionState = {
      providerAccountId,
      cookieValue: cookie.value,
      createdAt: new Date(),
      expiresAt: cookie.expiresAt,
    };
    this.sessions.set(providerAccountId, session);
    return session;
  }

  invalidate(providerAccountId: string): void {
    this.sessions.delete(providerAccountId);
  }

  async ensureSession(
    providerAccountId: string,
    login: () => Promise<SevenStarsSessionState>,
  ): Promise<SevenStarsSessionState> {
    const existing = this.getSession(providerAccountId);
    if (existing) return existing;

    const inFlight = this.loginFlights.get(providerAccountId);
    if (inFlight) return inFlight;

    const flight = login()
      .then((session) => {
        this.sessions.set(providerAccountId, session);
        return session;
      })
      .finally(() => {
        this.loginFlights.delete(providerAccountId);
      });
    this.loginFlights.set(providerAccountId, flight);
    return flight;
  }
}
