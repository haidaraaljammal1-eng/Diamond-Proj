import { env } from "src/config/env";
import {
  isPushoverConfigured,
  pushoverRuntimeConfig,
} from "src/modules/notification-delivery/notification.config";
import type {
  NotificationPayload,
  NotificationProvider,
  NotificationSendResult,
} from "src/modules/notification-delivery/notification.types";
import {
  PushoverClient,
  PushoverClientError,
} from "src/modules/notification-delivery/pushover/pushover.client";
import type { PushoverRuntimeConfig } from "src/modules/notification-delivery/pushover/pushover.types";

export interface PushoverProviderDeps {
  enabled?: boolean;
  config?: PushoverRuntimeConfig | null;
  client?: PushoverClient;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class PushoverProvider implements NotificationProvider {
  readonly name = "pushover";
  readonly configured: boolean;
  private readonly enabled: boolean;
  private readonly config: PushoverRuntimeConfig | null;
  private readonly client: PushoverClient | null;

  constructor(deps: PushoverProviderDeps = {}) {
    this.enabled = deps.enabled ?? env.PUSHOVER_ENABLED;
    const resolvedConfig =
      deps.config === undefined
        ? this.enabled && isPushoverConfigured()
          ? pushoverRuntimeConfig()
          : null
        : deps.config && isPushoverConfigured(deps.config)
          ? {
              appToken: deps.config.appToken.trim(),
              userKey: deps.config.userKey.trim(),
            }
          : null;
    this.config = resolvedConfig;
    this.configured = this.enabled && Boolean(resolvedConfig);
    this.client =
      deps.client ??
      (resolvedConfig
        ? new PushoverClient({
            config: resolvedConfig,
            fetchImpl: deps.fetchImpl,
            timeoutMs: deps.timeoutMs,
          })
        : null);
  }

  async send(payload: NotificationPayload): Promise<NotificationSendResult> {
    if (!this.enabled) {
      return {
        success: false,
        provider: this.name,
        errorCode: "DISABLED",
      };
    }

    if (!this.config || !this.client) {
      return {
        success: false,
        provider: this.name,
        errorCode: "NOT_CONFIGURED",
      };
    }

    try {
      const outcome = await this.client.sendMessage(payload);
      const accepted = outcome.statusCode >= 200 && outcome.statusCode < 300 && outcome.providerStatus === 1;

      if (!accepted) {
        return {
          success: false,
          provider: this.name,
          statusCode: outcome.statusCode,
          providerStatus: outcome.providerStatus,
          requestId: outcome.requestId,
          errorCode:
            outcome.statusCode >= 200 && outcome.statusCode < 300
              ? "PROVIDER_REJECTED"
              : "HTTP_ERROR",
        };
      }

      return {
        success: true,
        provider: this.name,
        statusCode: outcome.statusCode,
        providerStatus: outcome.providerStatus,
        requestId: outcome.requestId,
      };
    } catch (error) {
      if (error instanceof PushoverClientError) {
        return {
          success: false,
          provider: this.name,
          errorCode: error.code,
        };
      }

      return {
        success: false,
        provider: this.name,
        errorCode: "UNEXPECTED_ERROR",
      };
    }
  }
}
