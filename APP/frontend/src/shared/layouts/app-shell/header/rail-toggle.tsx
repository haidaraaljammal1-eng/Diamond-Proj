"use client";

import { useTranslations } from "next-intl";
import {
  selectSidebarExpanded,
  useAppShellStore,
} from "../store/app-shell.store";
import styles from "./app-header.module.css";

/**
 * RailToggle — expands/collapses the rail (desktop preference, persisted).
 *
 * It lives in the header rather than in the rail head: pinned to the bar's
 * inline-start corner it keeps one screen position, while inside the rail it
 * moved with the rail edge on every toggle.
 *
 * Render + intent only: the state itself lives in the AppShell store, and the
 * geometry is driven entirely by CSS through `--rail-w`.
 */
export function RailToggle() {
  const t = useTranslations("Shell");
  const expanded = useAppShellStore(selectSidebarExpanded);
  const toggleExpanded = useAppShellStore((s) => s.toggleSidebarExpanded);
  const label = expanded ? t("railCollapse") : t("railExpand");

  return (
    <button
      type="button"
      className={styles.railToggle}
      onClick={toggleExpanded}
      aria-expanded={expanded}
      aria-controls="app-sidebar"
      aria-label={label}
      title={label}
    >
      <svg
        viewBox="0 0 24 24"
        className={styles.railToggleIcon}
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="16" rx="3.5" />
        <path d="M9.5 4v16" />
      </svg>
    </button>
  );
}
