"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useNavigation } from "@/modules/navigation";
import styles from "./app-header.module.css";

/**
 * AppBreadcrumb — the page trail in the header.
 *
 * The trail is derived from the navigation config, not stored: the active item
 * is whatever `useNavigation` matches against the URL, so a page can never show
 * a crumb that disagrees with the rail. Pages outside the config (or the locale
 * root) render the home crumb alone rather than an invented label.
 */
export function AppBreadcrumb() {
  const t = useTranslations("Shell");
  const { groups, isActive, hrefFor } = useNavigation();

  const current = groups
    .flatMap((group) => group.items)
    .find((item) => isActive(item.href));

  return (
    <nav className={styles.crumbs} aria-label={t("breadcrumbLabel")}>
      <Link href={hrefFor("/dashboard")} className={styles.crumbLink}>
        <svg viewBox="0 0 24 24" className={styles.crumbIcon} aria-hidden="true">
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5.5 9.5V20h13V9.5" />
        </svg>
        {t("breadcrumbHome")}
      </Link>

      {current && (
        <>
          <span className={styles.crumbSep} aria-hidden="true" />
          <span className={styles.crumbCurrent} aria-current="page">
            {current.label}
          </span>
        </>
      )}
    </nav>
  );
}
