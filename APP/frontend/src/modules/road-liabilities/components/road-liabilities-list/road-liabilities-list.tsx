"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import type {
  RoadLiabilitiesListQuery,
  RoadLiabilityListItemDto,
  RoadLiabilityPageMeta,
} from "../../types/road-liabilities.types";
import { RoadLiabilitiesEmpty } from "../road-liabilities-empty/road-liabilities-empty";
import { RoadLiabilitiesToolbar } from "../road-liabilities-toolbar/road-liabilities-toolbar";
import {
  RoadLiabilityCard,
  RoadLiabilityRow,
} from "../road-liability-row/road-liability-row";
import type { RoadLiabilitiesToolbarProps } from "../road-liabilities-toolbar/road-liabilities-toolbar";
import styles from "./road-liabilities-list.module.css";

export interface RoadLiabilitiesListCollectionProps {
  canCharge: boolean;
  canCollectRow: (item: RoadLiabilityListItemDto) => boolean;
  canCashCollectRow: (item: RoadLiabilityListItemDto) => boolean;
  onCollect: (item: RoadLiabilityListItemDto) => void;
  onCashCollect: (item: RoadLiabilityListItemDto) => void;
  collectSubmitting: boolean;
  collectSubmittingId: string | null;
}

export interface RoadLiabilitiesListProps {
  items: RoadLiabilityListItemDto[];
  meta: RoadLiabilityPageMeta | null;
  query: RoadLiabilitiesListQuery;
  selectedLiabilityId: string | null;
  loading: boolean;
  error: string | null;
  resultsLabel: string;
  onSelect: (id: string) => void;
  onRetry: () => void;
  onPage: (page: number) => void;
  toolbar: Omit<RoadLiabilitiesToolbarProps, "query" | "resultsLabel" | "loading">;
  collection?: RoadLiabilitiesListCollectionProps;
}

export function RoadLiabilitiesList({
  items,
  meta,
  query,
  selectedLiabilityId,
  loading,
  error,
  resultsLabel,
  onSelect,
  onRetry,
  onPage,
  toolbar,
  collection,
}: RoadLiabilitiesListProps) {
  const t = useTranslations("RoadLiabilities");
  const page = meta?.page ?? query.page;
  const totalPages = meta?.totalPages ?? 1;
  const showEmpty = !error && !loading && items.length === 0;
  const showActionsColumn = Boolean(collection?.canCharge);

  return (
    <section className={styles.list} data-testid="road-liabilities-list">
      <RoadLiabilitiesToolbar
        query={query}
        resultsLabel={resultsLabel}
        loading={loading}
        {...toolbar}
      />

      {loading && items.length === 0 ? (
        <>
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
        </>
      ) : null}

      {error ? (
        <div className={styles.error} role="status">
          <p>{error}</p>
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            {t("retry")}
          </Button>
        </div>
      ) : null}

      {showEmpty ? <RoadLiabilitiesEmpty /> : null}

      {!error && items.length > 0 ? (
        <>
          <div className={styles.desktop}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t("columns.authority")}</th>
                  <th>{t("columns.vehicle")}</th>
                  <th>{t("columns.party")}</th>
                  <th>{t("columns.occurred")}</th>
                  <th>{t("columns.amount")}</th>
                  <th>{t("columns.status")}</th>
                  {showActionsColumn ? <th>{t("columns.actions")}</th> : null}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <RoadLiabilityRow
                    key={item.id}
                    item={item}
                    selected={item.id === selectedLiabilityId}
                    onSelect={onSelect}
                    showCollectAction={Boolean(collection?.canCollectRow(item))}
                    showCashCollectAction={Boolean(collection?.canCashCollectRow(item))}
                    showActionsColumn={showActionsColumn}
                    onCollect={collection?.onCollect}
                    onCashCollect={collection?.onCashCollect}
                    collectSubmitting={
                      collection?.collectSubmitting === true &&
                      collection.collectSubmittingId === item.id
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.mobile}>
            {items.map((item) => (
              <RoadLiabilityCard
                key={item.id}
                item={item}
                selected={item.id === selectedLiabilityId}
                onSelect={onSelect}
                showCollectAction={Boolean(collection?.canCollectRow(item))}
                showCashCollectAction={Boolean(collection?.canCashCollectRow(item))}
                onCollect={collection?.onCollect}
                onCashCollect={collection?.onCashCollect}
                collectSubmitting={
                  collection?.collectSubmitting === true &&
                  collection.collectSubmittingId === item.id
                }
              />
            ))}
          </div>
        </>
      ) : null}

      {meta && meta.totalPages > 1 ? (
        <nav
          className={styles.pagination}
          aria-label={t("pagination.label")}
          data-testid="road-liabilities-pagination"
        >
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => onPage(page - 1)}
          >
            {t("pagination.previous")}
          </Button>
          <span className={styles.page}>
            {t("pagination.page", { page, totalPages })}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => onPage(page + 1)}
          >
            {t("pagination.next")}
          </Button>
        </nav>
      ) : null}
    </section>
  );
}
