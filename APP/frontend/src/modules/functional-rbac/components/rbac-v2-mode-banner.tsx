"use client";

import { useTranslations } from "next-intl";
import { isFunctionalRbacV2ModeMismatch } from "../feature-flag";
import styles from "./rbac-v2-mode-banner.module.css";

export function RbacV2ModeBanner() {
  const t = useTranslations("FunctionalRbac");
  const mismatch = isFunctionalRbacV2ModeMismatch();

  if (!mismatch) return null;

  return (
    <div
      className={styles.warn}
      role="alert"
      data-testid="rbac-v2-mode-banner"
      data-rbac-v2-mode="mismatch"
    >
      {t("modeBanner.mismatch")}
    </div>
  );
}
