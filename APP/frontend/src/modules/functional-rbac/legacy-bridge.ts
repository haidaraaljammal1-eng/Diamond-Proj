import type { FunctionalPageId } from "./types";

/** Legacy page permission arrays used when V2 UI is disabled. */
import { DASHBOARD_PAGE_PERMISSIONS } from "@/modules/dashboard/dashboard.permissions";
import { VEHICLES_PAGE_PERMISSIONS } from "@/modules/vehicles/vehicles.permissions";
import { GPS_PAGE_PERMISSIONS } from "@/modules/gps/gps.permissions";
import { MAINTENANCE_PAGE_PERMISSIONS } from "@/modules/maintenance/maintenance.permissions";
import { ARCHIVE_PAGE_PERMISSIONS } from "@/modules/archive/archive.permissions";
import { ROAD_LIABILITIES_PAGE_PERMISSIONS } from "@/modules/road-liabilities/road-liabilities.permissions";
import { FINANCE_PAGE_PERMISSIONS } from "@/modules/finance/finance.permissions";
import { INVOICES_PAGE_PERMISSIONS } from "@/modules/invoices/invoices.permissions";
import { CONTRACTS_PAGE_PERMISSIONS } from "@/modules/contracts/contracts.permissions";
import { WHATSAPP_PAGE_PERMISSIONS } from "@/modules/whatsapp/whatsapp.permissions";
import { USERS_PAGE_PERMISSIONS } from "@/modules/users/users.permissions";
import { ROLES_PAGE_PERMISSIONS } from "@/modules/roles/roles.permissions";

export const LEGACY_PAGE_PERMISSIONS: Record<FunctionalPageId, readonly string[]> = {
  dashboard: DASHBOARD_PAGE_PERMISSIONS,
  vehicles: VEHICLES_PAGE_PERMISSIONS,
  gps: GPS_PAGE_PERMISSIONS,
  maintenance: MAINTENANCE_PAGE_PERMISSIONS,
  archive: ARCHIVE_PAGE_PERMISSIONS,
  violations: ROAD_LIABILITIES_PAGE_PERMISSIONS,
  finance: FINANCE_PAGE_PERMISSIONS,
  invoices: INVOICES_PAGE_PERMISSIONS,
  contracts: CONTRACTS_PAGE_PERMISSIONS,
  whatsapp: WHATSAPP_PAGE_PERMISSIONS,
  users: USERS_PAGE_PERMISSIONS,
  roles: ROLES_PAGE_PERMISSIONS,
};
