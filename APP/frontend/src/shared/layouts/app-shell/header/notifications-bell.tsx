"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import styles from "./app-header.module.css";

/**
 * NotificationsBell — design-only notification center.
 *
 * DESIGN PLACEHOLDER: there is no notifications Backend endpoint yet (only
 * `dashboard.read` exists today — see `navigation.config.ts`), so the list
 * below is static mock content, not a live feed, and "mark all as read" is
 * inert. This exists to carry the visual system (panel, unread badge, row
 * layout) so a real feed can be dropped in without a redesign.
 */
const MOCK_UNREAD_COUNT = 3;
const MOCK_ITEMS = [
  { key: "1" as const, titleKey: "notificationItem1Title", timeKey: "notificationItem1Time" },
  { key: "2" as const, titleKey: "notificationItem2Title", timeKey: "notificationItem2Time" },
  { key: "3" as const, titleKey: "notificationItem3Title", timeKey: "notificationItem3Time" },
];

export function NotificationsBell() {
  const t = useTranslations("Shell");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  /* Outside click + Escape close the panel, same contract as the mobile
     drawer and the locale select. */
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.notifications} ref={rootRef}>
      <button
        type="button"
        className={styles.notifBell}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t("notificationsLabel")}
        title={t("notificationsLabel")}
      >
        <svg viewBox="0 0 24 24" className={styles.notifBellIcon} aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
        {MOCK_UNREAD_COUNT > 0 && (
          <span className={styles.notifBadge}>{MOCK_UNREAD_COUNT}</span>
        )}
      </button>

      {open && (
        <div className={styles.notifPanel} role="menu">
          <div className={styles.notifPanelHead}>
            <b>{t("notificationsLabel")}</b>
            <span
              className={styles.notifMarkRead}
              title={t("navigationActionNote")}
            >
              {t("notificationsMarkAllRead")}
            </span>
          </div>

          <div className={styles.notifList}>
            {MOCK_ITEMS.length === 0 ? (
              <p className={styles.notifEmpty}>{t("notificationsEmpty")}</p>
            ) : (
              MOCK_ITEMS.map((item) => (
                <div
                  key={item.key}
                  className={styles.notifRow}
                  role="menuitem"
                  title={t("navigationActionNote")}
                >
                  <span className={styles.notifDot} aria-hidden="true" />
                  <span className={styles.notifRowBody}>
                    <span className={styles.notifRowTitle}>
                      {t(item.titleKey)}
                    </span>
                    <span className={styles.notifRowTime}>
                      {t(item.timeKey)}
                    </span>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
