"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  useNavigation,
  type TranslatedNavigationGroup,
  type TranslatedNavigationItem,
} from "@/modules/navigation";
import { useMediaQuery } from "@/shared/hooks/use-media-query";
import {
  selectSidebarExpanded,
  useAppShellStore,
} from "../store/app-shell.store";
import { SidebarItem } from "./sidebar-item";
import { SidebarFooter } from "./sidebar-footer";
import { SidebarFleetStat } from "./sidebar-fleet-stat";
import { SidebarAccount } from "./sidebar-account";
import { SidebarBrand } from "./sidebar-brand";
import { SidebarQuickAction } from "./sidebar-quick-action";
import styles from "./sidebar.module.css";

/** Below this width the rail becomes an overlay drawer (Demo breakpoint). */
const DRAWER_QUERY = "(max-width: 900px)";

/**
 * Sidebar — the Demo `#rail` icon dock. Render-only.
 *
 * All navigation logic (config, active route, locale hrefs, permission/admin
 * filtering, label translation) lives in `useNavigation`. This component reads
 * the resulting groups and renders labels + items, and owns only the shell
 * interactions of the rail itself: drawer close, expand/collapse shortcut and
 * the off-screen state of the mobile drawer.
 *
 * The rail heads with the Diamond brand and the primary quick action; the
 * expand/collapse control sits in the header instead, so it keeps one screen
 * position while the rail edge moves.
 */
export function Sidebar() {
  const t = useTranslations("Shell");
  const { groups, isActive, hrefFor, currentPath } = useNavigation();
  const isDrawer = useMediaQuery(DRAWER_QUERY);
  const expanded = useAppShellStore(selectSidebarExpanded);
  const mobileSidebarOpen = useAppShellStore((s) => s.mobileSidebarOpen);
  const closeMobileSidebar = useAppShellStore((s) => s.closeMobileSidebar);
  const toggleSidebar = useAppShellStore((s) => s.toggleSidebar);
  const toggleSidebarExpanded = useAppShellStore(
    (s) => s.toggleSidebarExpanded,
  );

  /* Route changes (links, browser back/forward) always close the drawer. */
  useEffect(() => {
    closeMobileSidebar();
  }, [currentPath, closeMobileSidebar]);

  /* Keyboard: Escape closes the drawer, Ctrl/⌘+B toggles the rail. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!useAppShellStore.getState().mobileSidebarOpen) return;
        closeMobileSidebar();
        document
          .querySelector<HTMLElement>('header [data-shell-control="drawer"]')
          ?.focus();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        if (isDrawer) toggleSidebar();
        else toggleSidebarExpanded();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeMobileSidebar, isDrawer, toggleSidebar, toggleSidebarExpanded]);

  const showAdminFooter = groups.length > 1;
  /* A closed drawer is translated off-screen — keep it out of the tab order. */
  const hidden = isDrawer && !mobileSidebarOpen;

  return (
    <nav
      id="app-sidebar"
      className={`${styles.rail} ${mobileSidebarOpen ? styles.railOpen : ""}`}
      data-expanded={expanded}
      aria-label={t("railLabel")}
      inert={hidden}
    >
      <SidebarBrand
        href={hrefFor("/dashboard")}
        onNavigate={closeMobileSidebar}
      />
      <SidebarQuickAction />
      <div className={styles.headDivider} aria-hidden="true" />

      {groups.map((group: TranslatedNavigationGroup, index) => {
        const isFirstVisible = index === 0;
        return (
          <div key={group.key} className={styles.group}>
            {!isFirstVisible && <div className={styles.divider} />}
            <span className={styles.label}>{group.label}</span>
            {group.items.map((item: TranslatedNavigationItem) => (
              <SidebarItem
                key={item.key}
                item={item}
                active={isActive(item.href)}
                hrefFor={hrefFor(item.href)}
                onNavigate={closeMobileSidebar}
                label={item.label}
              />
            ))}
          </div>
        );
      })}

      {/* Pinned to the rail's bottom edge together: the fleet KPI, then the
          admin version footer (when present), then the account row last. */}
      <div className={styles.bottomGroup}>
        <SidebarFleetStat />
        {showAdminFooter && <SidebarFooter />}
        <SidebarAccount />
      </div>
    </nav>
  );
}
