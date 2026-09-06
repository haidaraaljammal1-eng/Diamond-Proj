"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth, usePermissions } from "@/modules/auth";
import { navigationConfig } from "../navigation.config";
import {
  SYSTEM_ADMIN_ROLE,
  type NavigationGroup,
  type NavigationItem,
  type UseNavigationResult,
} from "../navigation.types";

const LOCALE_PATTERN = /^\/(ar|en)(?=\/|$)/;

type TranslatedNavigationItem = NavigationItem & { label: string };
type TranslatedNavigationGroup = Omit<NavigationGroup, "items"> & {
  label: string;
  items: TranslatedNavigationItem[];
};

/**
 * Navigation logic lives here — the Sidebar only renders.
 *
 * - Active item derives from the URL (pathname), never from Zustand.
 * - Hrefs are locale-aware through the active locale.
 * - Visibility is filtered by real Backend permissions and by the Demo
 *   `adminonly` role behavior.
 * - Labels are translated here so the Sidebar receives final text.
 */
export function useNavigation(): UseNavigationResult {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("navigation");
  const { user } = useAuth();
  const { hasPermission } = usePermissions();

  return useMemo(() => {
    const roles = user?.roles ?? [];
    const isAdmin = roles.includes(SYSTEM_ADMIN_ROLE);

    const currentPath = pathname.replace(LOCALE_PATTERN, "") || "/";

    /**
     * Visibility: Backend permission when declared and held; otherwise the Demo
     * `adminonly` heuristic (`system_admin` role) for items/groups without a
     * matching permission in the session.
     */
    const isItemVisible = (
      item: NavigationItem,
      group: NavigationGroup,
    ): boolean => {
      const required = [
        ...(item.permission ? [item.permission] : []),
        ...(item.permissions ?? []),
      ];
      if (required.length > 0 && required.every(hasPermission)) return true;
      return (!item.adminOnly && !group.adminOnly) || isAdmin;
    };

    const groups: TranslatedNavigationGroup[] = navigationConfig
      .map((group) => {
        const items: TranslatedNavigationItem[] = group.items
          .filter((item) => isItemVisible(item, group))
          .map((item) => ({
            ...item,
            label: t(item.labelKey),
          }));

        return {
          ...group,
          label: t(group.labelKey),
          items,
        };
      })
      .filter((group) => group.items.length > 0);

    const isActive = (href: string | undefined): boolean => {
      if (!href) return false;
      return currentPath === href || currentPath.startsWith(`${href}/`);
    };

    const hrefFor = (href: string | undefined): string =>
      href ? `/${locale}${href}` : "";

    return { groups, isActive, currentPath, hrefFor, locale, isAdmin };
  }, [hasPermission, locale, pathname, t, user?.roles]);
}