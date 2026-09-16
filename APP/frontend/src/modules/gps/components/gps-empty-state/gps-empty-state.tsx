"use client";

import { useTranslations } from "next-intl";
import styles from "./gps-empty-state.module.css";

export function GpsProviderBanner({ configured }: { configured: boolean }) {
  const t = useTranslations("Gps");
  if (configured) return null;
  return (
    <aside className={styles.banner} data-testid="gps-provider-banner" role="status">
      <p className={styles.title}>{t("provider.title")}</p>
      <p className={styles.copy}>{t("provider.body")}</p>
    </aside>
  );
}
