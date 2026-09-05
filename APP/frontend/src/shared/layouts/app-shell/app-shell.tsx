import type { ReactNode } from "react";
import { AppHeader } from "./header/app-header";
import { Sidebar } from "./sidebar/sidebar";
import { AppContent } from "./content/app-content";
import { DrawerScrim } from "./drawer-scrim";
import styles from "./app-shell.module.css";

/**
 * AppShell — the single protected application shell for every Diamond page.
 *
 * Layout structure only:
 *   header (Demo topbar) + sidebar (Demo rail) + main content
 *
 * It owns no API, no business logic, no page data. Pages receive everything
 * through {children}; auth/pages protection is handled by the Protected
 * Layout one level up. RTL/LTR placement is driven by logical CSS properties
 * together with the `dir` set on <html> by the locale layout.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <AppHeader />
      <Sidebar />
      <DrawerScrim />
      <AppContent>{children}</AppContent>
    </div>
  );
}