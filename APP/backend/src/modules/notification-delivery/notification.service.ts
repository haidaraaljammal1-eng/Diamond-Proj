import { createNotificationProvider } from "src/modules/notification-delivery/notification.provider";
import type {
  NotificationPayload,
  NotificationSendResult,
} from "src/modules/notification-delivery/notification.types";

type ProviderFactory = () => ReturnType<typeof createNotificationProvider>;

export type PushoverInAppMirrorFn = (input: {
  title: string;
  body: string;
  dedupeKey?: string;
  requestId?: string;
}) => Promise<void>;

export class NotificationService {
  private mirror: PushoverInAppMirrorFn | null = null;

  constructor(private readonly resolveProvider: ProviderFactory = createNotificationProvider) {}

  /** Wired once at app boot — mirrors successful Pushover sends into IN_APP. */
  setInAppMirror(mirror: PushoverInAppMirrorFn | null): void {
    this.mirror = mirror;
  }

  /**
   * Sends an outbound notification through the configured provider.
   * Provider failures are contained in the result and must not throw to callers.
   * On success, optionally mirrors into the staff in-app inbox (never throws).
   */
  async send(payload: NotificationPayload): Promise<NotificationSendResult> {
    try {
      const provider = this.resolveProvider();
      const result = await provider.send(payload);
      if (result.success && this.mirror) {
        try {
          await this.mirror({
            title: payload.title,
            body: payload.message,
            dedupeKey: payload.inAppDedupeKey,
            requestId: result.requestId,
          });
        } catch {
          // Mirror must never flip a successful Pushover send into a failure.
        }
      }
      return result;
    } catch {
      return {
        success: false,
        provider: "unknown",
        errorCode: "UNEXPECTED_ERROR",
      };
    }
  }
}

export const notificationService = new NotificationService();
