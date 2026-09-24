import { PUSHOVER_SEND_TIMEOUT_MS } from "src/modules/notification-delivery/notification.config";
import { PUSHOVER_MESSAGES_URL } from "src/modules/notification-delivery/pushover/pushover.constants";
import type {
  PushoverApiResponse,
  PushoverRuntimeConfig,
  PushoverSendInput,
  PushoverSendOutcome,
} from "src/modules/notification-delivery/pushover/pushover.types";

export class PushoverClientError extends Error {
  constructor(
    readonly code: "TIMEOUT" | "NETWORK_ERROR" | "INVALID_RESPONSE",
    message: string,
  ) {
    super(message);
    this.name = "PushoverClientError";
  }
}

export interface PushoverClientOptions {
  config: PushoverRuntimeConfig;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function asPushoverResponse(value: unknown): PushoverApiResponse | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const status = (value as { status?: unknown }).status;
  if (typeof status !== "number") return null;
  const request = (value as { request?: unknown }).request;
  const errors = (value as { errors?: unknown }).errors;
  return {
    status,
    ...(typeof request === "string" ? { request } : {}),
    ...(Array.isArray(errors)
      ? { errors: errors.filter((entry): entry is string => typeof entry === "string") }
      : {}),
  };
}

function mapPriority(priority: PushoverSendInput["priority"]): string | undefined {
  if (priority === "high") return "1";
  if (priority === "normal") return "0";
  return undefined;
}

export class PushoverClient {
  private readonly config: PushoverRuntimeConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: PushoverClientOptions) {
    this.config = options.config;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? PUSHOVER_SEND_TIMEOUT_MS;
  }

  async sendMessage(input: PushoverSendInput): Promise<PushoverSendOutcome> {
    const body = new URLSearchParams({
      token: this.config.appToken,
      user: this.config.userKey,
      title: input.title,
      message: input.message,
    });

    const priority = mapPriority(input.priority);
    if (priority !== undefined) body.set("priority", priority);
    if (input.url?.trim()) body.set("url", input.url.trim());
    if (input.urlTitle?.trim()) body.set("url_title", input.urlTitle.trim());

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(PUSHOVER_MESSAGES_URL, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
        signal: controller.signal,
        redirect: "error",
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new PushoverClientError("TIMEOUT", "Pushover request timed out");
      }
      throw new PushoverClientError("NETWORK_ERROR", "Pushover request failed");
    } finally {
      clearTimeout(timer);
    }

    let payload: PushoverApiResponse | null = null;
    try {
      payload = asPushoverResponse(await response.json());
    } catch {
      throw new PushoverClientError("INVALID_RESPONSE", "Pushover returned a non-JSON response");
    }

    if (!payload) {
      throw new PushoverClientError("INVALID_RESPONSE", "Pushover returned an invalid JSON payload");
    }

    return {
      statusCode: response.status,
      providerStatus: payload.status,
      requestId: typeof payload.request === "string" ? payload.request : undefined,
      errors: payload.errors,
    };
  }
}
