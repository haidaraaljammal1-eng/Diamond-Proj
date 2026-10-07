"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Icon } from "@/shared/components/ui/icon";
import type {
  InvoiceListItemDto,
  InvoicePageMeta,
  InvoicesListQuery,
} from "../../types/invoices.types";
import { hasInvoiceListFilters } from "../../utils/invoice-filters";
import {
  formatInvoiceAmount,
  formatInvoiceCalendarDate,
} from "../../utils/invoice-format";
import {
  deliveryStatusBadgeVariant,
  deliveryStatusTranslationKey,
} from "../../utils/invoice-labels";
import styles from "./invoices-table.module.css";

export interface InvoicesTableProps {
  items: InvoiceListItemDto[];
  meta: InvoicePageMeta | null;
  query: InvoicesListQuery;
  loading: boolean;
  error: string | null;
  canSendWhatsApp: boolean;
  onSelect: (id: string) => void;
  onViewPdf: (id: string) => void;
  onDownloadPdf: (id: string) => void;
  onWhatsApp: (item: InvoiceListItemDto) => void;
  onRetry: () => void;
  onPage: (page: number) => void;
  onViewContract?: (contractId: string) => void;
}

function CompanyBadge({ code }: { code: string }) {
  return (
    <Badge variant="neutral" className={styles.companyBadge}>
      {code}
    </Badge>
  );
}

export function InvoicesTable({
  items,
  meta,
  query,
  loading,
  error,
  canSendWhatsApp,
  onSelect,
  onViewPdf,
  onDownloadPdf,
  onWhatsApp,
  onRetry,
  onPage,
  onViewContract,
}: InvoicesTableProps) {
  const t = useTranslations("Invoices");
  const page = meta?.page ?? query.page;
  const totalPages = meta?.totalPages ?? 1;
  const showEmpty = !error && !loading && items.length === 0;

  return (
    <section className={styles.section} data-testid="invoices-table-section">
      {loading && items.length === 0 ? (
        <div className={styles.skeletons} data-testid="invoices-loading">
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
        </div>
      ) : null}

      {error ? (
        <div className={styles.error} role="status" data-testid="invoices-error">
          <p>{error}</p>
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            {t("retry")}
          </Button>
        </div>
      ) : null}

      {showEmpty ? (
        <div className={styles.empty} data-testid="invoices-empty">
          <p>{t(hasInvoiceListFilters(query) ? "empty.noMatch" : "empty.none")}</p>
        </div>
      ) : null}

      {!error && items.length > 0 ? (
        <>
          <div className={styles.desktop}>
            <table className={styles.table} data-testid="invoices-table">
              <thead>
                <tr>
                  <th>{t("columns.invoice")}</th>
                  <th>{t("columns.company")}</th>
                  <th>{t("columns.customer")}</th>
                  <th>{t("columns.contract")}</th>
                  <th>{t("columns.vehicle")}</th>
                  <th>{t("columns.source")}</th>
                  <th>{t("columns.issueDate")}</th>
                  <th>{t("columns.amount")}</th>
                  <th>{t("columns.whatsapp")}</th>
                  <th>{t("columns.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    data-testid="invoices-row"
                    data-invoice-id={item.id}
                    className={styles.row}
                    onClick={() => onSelect(item.id)}
                  >
                    <td>
                      <span className={styles.invoiceNumber} dir="ltr">
                        {item.invoiceNumber}
                      </span>
                    </td>
                    <td>
                      <CompanyBadge code={item.companyCode} />
                    </td>
                    <td>{item.customerName}</td>
                    <td>
                      {onViewContract ? (
                        <button
                          type="button"
                          className={styles.linkButton}
                          onClick={(event) => {
                            event.stopPropagation();
                            onViewContract(item.contractId);
                          }}
                        >
                          {item.contractNumber}
                        </button>
                      ) : (
                        item.contractNumber
                      )}
                    </td>
                    <td>
                      <div className={styles.vehicle}>
                        <span>{item.vehicleName}</span>
                        <span className={styles.plate} dir="ltr">{item.plateNumber}</span>
                      </div>
                    </td>
                    <td>{item.sourceLabel}</td>
                    <td dir="ltr">{formatInvoiceCalendarDate(item.issueDate)}</td>
                    <td className={styles.amount} dir="ltr">
                      {formatInvoiceAmount(item.totalAmount, item.currency)}
                    </td>
                    <td>
                      <Badge variant={deliveryStatusBadgeVariant(item.latestDeliveryStatus)}>
                        {t(deliveryStatusTranslationKey(item.latestDeliveryStatus))}
                      </Badge>
                    </td>
                    <td>
                      <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          aria-label={t("actions.view")}
                          onClick={() => onSelect(item.id)}
                        >
                          {t("actions.view")}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          aria-label={t("actions.viewPdf")}
                          data-testid="invoices-action-view-pdf"
                          onClick={() => onViewPdf(item.id)}
                        >
                          <Icon name="mdi:file-pdf-box" size={18} />
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          aria-label={t("actions.download")}
                          data-testid="invoices-action-download-pdf"
                          onClick={() => onDownloadPdf(item.id)}
                        >
                          <Icon name="mdi:download" size={18} />
                        </Button>
                        {canSendWhatsApp && item.status === "ISSUED" ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            aria-label={t("actions.sendWhatsApp")}
                            data-testid="invoices-action-whatsapp"
                            onClick={() => onWhatsApp(item)}
                          >
                            <Icon name="mdi:whatsapp" size={18} />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {meta && meta.totalPages > 1 ? (
            <nav className={styles.pagination} aria-label={t("pagination.label")}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => onPage(page - 1)}
              >
                {t("pagination.previous")}
              </Button>
              <span data-testid="invoices-pagination-label">
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
        </>
      ) : null}
    </section>
  );
}
