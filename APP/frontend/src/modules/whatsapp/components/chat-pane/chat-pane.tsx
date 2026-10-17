"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Icon } from "@/shared/components/ui/icon";
import type {
  WhatsAppConversationDetailDto,
  WhatsAppConversationListItemDto,
  WhatsAppMessageDto,
} from "../../types/whatsapp.types";
import { observeIncomingMedia } from "../../utils/whatsapp-local-save";
import { conversationTitle, formatCustomerWaId } from "../../utils/whatsapp-view-model";
import { WhatsAppContactAvatar } from "../contact-avatar/contact-avatar";
import { WhatsAppComposer } from "../composer/composer";
import { WhatsAppCustomerControls } from "../customer-strip/customer-strip";
import { WhatsAppCustomerContextPanel } from "../customer-context-panel/customer-context-panel";
import { WhatsAppMessageBubble } from "../message-bubble/message-bubble";
import styles from "./chat-pane.module.css";

export function WhatsAppChatPane({
  conversation,
  messages,
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
  loading: boolean;
  error: string | null;
  hasOlder: boolean;
  markReadError: string | null;
  onBack: () => void;
  onLoadOlder: () => Promise<void>;
  onRetry: () => void;
}) {
  const t = useTranslations("WhatsApp");
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const pendingScrollRestore = useRef<number | null>(null);
  const conversationId = conversation?.id ?? null;
  const [contextOpen, setContextOpen] = useState(false);

  useEffect(() => {
    if (!conversationId) return;
    observeIncomingMedia(conversationId, messages, conversation?.customerWaId ?? null);
  }, [conversationId, messages, conversation?.customerWaId]);

  useLayoutEffect(() => {
    stickToBottom.current = true;
    pendingScrollRestore.current = null;
    setContextOpen(false);
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

  const title = conversationTitle(
    conversation.customerDisplayName,
    conversation.customerWaId,
    conversation.displayTitle,
  );
  const customerNumber = formatCustomerWaId(conversation.customerWaId);

  async function loadOlder() {
    pendingScrollRestore.current = scroller.current?.scrollHeight ?? 0;
    stickToBottom.current = false;
    await onLoadOlder();
  }

  return (
    <section className={styles.pane} data-testid="whatsapp-chat-pane">
      <header className={styles.header}>
        <WhatsAppContactAvatar
          conversationId={conversation.id}
          hasAvatar={conversation.hasAvatar}
          fallbackLabel={title}
          className={styles.avatar}
        />
        <div className={styles.heading}>
          <div className={styles.titleRow}>
            <p className={styles.name}>{title}</p>
            {"customerLink" in conversation && conversation.customerLink.linked ? (
              <WhatsAppCustomerContextPanel
                conversation={conversation}
                open={contextOpen}
                onToggle={() => setContextOpen((value) => !value)}
              />
            ) : null}
          </div>
          {customerNumber ? (
            <p className={styles.sub}>
              <span dir="ltr">{customerNumber}</span>
            </p>
          ) : null}
        </div>
        <WhatsAppCustomerControls conversation={conversation} layout="header" />
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

      {markReadError ? (
        <p className={styles.inlineError} role="status">
          {markReadError}
        </p>
      ) : null}

      <div
        className={styles.msgs}
        ref={scroller}
        data-testid="whatsapp-messages"
        onScroll={() => {
          const node = scroller.current;
          if (!node) return;
          const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
          stickToBottom.current = distanceFromBottom < 96;
        }}
      >
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
