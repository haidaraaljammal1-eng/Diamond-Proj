"use client";

import { useTranslations } from "next-intl";
import styles from "./sidebar.module.css";

/**
 * SidebarQuickAction — the rail's single primary action.
 *
 * The Diamond app ships only `/dashboard` today, so `/contracts/new` does not
 * exist yet: the button is rendered as a disabled placeholder, exactly like the
 * `action` navigation items, and is wired to the route once that page lands.
 * The label is revealed by CSS only in the expanded rail.
 */
export function SidebarQuickAction() {
  const t = useTranslations("Shell");

  return (
    <button
      type="button"
      className={styles.cta}
      aria-disabled="true"
      title={`${t("quickAction")} — ${t("navigationActionNote")}`}
    >
      <svg viewBox="0 0 24 24" className={styles.ctaIcon} aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
      <span className={styles.ctaLabel}>{t("quickAction")}</span>
    </button>
  );
}
