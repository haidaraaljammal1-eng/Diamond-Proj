import type { DashboardQuickAccessItem } from "../types/dashboard.types.ts";

export const DASHBOARD_QUICK_ACCESS: readonly DashboardQuickAccessItem[] = [
  { key: "cars", href: "/vehicles", permission: "vehicles.read" },
  { key: "contracts", href: "/contracts", permission: "contracts.read" },
  { key: "gps", href: "/gps", permission: "gps.read" },
  { key: "maintenance", href: "/maintenance", permission: "maintenance.read" },
];

export const GENERATE_RENTAL_LINK_HREF = "/vehicles";
