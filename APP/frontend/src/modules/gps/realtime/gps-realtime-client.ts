import { env } from "@/config/env";

export interface GpsRealtimeEvent {
  vehicleId: number;
  providerKey: "SEVEN_STARS";
  latitude: number;
  longitude: number;
  speedKph: number | null;
  headingDegrees: number | null;
  ignitionOn: boolean | null;
  motionState: "UNKNOWN" | "MOVING" | "PARKED";
  capturedAt: string;
}

export class GpsRealtimeClient {
  private abort: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private attempt = 0;
  private readonly onEvent: (event: GpsRealtimeEvent) => void;

  constructor(onEvent: (event: GpsRealtimeEvent) => void) {
    this.onEvent = onEvent;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.abort?.abort();
    this.abort = null;
    this.attempt = 0;
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    const controller = new AbortController();
    this.abort = controller;
    try {
      const { getSession } = await import("next-auth/react");
      const token = (await getSession())?.accessToken;
      const headers: Record<string, string> = { Accept: "text/event-stream" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`${env.apiUrl.replace(/\/$/, "")}/gps/realtime`, {
        headers,
        credentials: "include",
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error("GPS_REALTIME_UNAVAILABLE");
      this.attempt = 0;
      await this.read(response.body, controller.signal);
    } catch (error) {
      if (!this.stopped && !(error instanceof DOMException && error.name === "AbortError")) {
        const delay = Math.min(30_000, 1_000 * 2 ** this.attempt++);
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          void this.connect();
        }, delay);
      }
    }
  }

  private async read(body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!signal.aborted && !this.stopped) {
      const next = await reader.read();
      if (next.done) break;
      buffer += decoder.decode(next.value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.split("\n").find((value) => value.startsWith("data: "));
        if (!line) continue;
        try {
          const event = JSON.parse(line.slice(6)) as GpsRealtimeEvent;
          if (event.providerKey === "SEVEN_STARS") this.onEvent(event);
        } catch {
          // Ignore malformed server frames; REST remains the recovery path.
        }
      }
    }
    if (!this.stopped && !signal.aborted) throw new Error("GPS_REALTIME_CLOSED");
  }
}
