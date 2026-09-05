/**
 * Navigation types — Diamond Rent Car
 *
 * The config mirrors the Demo rail exactly. Items are:
 * - `link`   → a route navigation item (`href` without locale prefix).
 * - `action` → a Demo control that is not a page route (e.g. WhatsApp dock).
 *
 * Visibility rules (in evaluation order):
 * 1. `permission`  → filtered by the real Backend permission (JWT session).
 *    Only permissions that actually exist in the Backend are wired today
 *    (`dashboard.read`). No permission is ever invented.
 * 2. `adminOnly`   → mirrors the Demo `adminonly` owner/employee behavior.
 *    In the Backend the only shipped role is `system_admin`; an `adminOnly`
 *    item is shown only to a user whose session carries that role.
 */

export const SYSTEM_ADMIN_ROLE = "system_admin";

export type NavigationTranslationKey =
  | "home"
  | "dashboard"
  | "operations"
  | "cars"
  | "gps"
  | "maintenance"
  | "violations"
  | "finance"
  | "invoices"
  | "contracts"
  | "chats"
  | "admin"
  | "team"
  | "roles";

export type NavigationItemType = "link" | "action";

export type NavigationIconKey =
  | "dashboard"
  | "operations"
  | "cars"
  | "gps"
  | "maintenance"
  | "violations"
  | "finance"
  | "invoices"
  | "contracts"
  | "chats"
  | "team"
  | "roles";

export interface NavigationItem {
  key: string;
  type: NavigationItemType;
  labelKey: NavigationTranslationKey;
  /** Locale-less route (`/dashboard`). Only defined for `type: "link"`. */
  href?: string;
  icon: NavigationIconKey;
  /** Real Backend permission · optional when the Backend has none yet. */
  permission?: string;
  /**
   * Real Backend permissions the target page reads, ALL of which are required.
   * Use it when a page consumes more than one endpoint (Roles reads both
   * `roles.read` and `permissions.read`).
   */
  permissions?: string[];
  /** Demo `adminonly` behavior (owner only). */
  adminOnly?: boolean;
  /** Demo badge count (visible only when > 0). */
  badge?: number;
}

export interface NavigationGroup {
  key: string;
  labelKey: NavigationTranslationKey;
  /** Demo `adminonly` group label (owner only). */
  adminOnly?: boolean;
  items: NavigationItem[];
}

export type NavigationConfig = NavigationGroup[];

export type TranslatedNavigationItem = NavigationItem & { label: string };
export type TranslatedNavigationGroup = Omit<NavigationGroup, "items"> & {
  label: string;
  items: TranslatedNavigationItem[];
};

export interface UseNavigationResult {
  /** Groups and items after role/permission filtering, with translated labels. */
  groups: TranslatedNavigationGroup[];
  /** True when the current URL matches the item route (route = source of truth). */
  isActive: (href: string | undefined) => boolean;
  /** Current path without the locale prefix (e.g. `/dashboard`). */
  currentPath: string;
  /** Prefixes a locale-less href with the active locale (e.g. `/ar/dashboard`). */
  hrefFor: (href: string | undefined) => string;
  /** Current locale. */
  locale: string;
  /** Whether the authenticated user carries the Demo admin role. */
  isAdmin: boolean;
}
