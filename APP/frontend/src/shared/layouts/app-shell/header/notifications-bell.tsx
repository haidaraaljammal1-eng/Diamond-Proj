"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Popover } from "@/shared/components/ui/popover";
import { Button } from "@/shared/components/ui/button";
import { sendDesktopNotification } from "@/modules/notifications/simulation/desktop-notification";
import {
  NOTIFICATION_FILTERS,
  type NotificationCategory,
  type NotificationFilter,
} from "@/modules/notifications/simulation/notifications-simulation.fixture";
import { useNotificationsSimulation } from "@/modules/notifications/simulation/use-notifications-simulation";
import styles from "./app-header.module.css";

type DesktopFeedback = "sent" | "denied" | "unsupported" | "error" | null;

function CategoryIcon({ category }: { category: NotificationCategory }) {
  return (
    <span className={styles.notificationCategoryIcon} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {category === "CONTRACTS" && (
          <>
            <path d="M7 3.5h7l3 3V20.5H7z" />
            <path d="M14 3.5v4h4M10 12h4M10 15h4" />
          </>
        )}
        {category === "HANDOVER_RETURN" && (
          <>
            <path d="M4 8h14M14 5l4 3-4 3M20 16H6M10 13l-4 3 4 3" />
          </>
        )}
        {category === "VEHICLES" && (
          <>
            <path d="m5 16 1.4-5h11.2l1.4 5" />
            <path d="M7.5 11 9 7.5h6l1.5 3.5M4.5 16h15v3h-2v-1.5h-11V19h-2z" />
            <path d="M8 15h.01M16 15h.01" />
          </>
        )}
        {category === "VIOLATIONS" && (
          <>
            <path d="m12 4 8 15H4z" />
            <path d="M12 9v4M12 16h.01" />
          </>
        )}
      </svg>
    </span>
  );
}

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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [desktopFeedback, setDesktopFeedback] = useState<DesktopFeedback>(null);
  const {
    enabled,
    notifications,
    filter,
    unreadCount,
    setFilter,
    markRead,
    markAllRead,
  } = useNotificationsSimulation();

  const sendDesktopDemo = async () => {
    setDesktopFeedback(
      await sendDesktopNotification({
        title: t("desktopDemo.title"),
        body: t("desktopDemo.body", { count: unreadCount }),
        tag: "diamond-demo-summary",
      }),
    );
  };

  const filterLabel = (item: NotificationFilter) => {
    if (item === "UNREAD") return t("notificationFilters.unread", { count: unreadCount });
    if (item === "ALL") return t("notificationFilters.all");
    return t(`notificationFilters.${item === "HANDOVER_RETURN" ? "handoverReturn" : item.toLowerCase()}`);
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
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
            <Button type="button" variant="secondary" size="sm" onClick={markAllRead}>
              {t("notificationsMarkAllRead")}
            </Button>
          )}
        </header>

        <div className={styles.notificationFilters} role="group" aria-label={t("notificationFilters.label")}>
          {NOTIFICATION_FILTERS.map((item) => (
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
            notifications.map((item) => (
              <button
                key={item.id}
                type="button"
                className={styles.notifRow}
                data-unread={!item.read || undefined}
                role="listitem"
                onClick={() => {
                  markRead(item.id);
                  setOpen(false);
                  router.push(
                    `/${locale}${item.actionTarget.route}?focus=${encodeURIComponent(item.actionTarget.entityId)}`,
                  );
                }}
              >
                <CategoryIcon category={item.category} />
                <span className={styles.notifRowBody}>
                  <span className={styles.notifRowTitle}>{t(item.titleKey, item.titleValues)}</span>
                  <span className={styles.notifRowDescription}>{t(item.descriptionKey, item.descriptionValues)}</span>
                  <span className={styles.notifRowTime}>{relativeTime(item.createdAt, locale)}</span>
                </span>
                {!item.read && <span className={styles.notifDot} aria-label={t("notificationUnread")} />}
              </button>
            ))
          )}
        </div>

        {enabled && (
          <footer className={styles.notificationDemoFooter}>
            <Button type="button" variant="secondary" size="sm" className={styles.desktopDemoButton} onClick={() => void sendDesktopDemo()}>
              {t("desktopDemo.action")}
            </Button>
            {desktopFeedback && (
              <p className={styles.desktopDemoFeedback} role="status">
                {t(`desktopDemo.feedback.${desktopFeedback}`)}
              </p>
            )}
          </footer>
        )}
      </section>
    </Popover>
  );
}
