import { getTranslations, setRequestLocale } from "next-intl/server";
import { DashboardLogoutButton } from "./dashboard-logout-button";
import styles from "./dashboard.module.css";

/**
 * Dashboard — minimal placeholder ONLY, to exercise the AppShell.
 * The real Dashboard (KPIs, fleet, contracts, finance, …) is a separate
 * phase built from the Demo. Delete this file's body when that phase lands.
 */
export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Dashboard");

  return (
    <div className={styles.placeholder} data-testid="dashboard-placeholder">
      <p>{t("placeholder")}</p>
      <DashboardLogoutButton />
    </div>
  );
}