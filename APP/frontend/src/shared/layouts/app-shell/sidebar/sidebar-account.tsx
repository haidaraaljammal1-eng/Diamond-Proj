"use client";

import { useTranslations } from "next-intl";
import { useAuth } from "@/modules/auth";
import styles from "./sidebar.module.css";

/**
 * SidebarAccount — the account row pinned to the rail's bottom edge.
 *
 * Real session data only (name, role, live auth status) — no invented metric
 * sits next to it. The logout control is revealed on hover/focus rather than
 * shown at rest, so the collapsed dock and the expanded rail share one row
 * instead of needing two layouts.
 */
export function SidebarAccount() {
  const t = useTranslations("Shell");
  const { user, logout, isLoggingOut } = useAuth();

  const isAdmin = user?.roles?.includes("system_admin") === true;
  const displayName = user?.name?.trim() || "Diamond";
  const initial = (user?.name?.trim()?.[0] ?? "D").toUpperCase();

  return (
    <div className={styles.account}>
      <span className={styles.accountAvatar} aria-hidden="true">
        {initial}
        <span className={styles.accountStatus} title={t("onlineStatus")} />
      </span>

      <span className={styles.accountName}>
        <b>{displayName}</b>
        <span>{isAdmin ? t("userRoleOwner") : t("userRoleEmployee")}</span>
      </span>

      <button
        type="button"
        className={styles.accountLogout}
        onClick={logout}
        disabled={isLoggingOut}
        aria-busy={isLoggingOut}
        aria-label={isLoggingOut ? t("logoutBusy") : t("logout")}
        title={isLoggingOut ? t("logoutBusy") : t("logout")}
      >
        <svg
          viewBox="0 0 24 24"
          className={styles.accountLogoutIcon}
          aria-hidden="true"
        >
          <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
          <path d="M10 17l5-5-5-5M15 12H3" />
        </svg>
      </button>
    </div>
  );
}
