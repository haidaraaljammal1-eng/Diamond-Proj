import { gpsProviderSessionExpiredError } from "src/modules/gps/gps.errors";

const LOGIN_MARKERS = [
  "/auth/mainuser",
  "name=\"pass\"",
  "id=\"pass\"",
  "login",
];

export function isLiveGpsAuthenticationLost(response: Response, bodyText?: string): boolean {
  if (response.status === 401 || response.status === 403) return true;
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location")?.toLowerCase() ?? "";
    if (location.includes("/auth") || location.includes("login")) return true;
  }
  if (bodyText && response.headers.get("content-type")?.includes("text/html")) {
    const lower = bodyText.toLowerCase().slice(0, 8000);
    if (LOGIN_MARKERS.some((m) => lower.includes(m))) return true;
  }
  return false;
}

export function assertNotAuthenticationLost(response: Response, bodyText?: string): void {
  if (isLiveGpsAuthenticationLost(response, bodyText)) {
    throw gpsProviderSessionExpiredError();
  }
}
