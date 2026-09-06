import { env } from "@/config/env";

/** Absolute backend URL for an authenticated vehicle media path. */
export function resolveVehicleMediaUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${env.apiUrl}${normalized}`;
}
