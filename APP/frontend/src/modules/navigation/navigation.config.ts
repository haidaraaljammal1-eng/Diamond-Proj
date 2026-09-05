import type { NavigationConfig } from "./navigation.types";

/**
 * Central navigation configuration — mirrors the Diamond Demo rail exactly
 * (order, labels, icons, admin-only owners, WhatsApp action, badge).
 *
 * Permission notes:
 * - Only `dashboard.read` maps to a permission that actually exists in the
 *   Backend catalog today. All other Demo pages have NO matching Backend
 *   permission yet, so they intentionally declare none (never invented).
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
        href: "/cars",
        icon: "cars",
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
      },
    ],
  },
];
