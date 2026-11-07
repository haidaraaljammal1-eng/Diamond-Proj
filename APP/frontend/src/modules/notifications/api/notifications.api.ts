import { apiRequest } from "@/infrastructure/api/client";
import type { StaffNotificationDto } from "../types/notifications.types";

const PATH = "/notifications";

export async function listMyNotifications(params?: {
  page?: number;
  pageSize?: number;
  unreadOnly?: boolean;
}): Promise<StaffNotificationDto[]> {
  const search = new URLSearchParams();
  search.set("page", String(params?.page ?? 1));
  search.set("pageSize", String(params?.pageSize ?? 50));
  if (params?.unreadOnly) search.set("unreadOnly", "true");
  const response = await apiRequest<StaffNotificationDto[]>(`${PATH}?${search.toString()}`);
  return response.data;
}

export async function getMyUnreadNotificationCount(): Promise<number> {
  const response = await apiRequest<{ count: number }>(`${PATH}/unread-count`);
  return response.data.count;
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiRequest(`${PATH}/${encodeURIComponent(id)}/read`, { method: "PATCH" });
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiRequest(`${PATH}/read-all`, { method: "PATCH" });
}
