"use client";

import { useLayoutEffect, useRef } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Icon } from "@/shared/components/ui/icon";
import type {
  WhatsAppConnectionDto,
  WhatsAppConversationDetailDto,
  WhatsAppConversationListItemDto,
  WhatsAppMessageDto,
} from "../../types/whatsapp.types";
import { conversationEligibility, conversationTitle, formatCustomerWaId, toValidDate } from "../../utils/whatsapp-view-model";
import { WhatsAppComposer } from "../composer/composer";
import { WhatsAppConnectionStatusLine } from "../connection-banner/connection-banner";
import { WhatsAppCustomerStrip } from "../customer-strip/customer-strip";
import { WhatsAppMessageBubble } from "../message-bubble/message-bubble";
import styles from "./chat-pane.module.css";

export function WhatsAppChatPane({
  conversation,
  messages,
  connection,
  loading,
  error,
  hasOlder,
  markReadError,
  onBack,
  onLoadOlder,
  onRetry,
}: {
  conversation: WhatsAppConversationDetailDto | WhatsAppConversationListItemDto | null;
  messages: WhatsAppMessageDto[];
  connection: WhatsAppConnectionDto | null;
  loading: boolean;
  error: string | null;
  hasOlder: boolean;
  markReadError: string | null;
  onBack: () => void;
  onLoadOlder: () => Promise<void>;
  onRetry: () => void;
}) {
  const t = useTranslations("WhatsApp");
  const format = useFormatter();
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const pendingScrollRestore = useRef<number | null>(null);
  const conversationId = conversation?.id ?? null;

  useLayoutEffect(() => {
    stickToBottom.current = true;
    pendingScrollRestore.current = null;
  }, [conversationId]);

  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const restoreFrom = pendingScrollRestore.current;
    if (restoreFrom != null) {
      node.scrollTop = node.scrollHeight - restoreFrom;
      pendingScrollRestore.current = null;
      return;
    }
    if (stickToBottom.current) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages, conversationId]);

  if (!conversation) {
    return (
      <section className={styles.pane} data-testid="whatsapp-chat-empty">
        <div className={styles.unselected}>
          <div className={styles.unselectedIcon} aria-hidden="true">
            <Icon name="mdi:email-outline" size={22} />
          </div>
          <p className={styles.unselectedTitle}>{t("chat.selectTitle")}</p>
          <p>{t("chat.selectBody")}</p>
        </div>
      </section>
    );
  }

  const title = conversationTitle(conversation.customerDisplayName, conversation.customerWaId);
  const office =
    conversation.connection.verifiedName || conversation.connection.displayPhoneNumber;
  const eligibility = conversationEligibility(conversation);
  const windowUntil = toValidDate(eligibility?.windowExpiresAt);

  async function loadOlder() {
    pendingScrollRestore.current = scroller.current?.scrollHeight ?? 0;
    stickToBottom.current = false;
    await onLoadOlder();
  }

  return (
    <section className={styles.pane} data-testid="whatsapp-chat-pane">
      <header className={styles.header}>
        <span className={styles.avatar} aria-hidden="true">
          {title.trim().charAt(0) || "#"}
        </span>
        <div className={styles.heading}>
          <p className={styles.name}>{title}</p>
          <p className={styles.sub}>
            <span dir="ltr">{formatCustomerWaId(conversation.customerWaId)}</span>
            {office ? (
              <>
                <span aria-hidden="true"> · </span>
                <span>{office}</span>
              </>
            ) : null}
            <span aria-hidden="true"> · </span>
            <WhatsAppConnectionStatusLine connection={connection} />
            {eligibility?.canSendText && windowUntil ? (
              <>
                <span aria-hidden="true"> · </span>
                <span>
                  {t("window.openUntil", {
                    time: format.dateTime(windowUntil, { hour: "numeric", minute: "2-digit" }),
                  })}
                </span>
              </>
            ) : null}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={styles.back}
          onClick={onBack}
        >
          {t("chat.back")}
        </Button>
      </header>
      <WhatsAppCustomerStrip conversation={conversation} />

      {markReadError ? (
        <p className={styles.inlineError} role="status">
          {markReadError}
        </p>
      ) : null}

      <div className={styles.msgs} ref={scroller} data-testid="whatsapp-messages">
        {hasOlder ? (
          <div className={styles.older}>
            <Button type="button" variant="secondary" size="sm" onClick={() => void loadOlder()}>
              {t("chat.loadOlder")}
            </Button>
          </div>
        ) : null}

        {error ? (
          <div className={styles.state} role="alert">
            <p>{error}</p>
            <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
              {t("retry")}
            </Button>
          </div>
        ) : null}

        {loading && messages.length === 0 ? (
          <div className={styles.skeleton} aria-label={t("chat.loading")} />
        ) : null}

        {messages.map((message) => (
          <WhatsAppMessageBubble key={message.id} message={message} />
        ))}
      </div>

      <WhatsAppComposer />
    </section>
  );
}
