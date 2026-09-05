"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { BrandLogo } from "@/shared/components/ui/brand-logo";
import styles from "./sidebar.module.css";

interface SidebarBrandProps {
  /** Locale-aware home href, resolved by the caller through `useNavigation`. */
  href: string;
  onNavigate: () => void;
}

/**
 * SidebarBrand — the Diamond identity at the head of the rail.
 *
 * The crystal mark is always rendered; the wordmark is revealed by CSS only in
 * the expanded rail, because 98px cannot hold it. That split is what lets the
 * brand live here instead of in the header without disappearing on collapse.
 */
export function SidebarBrand({ href, onNavigate }: SidebarBrandProps) {
  const t = useTranslations("Shell");

  return (
    <Link
      href={href}
      className={styles.head}
      onClick={onNavigate}
      title={t("brand")}
    >
      <BrandLogo className={styles.brandMark} />
      <span className={styles.wordmark}>
        <b>{t("brand")}</b>
        <span>{t("brandSub")}</span>
      </span>
    </Link>
  );
}
