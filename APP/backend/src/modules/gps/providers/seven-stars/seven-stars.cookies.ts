import { SEVEN_STARS_COOKIE_NAME } from "src/modules/gps/providers/seven-stars/seven-stars.constants";

export type ParsedSevenStarsCookie = {
  value: string;
  expiresAt: Date | null;
};

function parseExpires(line: string): Date | null {
  const match = /(?:^|;\s*)expires=([^;]+)/i.exec(line);
  if (!match) return null;
  const expiresAt = new Date(match[1]!.trim());
  return Number.isNaN(expiresAt.getTime()) ? null : expiresAt;
}

export function parseSevenStarsSessionCookie(line: string): ParsedSevenStarsCookie | null {
  const trimmed = line.trim();
  if (!trimmed.toLowerCase().startsWith(`${SEVEN_STARS_COOKIE_NAME.toLowerCase()}=`)) {
    return null;
  }
  const pair = trimmed.split(";", 1)[0]!;
  const separator = pair.indexOf("=");
  const value = separator === -1 ? "" : pair.slice(separator + 1).trim();
  if (!value) return null;
  return { value, expiresAt: parseExpires(trimmed) };
}

export function extractSevenStarsSessionCookie(
  headers: Headers,
): ParsedSevenStarsCookie | null {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const lines =
    typeof getSetCookie === "function"
      ? getSetCookie.call(headers)
      : headers.get("set-cookie")
        ? [headers.get("set-cookie")!]
        : [];
  for (const line of lines) {
    const parsed = parseSevenStarsSessionCookie(line);
    if (parsed) return parsed;
  }
  return null;
}

export function sevenStarsCookieHeader(cookieValue: string): string {
  return `${SEVEN_STARS_COOKIE_NAME}=${cookieValue}`;
}
