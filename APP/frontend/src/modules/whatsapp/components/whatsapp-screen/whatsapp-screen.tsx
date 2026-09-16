"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { PageHeader } from "@/shared/components/ui/page-header";
import { useWhatsApp } from "../../hooks/use-whatsapp";
import { resolveWhatsAppErrorMessage } from "../../utils/resolve-whatsapp-error";
import { WhatsAppChatPane } from "../chat-pane/chat-pane";
import { WhatsAppConnectionBanner } from "../connection-banner/connection-banner";
import { WhatsAppConnectionSettings } from "../connection-settings/connection-settings";
import { WhatsAppConversationList } from "../conversation-list/conversation-list";
import { WhatsAppSimulationControls } from "../../simulation/whatsapp-simulation-controls";
import styles from "./whatsapp-screen.module.css";

export function WhatsAppScreen() {
  const t = useTranslations("WhatsApp");
  const inbox = useWhatsApp();
  const [manageOpen, setManageOpen] = useState(false);

  const header = (
    <PageHeader
      crumbs={t("crumbs")}
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        inbox.isAllowed ? (
          <div className={styles.headerActions}>
            <WhatsAppSimulationControls />
            {inbox.isAllowed && !inbox.simulationActive && inbox.realtimeStatus !== "idle" ? (
              <span
                className={styles.realtime}
                data-testid="whatsapp-realtime-status"
                data-status={inbox.realtimeStatus}
              >
                {inbox.realtimeStatus === "live"
                  ? t("realtime.live")
                  : inbox.realtimeStatus === "reconnecting"
                    ? t("realtime.reconnecting")
                    : t("realtime.offline")}
              </span>
            ) : null}
            {!inbox.simulationActive ? (
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => void inbox.refresh()}
                disabled={inbox.isRefreshing}
              >
                {t("refresh")}
              </Button>
            ) : null}
            {inbox.hasManageConnectionPermission ? (
              <Button
                type="button"
                variant="secondary"
                size="md"
                data-testid="whatsapp-manage"
                onClick={() => setManageOpen(true)}
              >
                {t("manage.button")}
              </Button>
            ) : null}
          </div>
        ) : null
      }
    />
  );

  if (!inbox.isAllowed) {
    return (
      <>
        {header}
        <section className={styles.denied} role="status">
          <p className={styles.deniedTitle}>{t("denied.title")}</p>
          <p>{t("denied.description")}</p>
        </section>
      </>
    );
  }

  return (
    <div
      className={styles.screen}
      data-testid="whatsapp-screen"
      data-chat-open={inbox.selectedConversationId ? "true" : "false"}
    >
      {header}
      <WhatsAppConnectionBanner
        connection={inbox.connection}
        loading={inbox.isConnectionLoading}
      />
      <div className={styles.workspace}>
        <WhatsAppConversationList
          conversations={inbox.conversations}
          query={inbox.query}
          meta={inbox.conversationMeta}
          selectedId={inbox.selectedConversationId}
          loading={inbox.isListLoading}
          error={resolveWhatsAppErrorMessage(t, inbox.listError)}
          onSearch={inbox.applySearch}
          onClearSearch={() => inbox.applySearch("")}
          onUnreadFilter={inbox.setUnreadFilter}
          onSelect={inbox.selectConversation}
          onLoadMore={() => void inbox.loadMoreConversations()}
          onRetry={() => void inbox.refresh()}
        />
        <WhatsAppChatPane
          conversation={inbox.selectedConversation}
          messages={inbox.messages}
          connection={inbox.connection}
          loading={inbox.isMessagesLoading}
          error={resolveWhatsAppErrorMessage(t, inbox.messagesError)}
          hasOlder={inbox.hasOlderMessages}
          markReadError={resolveWhatsAppErrorMessage(t, inbox.markReadError)}
          onBack={inbox.clearSelection}
          onLoadOlder={inbox.loadOlderMessages}
          onRetry={() => {
            if (inbox.selectedConversationId) {
              inbox.selectConversation(inbox.selectedConversationId);
            }
          }}
        />
      </div>
      <WhatsAppConnectionSettings
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        connection={inbox.connection}
      />
    </div>
  );
}
