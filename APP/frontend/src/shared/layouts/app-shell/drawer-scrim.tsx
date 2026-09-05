"use client";

import { useAppShellStore } from "./store/app-shell.store";
import styles from "./app-shell.module.css";

/**
 * DrawerScrim — Demo `#scrimR` backdrop that appears behind the mobile
 * drawer (≤ 900px). Clicking it closes the drawer.
 */
export function DrawerScrim() {
  const mobileSidebarOpen = useAppShellStore((s) => s.mobileSidebarOpen);
  const closeMobileSidebar = useAppShellStore((s) => s.closeMobileSidebar);

  return (
    <div
      className={`${styles.scrim} ${mobileSidebarOpen ? "" : styles.scrimHidden}`}
      onClick={closeMobileSidebar}
      aria-hidden="true"
    />
  );
}