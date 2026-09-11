import { ROLES_PAGE_PERMISSIONS } from "@/modules/roles/roles.permissions";
import { USERS_PAGE_PERMISSIONS } from "@/modules/users/users.permissions";
import { VEHICLES_PAGE_PERMISSIONS } from "@/modules/vehicles/vehicles.permissions";
import { CONTRACTS_PAGE_PERMISSIONS } from "@/modules/contracts/contracts.permissions";
import { MAINTENANCE_PAGE_PERMISSIONS } from "@/modules/maintenance/maintenance.permissions";
import { FINANCE_PAGE_PERMISSIONS } from "@/modules/finance/finance.permissions";
import type { NavigationConfig } from "./navigation.types";

/**
 * Central navigation configuration — Diamond operational rail
 * (order, labels, icons, admin-only owners, WhatsApp action, badge).
 *
 * Permission notes:
 * - `dashboard.read`, the Staff entry (`users.read`), the Roles entry
 *   (`roles.read` + `permissions.read`), Vehicles (`vehicles.read`),
 *   Contracts (`contracts.read`), Maintenance (`maintenance.read`),
 *   GPS (`gps.read`), Violations & Salik (`violations.read`), and
 *   Finance (`finance.read`) map to permissions that exist in the Backend
 *   catalog.
 * - Remaining Demo pages with no matching Backend permission declare none
 *   (never invented).
 * - `adminOnly` mirrors the Demo `adminonly` owner/employee behavior.
 */
export const navigationConfig: NavigationConfig = [
  {
    key: "main",
    labelKey: "home",
    items: [
      {
        key: "dashboard",
        type: "link",
        labelKey: "dashboard",
        href: "/dashboard",
        icon: "dashboard",
        permission: "dashboard.read",
      },
      {
        key: "cars",
        type: "link",
        labelKey: "cars",
        href: "/vehicles",
        icon: "cars",
        permissions: [...VEHICLES_PAGE_PERMISSIONS],
      },
      {
        key: "gps",
        type: "link",
        labelKey: "gps",
        href: "/gps",
        icon: "gps",
        permission: "gps.read",
      },
      {
        key: "maintenance",
        type: "link",
        labelKey: "maintenance",
        href: "/maintenance",
        icon: "maintenance",
        permissions: [...MAINTENANCE_PAGE_PERMISSIONS],
      },
      {
        key: "violations",
        type: "link",
        labelKey: "violations",
        href: "/violations",
        icon: "violations",
        permission: "violations.read",
      },
      {
        key: "finance",
        type: "link",
        labelKey: "finance",
        href: "/finance",
        icon: "finance",
        permissions: [...FINANCE_PAGE_PERMISSIONS],
      },
      {
        key: "invoices",
        type: "link",
        labelKey: "invoices",
        href: "/invoices",
        icon: "invoices",
        adminOnly: true,
      },
      {
        key: "contracts",
        type: "link",
        labelKey: "contracts",
        href: "/contracts",
        icon: "contracts",
        permissions: [...CONTRACTS_PAGE_PERMISSIONS],
      },
      {
        key: "chats",
        type: "action",
        labelKey: "chats",
        icon: "chats",
        badge: 3,
      },
    ],
  },
  {
    key: "admin",
    labelKey: "admin",
    adminOnly: true,
    items: [
      {
        key: "team",
        type: "link",
        labelKey: "team",
        href: "/team",
        icon: "team",
        adminOnly: true,
        permissions: [...USERS_PAGE_PERMISSIONS],
      },
      {
        // Permission-driven: the page reads `GET /roles` and `GET /permissions`,
        // so both Backend permissions are required to see the entry.
        key: "roles",
        type: "link",
        labelKey: "roles",
        href: "/roles",
        icon: "roles",
        permissions: [...ROLES_PAGE_PERMISSIONS],
      },
    ],
  },
];
