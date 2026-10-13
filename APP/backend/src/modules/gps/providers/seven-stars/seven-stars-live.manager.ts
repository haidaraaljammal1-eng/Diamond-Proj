import type { FastifyInstance } from "fastify";
import WebSocket from "ws";
import { decryptSecretBlob } from "src/modules/integrations/secret-blob";
import { createGpsService } from "src/modules/gps/gps.service";
import { getSharedSevenStarsSessionManager } from "src/modules/gps/gps-live-gps-sessions";
import { mapSevenStarsFleet } from "src/modules/gps/providers/seven-stars/seven-stars.mapper";
import { createSevenStarsClient } from "src/modules/gps/providers/seven-stars/seven-stars.client";
import { SEVEN_STARS_DEFAULT_BASE_URL } from "src/modules/gps/providers/seven-stars/seven-stars.constants";
import { getSevenStarsLivePublisher } from "src/modules/gps/providers/seven-stars/seven-stars-live.publisher";

type Connection = {
  accountId: string;
  accountKey: string;
  socket: WebSocket | null;
  reconnectTimer: NodeJS.Timeout | null;
  stopped: boolean;
  reconnectAttempt: number;
  devices: unknown[];
};

function parseObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export class SevenStarsLiveConnectionManager {
  private readonly connections = new Map<string, Connection>();
  private readonly gps: ReturnType<typeof createGpsService>;
  private readonly sessions = getSharedSevenStarsSessionManager();
  private readonly publisher = getSevenStarsLivePublisher();
  private readonly baseUrl: string;
  private shuttingDown = false;

  constructor(private readonly fastify: FastifyInstance) {
    this.gps = createGpsService(fastify);
    this.baseUrl = (process.env.SEVEN_STARS_BASE_URL ?? SEVEN_STARS_DEFAULT_BASE_URL).replace(
      /^http/,
      "ws",
    );
  }

  async startEnabledAccounts(): Promise<void> {
    if (this.shuttingDown) return;
    const accounts = await this.fastify.prisma.gpsProviderAccount.findMany({
      where: { providerKey: "SEVEN_STARS", enabled: true },
      select: { id: true, accountKey: true, secretEncrypted: true },
    });
    for (const account of accounts) this.start(account.id, account.accountKey);
  }

  start(accountId: string, accountKey: string): void {
    if (this.shuttingDown || this.connections.has(accountId)) return;
    const connection: Connection = {
      accountId,
      accountKey,
      socket: null,
      reconnectTimer: null,
      stopped: false,
      reconnectAttempt: 0,
      devices: [],
    };
    this.connections.set(accountId, connection);
    void this.connect(connection);
  }

  async stop(accountId: string): Promise<void> {
    const connection = this.connections.get(accountId);
    if (!connection) return;
    connection.stopped = true;
    if (connection.reconnectTimer) clearTimeout(connection.reconnectTimer);
    connection.socket?.close();
    connection.socket = null;
    this.connections.delete(accountId);
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    const ids = [...this.connections.keys()];
    await Promise.all(ids.map((id) => this.stop(id)));
  }

  get activeConnectionCount(): number {
    return [...this.connections.values()].filter((connection) => connection.socket != null).length;
  }

  private async connect(connection: Connection): Promise<void> {
    if (connection.stopped || this.shuttingDown) return;
    try {
      const account = await this.fastify.prisma.gpsProviderAccount.findUnique({
        where: { id: connection.accountId },
        select: { id: true, secretEncrypted: true, enabled: true },
      });
      if (!account?.enabled) return;
      const credentials = decryptSecretBlob(account.secretEncrypted) as {
        username: string;
        password: string;
      };
      const client = createSevenStarsClient({ sessionManager: this.sessions, baseUrl: this.baseUrl.replace(/^ws/, "http") });
      const session = await client.ensureSession({
        providerAccountId: connection.accountId,
        credentials,
      });
      const devices = await client.fetchDevices({
        providerAccountId: connection.accountId,
        credentials,
      });
      if (!Array.isArray(devices)) throw new Error("SEVEN_STARS_DEVICES_INVALID");
      connection.devices = devices;
      const socket = new WebSocket(`${this.baseUrl}/api/socket`, {
        headers: { Cookie: `JSESSIONID=${session.cookieValue}` },
      });
      connection.socket = socket;
      socket.on("open", () => {
        connection.reconnectAttempt = 0;
        this.fastify.log.info({ accountKey: connection.accountKey }, "seven stars live socket connected");
      });
      socket.on("message", (data) => void this.handleMessage(connection, data.toString()));
      socket.on("error", () => undefined);
      socket.on("close", (code) => {
        if (connection.socket === socket) connection.socket = null;
        if (!connection.stopped && !this.shuttingDown) this.scheduleReconnect(connection, code === 1008);
      });
    } catch {
      this.scheduleReconnect(connection, true);
    }
  }

  private scheduleReconnect(connection: Connection, refreshSession: boolean): void {
    if (connection.stopped || this.shuttingDown || connection.reconnectTimer) return;
    if (refreshSession) this.sessions.invalidate(connection.accountId);
    const delay = Math.min(30_000, 1_000 * 2 ** connection.reconnectAttempt++);
    connection.reconnectTimer = setTimeout(() => {
      connection.reconnectTimer = null;
      void this.connect(connection);
    }, delay);
    connection.reconnectTimer.unref?.();
  }

  private async handleMessage(connection: Connection, text: string): Promise<void> {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      return;
    }
    const message = parseObject(value);
    if (!message) return;
    if (Array.isArray(message.devices)) connection.devices = message.devices;
    if (!Array.isArray(message.positions) || connection.devices.length === 0) return;
    const fleet = mapSevenStarsFleet(connection.devices, message.positions, {
      providerAccountId: connection.accountId,
      receivedAt: new Date(),
    });
    const bindings = await this.fastify.prisma.vehicleGpsBinding.findMany({
      where: { providerAccountId: connection.accountId, isActive: true },
      select: { vehicleId: true, externalDeviceId: true },
    });
    const byDevice = new Map(fleet.snapshots.map((snapshot) => [snapshot.externalDeviceId, snapshot]));
    for (const binding of bindings) {
      const snapshot = byDevice.get(binding.externalDeviceId);
      if (!snapshot?.telemetry) continue;
      const outcome = await this.gps.ingestLatestPosition({
        vehicleId: binding.vehicleId,
        ...snapshot.telemetry,
      });
      if (outcome.applied) {
        const latest = await this.fastify.prisma.vehicleGpsLatestState.findUnique({
          where: { vehicleId: binding.vehicleId },
          select: {
            latitude: true,
            longitude: true,
            speedKph: true,
            headingDegrees: true,
            ignitionOn: true,
            motionState: true,
            capturedAt: true,
          },
        });
        if (latest) {
          this.publisher.publish({
            providerKey: "SEVEN_STARS",
            providerAccountId: connection.accountId,
            vehicleId: binding.vehicleId,
            latitude: latest.latitude.toNumber(),
            longitude: latest.longitude.toNumber(),
            speedKph: latest.speedKph?.toNumber() ?? null,
            headingDegrees: latest.headingDegrees?.toNumber() ?? null,
            ignitionOn: latest.ignitionOn,
            motionState: latest.motionState,
            capturedAt: latest.capturedAt,
          });
        }
      }
    }
  }
}
