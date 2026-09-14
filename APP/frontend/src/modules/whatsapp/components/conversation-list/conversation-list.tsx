"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { DataSearch } from "@/shared/components/data-search";
import type {
  WhatsAppConversationListItemDto,
  WhatsAppListQuery,
  WhatsAppPageMeta,
} from "../../types/whatsapp.types";
import { WhatsAppConversationRow } from "../conversation-row/conversation-row";
import styles from "./conversation-list.module.css";

export function WhatsAppConversationList({
  conversations,
  query,
  meta,
  selectedId,
  loading,
  error,
  onSearch,
  onClearSearch,
  onUnreadFilter,
  onSelect,
  onLoadMore,
  onRetry,
}: {
  conversations: WhatsAppConversationListItemDto[];
  query: WhatsAppListQuery;
  meta: WhatsAppPageMeta | null;
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  onSearch: (value: string) => void;
  onClearSearch: () => void;
  onUnreadFilter: (unread: boolean) => void;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  const t = useTranslations("WhatsApp");
  const canLoadMore = Boolean(meta && meta.page < meta.totalPages);
  const emptyKind = query.search
    ? "search"
    : query.unread
      ? "unread"
      : "none";

  return (
    <aside className={styles.panel} data-testid="whatsapp-conversation-list">
      <div className={styles.toolbar}>
        <p className={styles.title}>{t("list.title")}</p>
        <DataSearch
          appliedValue={query.search}
          onSearch={onSearch}
          onClear={onClearSearch}
          placeholder={t("search.placeholder")}
          inputLabel={t("search.inputLabel")}
          searchButtonLabel={t("search.button")}
          clearButtonLabel={t("search.clear")}
          loading={loading}
          inputTestId="whatsapp-search"
          className={styles.search}
        />
        <div className={styles.tabs} role="tablist" aria-label={t("filters.label")}>
          <button
            type="button"
            role="tab"
            aria-selected={!query.unread}
            className={!query.unread ? styles.tabOn : styles.tab}
            onClick={() => onUnreadFilter(false)}
            data-testid="whatsapp-filter-all"
          >
            {t("filters.all")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={query.unread}
            className={query.unread ? styles.tabOn : styles.tab}
            onClick={() => onUnreadFilter(true)}
            data-testid="whatsapp-filter-unread"
          >
            {t("filters.unread")}
          </button>
        </div>
      </div>

      <div className={styles.items}>
        {error ? (
          <div className={styles.state} role="alert">
            <p>{error}</p>
            <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
              {t("retry")}
            </Button>
          </div>
        ) : null}

        {loading && conversations.length === 0 ? (
          <div className={styles.skeleton} aria-label={t("list.loading")} data-testid="whatsapp-list-loading">
            <span />
            <span />
            <span />
          </div>
        ) : null}

        {!loading && conversations.length === 0 && !error ? (
          <div className={styles.state} data-testid={`whatsapp-empty-${emptyKind}`}>
            <p className={styles.stateTitle}>{t(`empty.${emptyKind}.title`)}</p>
            <p>{t(`empty.${emptyKind}.body`)}</p>
          </div>
        ) : null}

        {conversations.map((conversation) => (
          <WhatsAppConversationRow
            key={conversation.id}
            conversation={conversation}
            selected={conversation.id === selectedId}
            onSelect={onSelect}
          />
        ))}

        {canLoadMore ? (
          <div className={styles.more}>
            <Button type="button" variant="secondary" size="sm" onClick={onLoadMore} disabled={loading}>
              {t("list.loadMore")}
            </Button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
