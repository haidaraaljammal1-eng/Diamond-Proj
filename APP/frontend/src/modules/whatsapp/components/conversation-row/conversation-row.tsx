"use client";

import type { KeyboardEvent } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import type { WhatsAppConversationListItemDto } from "../../types/whatsapp.types";
import {
  conversationTitle,
  formatCustomerWaId,
  lastMessagePreviewKind,
  toValidDate,
  unreadBadgeLabel,
} from "../../utils/whatsapp-view-model";
import styles from "./conversation-row.module.css";

export function WhatsAppConversationRow({
  conversation,
  selected,
  onSelect,
}: {
  conversation: WhatsAppConversationListItemDto;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("WhatsApp");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const title = conversationTitle(conversation.customerDisplayName, conversation.customerWaId);
  const preview = lastMessagePreviewKind(conversation.lastMessagePreview, conversation.lastMessageType);
  const previewText =
    preview.kind === "text" ? preview.text : t(`messageType.${preview.kind}`);
  const when = toValidDate(conversation.lastMessageAt);
  const unread = unreadBadgeLabel(conversation.unreadCount);
  const initial = title.trim().charAt(0) || "#";

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(conversation.id);
    }
  }

  return (
    <button
      type="button"
      className={[styles.row, selected ? styles.selected : ""].filter(Boolean).join(" ")}
      onClick={() => onSelect(conversation.id)}
      onKeyDown={onKeyDown}
      aria-pressed={selected}
      data-testid="whatsapp-conversation-row"
      data-conversation-id={conversation.id}
    >
      <span className={styles.avatar} aria-hidden="true">
        {initial}
      </span>
      <span className={styles.body}>
        <span className={styles.top}>
          <span className={styles.name}>{title}</span>
          {when ? (
            <time className={styles.time} dateTime={when.toISOString()}>
              {format.relativeTime(when, now)}
            </time>
          ) : null}
        </span>
        <span className={styles.preview}>{previewText}</span>
        <span className={styles.wa} dir="ltr">
          {formatCustomerWaId(conversation.customerWaId)}
        </span>
      </span>
      {unread ? (
        <span className={styles.unread} data-testid="whatsapp-unread-badge">
          {unread}
        </span>
      ) : null}
    </button>
  );
}
