"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Popover } from "@/shared/components/ui/popover";
import { Button } from "@/shared/components/ui/button";
import { useNotificationsInbox } from "@/modules/notifications/hooks/use-notifications-inbox";
import type { NotificationsInboxFilter } from "@/modules/notifications/types/notifications.types";
import styles from "./app-header.module.css";

const INBOX_FILTERS: NotificationsInboxFilter[] = ["UNREAD", "ALL"];

function relativeTime(createdAt: string, locale: string): string {
  const elapsedMinutes = Math.max(0, Math.round((Date.now() - Date.parse(createdAt)) / 60_000));
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (elapsedMinutes < 60) return formatter.format(-elapsedMinutes, "minute");
  const hours = Math.round(elapsedMinutes / 60);
  if (hours < 24) return formatter.format(-hours, "hour");
  return formatter.format(-Math.round(hours / 24), "day");
}

export function NotificationsBell() {
  const t = useTranslations("Shell");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const {
    canRead,
    notifications,
    filter,
    unreadCount,
    setFilter,
    markRead,
    markAllRead,
    refresh,
  } = useNotificationsInbox();

  const filterLabel = (item: NotificationsInboxFilter) => {
    if (item === "UNREAD") return t("notificationFilters.unread", { count: unreadCount });
    return t("notificationFilters.all");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && canRead) void refresh();
      }}
      align="end"
      maxHeight={640}
      panelWidth={460}
      className={styles.notifications}
      panelClassName={styles.notificationPopover}
      trigger={({ ref, id, "aria-expanded": ariaExpanded, "aria-controls": ariaControls, onClick, onKeyDown }) => (
        <button
          ref={ref}
          id={id}
          type="button"
          className={styles.notifBell}
          onClick={onClick}
          onKeyDown={onKeyDown}
          aria-haspopup="dialog"
          aria-expanded={ariaExpanded}
          aria-controls={ariaControls}
          aria-label={t("notificationsLabel")}
          title={t("notificationsLabel")}
        >
          <svg viewBox="0 0 24 24" className={styles.notifBellIcon} aria-hidden="true">
            <path d="M6 8a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5z" />
            <path d="M10 19a2 2 0 0 0 4 0" />
          </svg>
          {unreadCount > 0 && <span className={styles.notifBadge}>{unreadCount}</span>}
        </button>
      )}
    >
      <section className={styles.notificationCenter} aria-label={t("notificationsLabel")}>
        <header className={styles.notifPanelHead}>
          <div>
            <b>{t("notificationsLabel")}</b>
            <span className={styles.notificationSummary}>{t("notificationSummary", { count: unreadCount })}</span>
          </div>
          {unreadCount > 0 && (
            <Button type="button" variant="secondary" size="sm" onClick={() => void markAllRead()}>
              {t("notificationsMarkAllRead")}
            </Button>
          )}
        </header>

        {canRead ? (
          <>
            <div className={styles.notificationFilters} role="group" aria-label={t("notificationFilters.label")}>
              {INBOX_FILTERS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={styles.notificationFilter}
                  data-active={filter === item || undefined}
                  aria-pressed={filter === item}
                  onClick={() => setFilter(item)}
                >
                  {filterLabel(item)}
                </button>
              ))}
            </div>

            <div className={styles.notifList} role="list">
              {notifications.length === 0 ? (
                <p className={styles.notifEmpty}>{t("notificationsEmpty")}</p>
              ) : (
                notifications.map((item) => {
                  const unread = item.readAt == null;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={styles.notifRow}
                      data-unread={unread || undefined}
                      role="listitem"
                      onClick={() => {
                        if (unread) void markRead(item.id);
                      }}
                    >
                      <span className={styles.notifRowBody}>
                        <span className={styles.notifRowTitle}>{item.title}</span>
                        <span className={styles.notifRowDescription}>{item.body}</span>
                        <span className={styles.notifRowTime}>{relativeTime(item.createdAt, locale)}</span>
                      </span>
                      {unread && <span className={styles.notifDot} aria-label={t("notificationUnread")} />}
                    </button>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <div className={styles.notifList}>
            <p className={styles.notifEmpty}>{t("notificationsEmpty")}</p>
          </div>
        )}
      </section>
    </Popover>
  );
}
