"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { NAVIGATION_ICONS, type NavigationItem } from "@/modules/navigation";
import styles from "./sidebar.module.css";

interface SidebarItemProps {
  item: NavigationItem;
  active: boolean;
  /** Final locale-aware href for `link` items. */
  hrefFor: string;
  onNavigate: () => void;
  /** Pre-translated label from the navigation hook. */
  label: string;
}

/**
 * SidebarItem — the Demo `.navit` rail button.
 *
 * Renders icon, label, demo decorative corner diamond, and demo badge.
 * `link` items use Next.js navigation (locale preserved); `action` items
 * (Demo WhatsApp dock) are rendered as disabled placeholders until their
 * feature is implemented in a later phase.
 *
 * This component is render-only. Labels are supplied by `useNavigation`.
 */
export function SidebarItem({
  item,
  active,
  hrefFor,
  onNavigate,
  label,
}: SidebarItemProps) {
  const t = useTranslations("Shell");
  const Icon = NAVIGATION_ICONS[item.icon];
  const className = `${styles.item} ${active ? styles.itemActive : ""}`;
  const icon = <Icon className={styles.itemIcon} aria-hidden="true" />;

  const badge =
    typeof item.badge === "number" && item.badge > 0 ? (
      <span className={styles.badge}>{item.badge}</span>
    ) : null;

  const corner = (
    <span
      className={`${styles.dia} ${active ? styles.diaActive : ""}`}
      aria-hidden="true"
    />
  );

  const content = (
    <>
      {icon}
      <span className={styles.itemLabel}>{label}</span>
      {corner}
      {badge}
    </>
  );

  if (item.type === "action") {
    return (
      <button
        type="button"
        className={className}
        data-nav={item.key}
        aria-disabled="true"
        title={t("navigationActionNote")}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={hrefFor}
      className={className}
      data-nav={item.key}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={label}
    >
      {content}
    </Link>
  );
}