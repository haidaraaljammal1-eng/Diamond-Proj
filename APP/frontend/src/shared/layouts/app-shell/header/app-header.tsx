"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { BrandLogo } from "@/shared/components/ui/brand-logo";
import { Select, type SelectOption } from "@/shared/components/ui/select";
import { useAuth } from "@/modules/auth";
import { useAppShellStore } from "../store/app-shell.store";
import { AppBreadcrumb } from "./app-breadcrumb";
import { RailToggle } from "./rail-toggle";
import { NotificationsBell } from "./notifications-bell";
import styles from "./app-header.module.css";

const LOCALES: SelectOption[] = [
  { value: "ar", label: "العربية" },
  { value: "en", label: "English" },
];

const GlobeIcon = (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.5 3.5 6 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-6-3.5-9s1-6.5 3.5-9z" />
  </svg>
);

/**
 * AppHeader — the Demo `#topbar` floating glass capsule, sized to the content
 * area beside the rail rather than to the viewport.
 *
 * Three-column grid, not flex: the start group (rail controls, notifications,
 * user chip, locale select) and end group (breadcrumb) sit in two equal
 * `1fr` tracks, so search — the middle, `auto`-sized column — is centered in
 * the bar itself regardless of how long the breadcrumb or the end group get.
 * Both side groups carry `min-width: 0`, so they yield (the breadcrumb
 * truncates) instead of forcing the tracks uneven and pulling search off
 * center.
 *
 * The brand is NOT here — it heads the rail — except below the drawer
 * breakpoint, where the rail is off-screen and the mark returns to the bar.
 *
 * Search is shell-level UI: it has no backend endpoint yet, so submitting is
 * inert. The locale select swaps the `/[locale]` path segment on change.
 * The notification list is a design-only mock — see `notifications-bell.tsx`.
 */
export function AppHeader() {
  const t = useTranslations("Shell");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const mobileSidebarOpen = useAppShellStore((s) => s.mobileSidebarOpen);
  const toggleMobileSidebar = useAppShellStore((s) => s.toggleSidebar);
  const [query, setQuery] = useState("");

  const isAdmin = user?.roles?.includes("system_admin") === true;
  const displayName = user?.name?.trim() || "Diamond";
  const initial = (user?.name?.trim()?.[0] ?? "D").toUpperCase();

  const rest = pathname.replace(/^\/(ar|en)(?=\/|$)/, "") || "/";

  function handleLocaleChange(next: string) {
    if (next === locale) return;
    router.push(`/${next}${rest === "/" ? "" : rest}`);
  }

  return (
    <header className={styles.topbar}>
      <div className={styles.startGroup}>
        {/* Two controls in this bar target the rail; the drawer burger is
            marked so Escape can return focus to it specifically. */}
        <button
          type="button"
          className={styles.burger}
          data-shell-control="drawer"
          onClick={toggleMobileSidebar}
          aria-label={mobileSidebarOpen ? t("closeMenu") : t("openMenu")}
          aria-expanded={mobileSidebarOpen}
          aria-controls="app-sidebar"
        >
          ☰
        </button>

        <RailToggle />

        <BrandLogo className={styles.mobileMark} />

        <div className={styles.separator} aria-hidden="true" />

        <NotificationsBell />

        <div className={styles.meChip} title={t("avatarLabel")}>
          <div className={styles.meName}>
            <b>{displayName}</b>
            <span>{isAdmin ? t("userRoleOwner") : t("userRoleEmployee")}</span>
          </div>
          <span className={styles.avatar} aria-hidden="true">
            {initial}
          </span>
        </div>

        <Select
          variant="ghost"
          size="sm"
          icon={GlobeIcon}
          options={LOCALES}
          value={locale}
          onChange={handleLocaleChange}
          aria-label={t("langTitle")}
        />
      </div>

      <form
        className={styles.search}
        role="search"
        onSubmit={(e) => e.preventDefault()}
      >
        <svg
          viewBox="0 0 24 24"
          className={styles.searchIcon}
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.6-3.6" />
        </svg>
        <input
          type="search"
          className={styles.searchInput}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
        />
      </form>

      <div className={styles.endGroup}>
        <AppBreadcrumb />
      </div>
    </header>
  );
}
