import type { NotificationProvider } from "src/modules/notification-delivery/notification.types";
import { PushoverProvider } from "src/modules/notification-delivery/providers/pushover.provider";

let testOverride: NotificationProvider | undefined;

export function setNotificationProviderForTests(provider: NotificationProvider | undefined): void {
  testOverride = provider;
}

export function createNotificationProvider(): NotificationProvider {
  if (testOverride) return testOverride;
  return new PushoverProvider();
}
