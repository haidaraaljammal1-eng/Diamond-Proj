"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { BrandLogo } from "@/shared/components/ui/brand-logo";
import { useAuth } from "@/modules/auth";
import { useAppShellStore } from "../store/app-shell.store";
import styles from "./app-header.module.css";

/**
 * AppHeader — the Demo `#topbar` floating glass capsule.
 *
 * Renders exactly the controls present in the Demo topbar:
 * burger (mobile), brand wordmark, role segment (bound to the session user),
 * user chip, and the language toggle.
 *
 * The role segment mirrors the Demo control but is bound to the authenticated
 * user's actual access (Backend `system_admin`). Switching roles is a Demo
 * fixture behavior; the real system derives access from the session, so the
 * control is display-only (never faked in the shell).
 */
export function AppHeader() {
  const t = useTranslations("Shell");
  const locale = useLocale();
  const pathname = usePathname();
  const { user } = useAuth();
  const mobileSidebarOpen = useAppShellStore((s) => s.mobileSidebarOpen);
  const toggleMobileSidebar = useAppShellStore((s) => s.toggleSidebar);

  const isAdmin = user?.roles?.includes("system_admin") === true;
  const displayName = user?.name?.trim() || "Diamond";
  const initial = (user?.name?.trim()?.[0] ?? "D").toUpperCase();

  const otherLocale = locale === "ar" ? "en" : "ar";
  const rest = pathname.replace(/^\/(ar|en)(?=\/|$)/, "") || "/";
  const localeHref = `/${otherLocale}${rest === "/" ? "" : rest}`;

  return (
    <header className={styles.topbar}>
      <button
        type="button"
        className={styles.burger}
        onClick={toggleMobileSidebar}
        aria-label={mobileSidebarOpen ? t("closeMenu") : t("openMenu")}
        aria-expanded={mobileSidebarOpen}
        aria-controls="app-sidebar"
      >
        ☰
      </button>

      <div className={styles.brand}>
        <BrandLogo className={styles.brandMark} />
        <div className={styles.wordmark}>
          <b>{t("brand")}</b>
          <span>{t("brandSub")}</span>
        </div>
      </div>

      <div className={styles.separator} aria-hidden="true" />

      <div className={styles.roleSeg} role="group" aria-label={t("roleSwitch")}>
        <button
          type="button"
          className={`${styles.roleBtn} ${isAdmin ? styles.roleBtnOn : ""}`}
          aria-pressed={isAdmin}
          aria-disabled="true"
          tabIndex={-1}
        >
          <span className={styles.rdot} aria-hidden="true" />
          <span className={styles.roleTxt}>{t("roleOwner")}</span>
          <span className={styles.roleTxtMobile}>{t("roleOwnerShort")}</span>
        </button>
        <button
          type="button"
          className={`${styles.roleBtn} ${isAdmin ? "" : styles.roleBtnOn}`}
          aria-pressed={!isAdmin}
          aria-disabled="true"
          tabIndex={-1}
        >
          <span className={styles.rdot} aria-hidden="true" />
          <span className={styles.roleTxt}>{t("roleEmployee")}</span>
          <span className={styles.roleTxtMobile}>
            {t("roleEmployeeShort")}
          </span>
        </button>
      </div>

      <div className={styles.spacer} />

      <div className={styles.meChip} title={t("avatarLabel")}>
        <div className={styles.meName}>
          <b>{displayName}</b>
          <span>{isAdmin ? t("userRoleOwner") : t("userRoleEmployee")}</span>
        </div>
        <span className={styles.avatar} aria-hidden="true">
          {initial}
        </span>
      </div>

      <Link
        href={localeHref}
        className={styles.langBtn}
        title={t("langTitle")}
      >
        <svg viewBox="0 0 24 24" className={styles.langIcon} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.5 3.5 6 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-6-3.5-9s1-6.5 3.5-9z" />
        </svg>
        <span>{t("langNext")}</span>
      </Link>
    </header>
  );
}