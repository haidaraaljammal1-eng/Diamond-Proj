import { ROLES_PAGE_PERMISSIONS } from "@/modules/roles/roles.permissions";
import { USERS_PAGE_PERMISSIONS } from "@/modules/users/users.permissions";
import { VEHICLES_PAGE_PERMISSIONS } from "@/modules/vehicles/vehicles.permissions";
import { CONTRACTS_PAGE_PERMISSIONS } from "@/modules/contracts/contracts.permissions";
import type { NavigationConfig } from "./navigation.types";

/**
 * Central navigation configuration — mirrors the Diamond Demo rail exactly
 * (order, labels, icons, admin-only owners, WhatsApp action, badge).
 *
 * Permission notes:
 * - `dashboard.read`, the Staff entry (`users.read`), the Roles entry
 *   (`roles.read` + `permissions.read`), Vehicles (`vehicles.read`), and
 *   Contracts (`contracts.read`) map to permissions that exist in the Backend catalog.
 * - Every other Demo page still has NO matching Backend permission, so it
 *   intentionally declares none (never invented).
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
        key: "operations",
        type: "link",
        labelKey: "operations",
        href: "/operations",
        icon: "operations",
        adminOnly: true,
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
      },
      {
        key: "maintenance",
        type: "link",
        labelKey: "maintenance",
        href: "/maintenance",
        icon: "maintenance",
      },
      {
        key: "violations",
        type: "link",
        labelKey: "violations",
        href: "/violations",
        icon: "violations",
        adminOnly: true,
      },
      {
        key: "finance",
        type: "link",
        labelKey: "finance",
        href: "/finance",
        icon: "finance",
        adminOnly: true,
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
