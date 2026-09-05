"use client";

import { useTranslations } from "next-intl";
import {
  useNavigation,
  type TranslatedNavigationGroup,
  type TranslatedNavigationItem,
} from "@/modules/navigation";
import { useAppShellStore } from "../store/app-shell.store";
import { SidebarItem } from "./sidebar-item";
import { SidebarFooter } from "./sidebar-footer";
import styles from "./sidebar.module.css";

/**
 * Sidebar — the Demo `#rail` icon dock. Render-only.
 *
 * All navigation logic (config, active route, locale hrefs, permission/admin
 * filtering, label translation) lives in `useNavigation`. This component reads
 * the resulting groups and renders labels + items, and closes the mobile
 * drawer on click.
 */
export function Sidebar() {
  const t = useTranslations("Shell");
  const { groups, isActive, hrefFor } = useNavigation();
  const mobileSidebarOpen = useAppShellStore((s) => s.mobileSidebarOpen);
  const closeMobileSidebar = useAppShellStore((s) => s.closeMobileSidebar);

  const showAdminFooter = groups.length > 1;

  return (
    <nav
      id="app-sidebar"
      className={`${styles.rail} ${mobileSidebarOpen ? styles.railOpen : ""}`}
      aria-label={t("railLabel")}
    >
      <span className={styles.notch} aria-hidden="true" />

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

      {showAdminFooter && <SidebarFooter />}
    </nav>
  );
}