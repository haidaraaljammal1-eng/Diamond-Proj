export type DesktopNotificationResult = "sent" | "denied" | "unsupported" | "error";

export interface DesktopNotificationApi {
  permission: NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
  create: (title: string, options?: NotificationOptions) => unknown;
}

export async function sendDesktopNotification(
  input: { title: string; body: string; tag: string },
  api?: DesktopNotificationApi,
): Promise<DesktopNotificationResult> {
  const browserApi =
    api ??
    (typeof window !== "undefined" && "Notification" in window
      ? {
          permission: window.Notification.permission,
          requestPermission: () => window.Notification.requestPermission(),
          create: (title: string, options?: NotificationOptions) =>
            new window.Notification(title, options),
        }
      : undefined);

  if (!browserApi) return "unsupported";

  try {
    let permission = browserApi.permission;
    if (permission === "default") permission = await browserApi.requestPermission();
    if (permission === "denied") return "denied";
    if (permission !== "granted") return "error";
    browserApi.create(input.title, { body: input.body, tag: input.tag });
    return "sent";
  } catch {
    return "error";
  }
}
