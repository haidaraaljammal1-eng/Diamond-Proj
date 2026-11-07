export interface StaffNotificationDto {
  id: string;
  eventKey: string;
  title: string;
  body: string;
  data: unknown;
  readAt: string | null;
  createdAt: string;
}

export type NotificationsInboxFilter = "ALL" | "UNREAD";
