export const SEVEN_STARS_PROVIDER_KEY = "SEVEN_STARS";
export const SEVEN_STARS_DEFAULT_BASE_URL = "http://sevenstars-uae.net:8082";
export const SEVEN_STARS_PATH_LOGIN = "/api/session";
export const SEVEN_STARS_PATH_DEVICES = "/api/devices";
export const SEVEN_STARS_PATH_POSITIONS = "/api/positions";
export const SEVEN_STARS_COOKIE_NAME = "JSESSIONID";

export const SEVEN_STARS_TIMEOUT_MS = {
  login: 15_000,
  session: 15_000,
} as const;
