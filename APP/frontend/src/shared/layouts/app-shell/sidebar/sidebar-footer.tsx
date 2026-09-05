"use client";

import { useTranslations } from "next-intl";
import styles from "./sidebar.module.css";

/**
 * SidebarFooter — the Demo `.railfoot` (admin only).
 */
export function SidebarFooter() {
  const t = useTranslations("Shell");
  return (
    <div className={styles.footer}>
      <b>{t("railFooterVersion")}</b>
      <p>{t.rich("railFooterCopy", { br: () => <br /> })}</p>
    </div>
  );
}