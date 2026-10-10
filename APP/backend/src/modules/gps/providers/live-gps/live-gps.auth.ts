import { gpsProviderAuthFailedError } from "src/modules/gps/gps.errors";
import {
  extractUserlogFromResponseHeaders,
  type ParsedUserlogCookie,
} from "src/modules/gps/providers/live-gps/live-gps.cookies";

/**
 * Login success = HTTP ok + Userlog cookie. Body `error:1` is NOT failure.
 */
export function parseLiveGpsLoginResponse(response: Response): ParsedUserlogCookie {
  if (!response.ok) {
    throw gpsProviderAuthFailedError();
  }
  const cookie = extractUserlogFromResponseHeaders(response.headers);
  if (!cookie) {
    throw gpsProviderAuthFailedError();
  }
  return cookie;
}
