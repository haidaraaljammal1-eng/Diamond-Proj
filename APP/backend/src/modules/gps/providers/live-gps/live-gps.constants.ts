export const LIVE_GPS_PROVIDER_KEY = "LIVE_GPS";

/** Fixed production default — override only in tests. */
export const LIVE_GPS_DEFAULT_BASE_URL = "https://track.livemygps.com";

export const LIVE_GPS_PATH_LOGIN = "/auth/MainUser";
export const LIVE_GPS_PATH_FLEET = "/User/dash_getAllMainDeviceList";
export const LIVE_GPS_PATH_DEVICE_LIST = "/User/getvehiclelistbyid";
export const LIVE_GPS_PATH_HISTORY = "/User/getHistory";
export const LIVE_GPS_PATH_DRIVEN_SHORT_SUMMARY = "/User/report_getDrivenshortsummary?rpttype=0";
export const LIVE_GPS_PATH_OVERSPEED = "/User/report_getOverSpeed?rpttype=0";
export const LIVE_GPS_UAE_TIMEZONE_OFFSET = "+04:00";

export const LIVE_GPS_COOKIE_NAME = "Userlog";

export const LIVE_GPS_TIMEOUT_MS = {
  login: 15_000,
  fleet: 30_000,
  deviceList: 30_000,
  history: 120_000,
  report: 120_000,
} as const;
