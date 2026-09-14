"use client";

import { useTranslations } from "next-intl";
import type { WhatsAppConnectionBanner, WhatsAppConnectionDto } from "../../types/whatsapp.types";
import { connectionBanner } from "../../utils/whatsapp-view-model";
import styles from "./connection-banner.module.css";

export function WhatsAppConnectionBanner({
  connection,
  loading,
}: {
  connection: WhatsAppConnectionDto | null;
  loading: boolean;
}) {
  const t = useTranslations("WhatsApp");
  if (loading) return null;
  const kind: WhatsAppConnectionBanner = connectionBanner(connection);
  if (kind === "none") return null;
  const titleKey =
    kind === "qrRequired"
      ? "connection.qrRequired.title"
      : kind === "connecting"
        ? "connection.connecting.title"
        : kind === "retrying"
          ? "connection.retrying.title"
          : kind === "sessionDisconnected"
            ? "connection.sessionDisconnected.title"
            : kind === "standby"
              ? "connection.standby.title"
              : `connection.${kind}.title`;
  const bodyKey =
    kind === "qrRequired"
      ? "connection.qrRequired.body"
      : kind === "connecting"
        ? "connection.connecting.body"
        : kind === "retrying"
          ? "connection.retrying.body"
          : kind === "sessionDisconnected"
            ? "connection.sessionDisconnected.body"
            : kind === "standby"
              ? "connection.standby.body"
              : `connection.${kind}.body`;
  return (
    <aside className={styles.banner} data-kind={kind} data-testid="whatsapp-connection-banner" role="status">
      <p className={styles.title}>{t(titleKey)}</p>
      <p className={styles.copy}>{t(bodyKey)}</p>
    </aside>
  );
}

export function WhatsAppConnectionStatusLine({
  connection,
}: {
  connection: WhatsAppConnectionDto | null;
}) {
  const t = useTranslations("WhatsApp");
  if (!connection || connection.status === "DISCONNECTED") {
    return <span>{t("connection.status.disconnected")}</span>;
  }
  const parts = [t(`connection.status.${connection.status}`)];
  if (connection.status === "LINKED" || connection.status === "LINKING") {
    parts.push(t(`connection.webhook.${connection.webhookStatus}`));
  }
  return <span>{parts.join(" · ")}</span>;
}
