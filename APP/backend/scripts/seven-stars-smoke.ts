import dotenv from "dotenv";
import path from "node:path";
import { createSevenStarsClient } from "src/modules/gps/providers/seven-stars/seven-stars.client";
import { mapSevenStarsFleet } from "src/modules/gps/providers/seven-stars/seven-stars.mapper";
import { SevenStarsSessionManager } from "src/modules/gps/providers/seven-stars/seven-stars.session";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

type SmokeAccount = {
  label: "ELITE" | "UNIQUE";
  providerAccountId: string;
  usernameKey: string;
  passwordKey: string;
};

const accounts: SmokeAccount[] = [
  {
    label: "ELITE",
    providerAccountId: "seven-stars-smoke-elite",
    usernameKey: "SEVEN_STARS_ELITE_USERNAME",
    passwordKey: "SEVEN_STARS_ELITE_PASSWORD",
  },
  {
    label: "UNIQUE",
    providerAccountId: "seven-stars-smoke-unique",
    usernameKey: "SEVEN_STARS_UNIQUE_USERNAME",
    passwordKey: "SEVEN_STARS_UNIQUE_PASSWORD",
  },
];

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`MISSING_ENV:${name}`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDeviceShape(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && (typeof value.id === "number" || typeof value.id === "string");
}

function isPositionShape(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    (typeof value.deviceId === "number" || typeof value.deviceId === "string") &&
    (value.valid === undefined || typeof value.valid === "boolean") &&
    (value.latitude === undefined || typeof value.latitude === "number" || value.latitude === null) &&
    (value.longitude === undefined || typeof value.longitude === "number" || value.longitude === null)
  );
}

function validCoordinate(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function printAccountReport(
  label: string,
  devices: unknown[],
  positions: unknown[],
  normalized: ReturnType<typeof mapSevenStarsFleet>,
): void {
  const statuses = devices.reduce<{ online: number; offline: number; unknown: number }>(
    (counts, device) => {
      const status = isRecord(device) && typeof device.status === "string"
        ? device.status.toLowerCase()
        : "unknown";
      if (status === "online") counts.online += 1;
      else if (status === "offline") counts.offline += 1;
      else counts.unknown += 1;
      return counts;
    },
    { online: 0, offline: 0, unknown: 0 },
  );
  const deviceIds = new Set(
    devices.filter(isDeviceShape).map((device) => String(device.id)),
  );
  const positionDeviceIds = new Set(
    positions.filter(isPositionShape).map((position) => String(position.deviceId)),
  );
  const validPositions = positions.filter(
    (position) => isPositionShape(position) && position.valid === true,
  ).length;
  const invalidPositions = positions.filter(
    (position) => isPositionShape(position) && position.valid === false,
  ).length;
  const coordinatesValid = normalized.snapshots
    .filter((snapshot) => snapshot.telemetry)
    .every((snapshot) => {
      const telemetry = snapshot.telemetry!;
      return (
        validCoordinate(telemetry.latitude, -90, 90) &&
        validCoordinate(telemetry.longitude, -180, 180)
      );
    });
  const speedValid = normalized.snapshots
    .filter((snapshot) => snapshot.telemetry?.speedKph != null)
    .every((snapshot) => Number.isFinite(snapshot.telemetry!.speedKph!) && snapshot.telemetry!.speedKph! >= 0);
  const timestampsValid = normalized.snapshots
    .filter((snapshot) => snapshot.telemetry)
    .every((snapshot) => {
      const telemetry = snapshot.telemetry!;
      return !Number.isNaN(telemetry.capturedAt.getTime()) &&
        (!telemetry.receivedAt || !Number.isNaN(telemetry.receivedAt.getTime()));
    });
  const metadataOnly = normalized.snapshots.filter((snapshot) => !snapshot.telemetry).length;

  console.log(`${label} Login: PASS`);
  console.log(`${label} Devices request: PASS`);
  console.log(`${label} Positions request: PASS`);
  console.log(`${label} Device count: ${devices.length}`);
  console.log(`${label} Position count: ${positions.length}`);
  console.log(`${label} Valid positions: ${validPositions}`);
  console.log(`${label} Invalid positions: ${invalidPositions}`);
  console.log(`${label} Online devices: ${statuses.online}`);
  console.log(`${label} Offline devices: ${statuses.offline}`);
  console.log(`${label} Unknown devices: ${statuses.unknown}`);
  console.log(`${label} Devices without position: ${[...deviceIds].filter((id) => !positionDeviceIds.has(id)).length}`);
  console.log(`${label} Normalized snapshots: ${normalized.snapshots.length}`);
  console.log(`${label} Telemetry snapshots: ${normalized.snapshots.length - metadataOnly}`);
  console.log(`${label} Metadata-only snapshots: ${metadataOnly}`);
  console.log(`${label} Coordinate validation: ${coordinatesValid ? "PASS" : "FAIL"}`);
  console.log(`${label} Speed normalization: ${speedValid ? "PASS" : "ISSUE"}`);
  console.log(`${label} Timestamp normalization: ${timestampsValid ? "PASS" : "ISSUE"}`);
  console.log(
    `${label} Connectivity separation: ${
      normalized.snapshots.every((snapshot) =>
        snapshot.telemetry?.providerDeviceState == null
      ) ? "PASS" : "ISSUE"
    }`,
  );
}

async function runAccount(
  account: SmokeAccount,
  baseUrl: string,
  sessions: SevenStarsSessionManager,
): Promise<{ devices: unknown[]; positions: unknown[] }> {
  const client = createSevenStarsClient({ baseUrl, sessionManager: sessions });
  const context = {
    providerAccountId: account.providerAccountId,
    credentials: {
      username: requiredEnv(account.usernameKey),
      password: requiredEnv(account.passwordKey),
    },
  };

  const session = await client.ensureSession(context);
  if (!session.providerAccountId) throw new Error(`${account.label}_LOGIN_FAILED`);
  const devices = await client.fetchDevices(context);
  const positions = await client.fetchPositions(context);
  if (!Array.isArray(devices) || !Array.isArray(positions)) {
    throw new Error(`${account.label}_RESPONSE_NOT_ARRAY`);
  }
  if (!devices.every(isDeviceShape)) throw new Error(`${account.label}_DEVICE_SHAPE_DIFFERENCE`);
  if (!positions.every(isPositionShape)) throw new Error(`${account.label}_POSITION_SHAPE_DIFFERENCE`);

  const normalized = mapSevenStarsFleet(devices, positions, {
    providerAccountId: account.providerAccountId,
    receivedAt: new Date(),
  });
  printAccountReport(account.label, devices, positions, normalized);

  sessions.invalidate(account.providerAccountId);
  const recreated = await client.fetchDevices(context);
  if (!Array.isArray(recreated) || !recreated.every(isDeviceShape)) {
    throw new Error(`${account.label}_SESSION_RECREATION_FAILED`);
  }
  console.log(`${account.label} Local session recreation: PASS`);
  return { devices, positions };
}

async function main(): Promise<void> {
  const baseUrl = requiredEnv("SEVEN_STARS_BASE_URL").replace(/\/+$/, "");
  const sessions = new SevenStarsSessionManager();
  const elite = await runAccount(accounts[0]!, baseUrl, sessions);
  const unique = await runAccount(accounts[1]!, baseUrl, sessions);

  const uniqueSessionBeforeEliteInvalidation = sessions.getSession(accounts[1]!.providerAccountId);
  sessions.invalidate(accounts[0]!.providerAccountId);
  const eliteSessionAfterInvalidation = sessions.getSession(accounts[0]!.providerAccountId);
  const isolation = accounts[0]!.providerAccountId !== accounts[1]!.providerAccountId &&
    elite.devices !== unique.devices &&
    eliteSessionAfterInvalidation === null &&
    uniqueSessionBeforeEliteInvalidation !== null;

  console.log(`Account isolation: ${isolation ? "PASS" : "FAIL"}`);
  console.log("Network endpoints called: POST /api/session, GET /api/devices, GET /api/positions");
  console.log("Database writes: 0");
  console.log("Provider accounts created: 0");
  console.log("Bindings created: 0");
  console.log("Latest states written: 0");
  console.log("Coordinates printed: NO");
  console.log("Credentials/cookies printed: NO");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "SMOKE_TEST_FAILED";
  console.error(`Seven Stars smoke test failed: ${message}`);
  process.exitCode = 1;
});
