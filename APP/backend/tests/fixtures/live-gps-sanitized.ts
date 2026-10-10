/** Sanitized synthetic Live GPS payloads — no real credentials, PII, or coordinates from production. */

export const SANITIZED_LOGIN_BODY = JSON.stringify([
  { error: 1, msg: "/User/Index", latlon: "24$54" },
]);

export const SANITIZED_USERLOG = "opaque-session-token-synthetic";

export function loginResponseHeaders(cookie = SANITIZED_USERLOG): Headers {
  const h = new Headers();
  h.append("set-cookie", `Userlog=${cookie}; max-age=432000; path=/`);
  h.set("content-type", "text/plain; charset=utf-8");
  return h;
}

export const SANITIZED_FLEET_ROW = {
  deviceid: "1001",
  deviceimei: "IMEI-SYNTH-001",
  SimNo: "SIM-SYNTH",
  devicetype: "Tracker",
  devicetypeid: "7",
  InstallationDate: "2025-04-19T15:26:49.563",
  experied: "2027-04-19T15:26:49.567",
  installtype: "Standard",
  vehicleno: "PROVIDER-PLATE-NOT-DIAMOND",
  vehicletype: "SUV",
  lastdata: "2026-10-08T20:20:46",
  deviceLastData: "08-Oct-2026 08:20:46 PM",
  UTimeZone: "+04:00",
  lastlatitude: 25.1,
  lastlongitude: 55.2,
  preLatitude: 25.09,
  preLongitude: 55.19,
  speed: 0,
  actspeed: 0,
  motion: true,
  actmotion: false,
  ign: false,
  actign: 0,
  sat: 12,
  meter: 123456.78,
  driventoday: 99.5,
  parkingenable: true,
  status: "Stop",
  DeviceOnOFF: "ON",
  address: "Synthetic Address Line",
  overallsec: 120,
  lastmin: 2,
  LastSec: 100,
  shr: "1 h 40 m",
  LastDays: 0,
  Cutdate: "2026-10-08T20:42:46.967",
  ang: 90,
  fuel: null,
  charge: false,
  batterylevel: 0,
  immobilize: true,
  driverid: "discard",
  drivername: "discard",
  drivermob: "discard",
  companyname: "External Co",
};

/** Running vehicle — synthetic; mirrors observed ign/actign/status/speed shape. */
export const SANITIZED_FLEET_ROW_RUNNING = {
  ...SANITIZED_FLEET_ROW,
  speed: 25.35,
  actspeed: 25.35,
  motion: true,
  actmotion: 1,
  ign: true,
  actign: 1,
  status: "Running",
};

export const SANITIZED_HISTORY_ROW = {
  deviceid: "1001",
  device_dt: "2026-10-01T20:38:47",
  lat: 25.11,
  lon: 55.21,
  speed: 97,
  meter: 592.6,
  ddate: "01-Oct-2026",
  dtime: "08:38:47 PM",
  motion: true,
  VehicleType: "SUV",
  address: "History synthetic address",
  srno: 42,
};
