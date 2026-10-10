import { LIVE_GPS_COOKIE_NAME } from "src/modules/gps/providers/live-gps/live-gps.constants";

export type ParsedUserlogCookie = {
  value: string;
  expiresAt: Date | null;
};

function parseMaxAgeSeconds(setCookieLine: string): number | null {
  const match = /(?:^|;\s*)max-age=(\d+)/i.exec(setCookieLine);
  if (!match) return null;
  const seconds = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(seconds) ? seconds : null;
}

function parseExpires(setCookieLine: string): Date | null {
  const match = /(?:^|;\s*)expires=([^;]+)/i.exec(setCookieLine);
  if (!match) return null;
  const d = new Date(match[1]!.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseUserlogFromSetCookieLine(line: string): ParsedUserlogCookie | null {
  const trimmed = line.trim();
  if (!trimmed.toLowerCase().startsWith(`${LIVE_GPS_COOKIE_NAME.toLowerCase()}=`)) {
    return null;
  }
  const semi = trimmed.indexOf(";");
  const pair = semi === -1 ? trimmed : trimmed.slice(0, semi);
  const eq = pair.indexOf("=");
  if (eq === -1) return null;
  const value = pair.slice(eq + 1).trim();
  if (!value) return null;
  const maxAge = parseMaxAgeSeconds(trimmed);
  const expires =
    maxAge != null
      ? new Date(Date.now() + maxAge * 1000)
      : parseExpires(trimmed);
  return { value, expiresAt: expires };
}

export function extractUserlogFromResponseHeaders(headers: Headers): ParsedUserlogCookie | null {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const lines: string[] =
    typeof getSetCookie === "function"
      ? getSetCookie.call(headers)
      : headers.get("set-cookie")
        ? [headers.get("set-cookie")!]
        : [];
  for (const line of lines) {
    const parsed = parseUserlogFromSetCookieLine(line);
    if (parsed) return parsed;
  }
  return null;
}

export function cookieHeaderValue(cookieValue: string): string {
  return `${LIVE_GPS_COOKIE_NAME}=${cookieValue}`;
}
