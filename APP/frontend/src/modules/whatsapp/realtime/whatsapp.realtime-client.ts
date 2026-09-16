import {
  nextRealtimeBackoffMs,
  parseSseFrames,
  type WhatsAppRealtimeEvent,
  type WhatsAppRealtimeTransportStatus,
} from "./whatsapp.realtime.ts";

export interface WhatsAppRealtimeHandlers {
  onEvent: (event: WhatsAppRealtimeEvent) => void;
  onStatus: (status: WhatsAppRealtimeTransportStatus) => void;
  onReconnect: () => void;
  onAuthFailure?: () => void;
}

export interface WhatsAppRealtimeClientDeps {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string | undefined>;
  apiUrl?: string;
  isOnline?: () => boolean;
}

const PATH = "/whatsapp/realtime";

async function defaultAccessToken(): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined;
  const { getSession } = await import("next-auth/react");
  return (await getSession())?.accessToken;
}

/**
 * Authenticated fetch-based SSE client. Authorization stays in headers.
 * Never puts JWT/session tokens in the URL.
 */
export class WhatsAppRealtimeClient {
  private readonly deps: Required<Pick<WhatsAppRealtimeClientDeps, "fetchImpl" | "apiUrl">> &
    WhatsAppRealtimeClientDeps;
  private readonly handlers = new Set<WhatsAppRealtimeHandlers>();
  private abort: AbortController | null = null;
  private lastEventId: string | null = null;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private streamGeneration = 0;
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;

  constructor(deps: WhatsAppRealtimeClientDeps = {}) {
    this.deps = {
      fetchImpl: deps.fetchImpl ?? fetch.bind(globalThis),
      apiUrl: (deps.apiUrl ?? process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, ""),
      getAccessToken: deps.getAccessToken,
      isOnline: deps.isOnline,
    };
  }

  get handlerCount(): number {
    return this.handlers.size;
  }

  addHandler(handler: WhatsAppRealtimeHandlers): () => void {
    this.handlers.add(handler);
    if (this.stopped) this.start();
    return () => {
      this.handlers.delete(handler);
      if (this.handlers.size === 0) this.stop();
    };
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.bindNetwork();
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.unbindNetwork();
    this.clearReconnect();
    this.abort?.abort();
    this.abort = null;
    this.attempt = 0;
    this.emitStatus("idle");
  }

  /** Test helper. */
  getLastEventId(): string | null {
    return this.lastEventId;
  }

  private bindNetwork(): void {
    if (typeof window === "undefined") return;
    this.onlineHandler = () => {
      if (this.stopped) return;
      this.attempt = 0;
      void this.connect();
    };
    this.offlineHandler = () => {
      this.abort?.abort();
      this.emitStatus("offline");
    };
    window.addEventListener("online", this.onlineHandler);
    window.addEventListener("offline", this.offlineHandler);
  }

  private unbindNetwork(): void {
    if (typeof window === "undefined") return;
    if (this.onlineHandler) window.removeEventListener("online", this.onlineHandler);
    if (this.offlineHandler) window.removeEventListener("offline", this.offlineHandler);
    this.onlineHandler = null;
    this.offlineHandler = null;
  }

  private isOnline(): boolean {
    if (this.deps.isOnline) return this.deps.isOnline();
    if (typeof navigator === "undefined") return true;
    return navigator.onLine;
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    if (!this.isOnline()) {
      this.emitStatus("offline");
      return;
    }
    this.abort?.abort();
    const controller = new AbortController();
    this.abort = controller;
    const generation = ++this.streamGeneration;
    const token = await (this.deps.getAccessToken ?? defaultAccessToken)();
    if (this.stopped || generation !== this.streamGeneration) return;
    const headers: Record<string, string> = {
      Accept: "text/event-stream",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (this.lastEventId) headers["Last-Event-ID"] = this.lastEventId;

    try {
      const response = await this.deps.fetchImpl(`${this.deps.apiUrl}${PATH}`, {
        method: "GET",
        headers,
        credentials: "include",
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) {
        this.stop();
        this.handlers.forEach((handler) => handler.onAuthFailure?.());
        return;
      }
      if (!response.ok || !response.body) {
        this.scheduleReconnect();
        return;
      }
      const wasReconnect = this.attempt > 0;
      this.attempt = 0;
      this.emitStatus("live");
      if (wasReconnect) this.handlers.forEach((handler) => handler.onReconnect());
      await this.readStream(response.body, controller.signal, generation);
      if (!this.stopped && generation === this.streamGeneration) this.scheduleReconnect();
    } catch (error) {
      if (controller.signal.aborted || this.stopped) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      this.scheduleReconnect();
    }
  }

  private async readStream(
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal,
    generation: number,
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (!signal.aborted && generation === this.streamGeneration) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseFrames(buffer);
        buffer = parsed.rest;
        for (const event of parsed.events) {
          this.lastEventId = event.eventId;
          this.handlers.forEach((handler) => handler.onEvent(event));
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // Stream already closed.
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    if (!this.isOnline()) {
      this.emitStatus("offline");
      return;
    }
    this.emitStatus("reconnecting");
    this.clearReconnect();
    const delay = nextRealtimeBackoffMs(this.attempt);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private emitStatus(status: WhatsAppRealtimeTransportStatus): void {
    this.handlers.forEach((handler) => handler.onStatus(status));
  }
}

let shared: WhatsAppRealtimeClient | null = null;

export function acquireWhatsAppRealtime(
  handler: WhatsAppRealtimeHandlers,
  deps?: WhatsAppRealtimeClientDeps,
): () => void {
  if (!shared) shared = new WhatsAppRealtimeClient(deps);
  return shared.addHandler(handler);
}

export function resetWhatsAppRealtimeClientForTests(): void {
  shared?.stop();
  shared = null;
}
