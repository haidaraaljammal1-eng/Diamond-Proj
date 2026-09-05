"use client";

import { useTranslations } from "next-intl";
import { useAuth } from "@/modules/auth";
import styles from "./dashboard-logout-button.module.css";

export function DashboardLogoutButton() {
  const t = useTranslations("Dashboard");
  const { logout, isLoggingOut } = useAuth();

  return (
    <button
      type="button"
      className={styles.logoutBtn}
      onClick={logout}
      disabled={isLoggingOut}
      aria-busy={isLoggingOut}
    >
      {isLoggingOut ? t("logoutBusy") : t("logout")}
    </button>
  );
}
