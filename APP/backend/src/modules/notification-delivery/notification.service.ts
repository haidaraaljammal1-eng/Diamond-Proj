import { createNotificationProvider } from "src/modules/notification-delivery/notification.provider";
import type {
  NotificationPayload,
  NotificationSendResult,
} from "src/modules/notification-delivery/notification.types";

type ProviderFactory = () => ReturnType<typeof createNotificationProvider>;

export class NotificationService {
  constructor(private readonly resolveProvider: ProviderFactory = createNotificationProvider) {}

  /**
   * Sends an outbound notification through the configured provider.
   * Provider failures are contained in the result and must not throw to callers.
   */
  async send(payload: NotificationPayload): Promise<NotificationSendResult> {
    try {
      const provider = this.resolveProvider();
      return await provider.send(payload);
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
