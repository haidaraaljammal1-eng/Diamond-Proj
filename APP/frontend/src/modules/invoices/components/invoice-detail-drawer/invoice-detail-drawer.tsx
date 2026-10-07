"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Drawer } from "@/shared/components/ui/drawer";
import type { InvoiceDeliveryDto, InvoiceDetailDto } from "../../types/invoices.types";
import {
  formatInvoiceAmount,
  formatInvoiceCalendarDate,
  maskRecipientPhone,
} from "../../utils/invoice-format";
import {
  deliveryStatusBadgeVariant,
  deliveryStatusTranslationKey,
  invoiceStatusTranslationKey,
  invoiceTypeTranslationKey,
} from "../../utils/invoice-labels";
import styles from "./invoice-detail-drawer.module.css";

export interface InvoiceDetailDrawerProps {
  open: boolean;
  detail: InvoiceDetailDto | null;
  deliveries: InvoiceDeliveryDto[];
  loading: boolean;
  deliveriesLoading: boolean;
  error: string | null;
  deliveriesError: string | null;
  canSendWhatsApp: boolean;
  onClose: () => void;
  onRetry: () => void;
  onViewPdf: () => void;
  onDownloadPdf: () => void;
  onSendWhatsApp: () => void;
  pdfBusy: boolean;
}

function Kv({ label, value, ltr }: { label: string; value?: string | null; ltr?: boolean }) {
  if (!value) return null;
  return (
    <div className={styles.kv}>
      <span>{label}</span>
      <b dir={ltr ? "ltr" : undefined}>{value}</b>
    </div>
  );
}

export function InvoiceDetailDrawer({
  open,
  detail,
  deliveries,
  loading,
  deliveriesLoading,
  error,
  deliveriesError,
  canSendWhatsApp,
  onClose,
  onRetry,
  onViewPdf,
  onDownloadPdf,
  onSendWhatsApp,
  pdfBusy,
}: InvoiceDetailDrawerProps) {
  const t = useTranslations("Invoices");

  const latestStatus =
    detail?.deliveriesSummary[0]?.status ?? detail?.latestDeliveryStatus ?? null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t("detail.title")}
      closeLabel={t("detail.close")}
      heading={detail ? `#${detail.invoiceNumber}` : undefined}
    >
      <div className={styles.body} data-testid="invoice-detail-drawer">
        {loading && !detail ? (
          <p className={styles.loading}>{t("detail.loading")}</p>
        ) : null}
        {error && !detail ? (
          <div className={styles.error} role="status">
            <p>{error}</p>
            <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
              {t("retry")}
            </Button>
          </div>
        ) : null}
        {detail ? (
          <>
            <div className={styles.headerRow}>
              <Badge variant="neutral">{detail.companyCode}</Badge>
              <Badge variant={detail.status === "VOID" ? "danger" : "success"}>
                {t(invoiceStatusTranslationKey(detail.status))}
              </Badge>
            </div>

            <section className={styles.section}>
              <h3>{t("detail.summary")}</h3>
              <Kv label={t("detail.invoiceNumber")} value={String(detail.invoiceNumber)} ltr />
              <Kv label={t("detail.invoiceType")} value={t(invoiceTypeTranslationKey(detail.invoiceType))} />
              <Kv label={t("detail.company")} value={detail.companyDisplayNameSnapshot} />
              <Kv label={t("detail.issueDate")} value={formatInvoiceCalendarDate(detail.issueDate)} ltr />
              <Kv label={t("detail.dueDate")} value={formatInvoiceCalendarDate(detail.dueDate)} ltr />
              <Kv label={t("detail.terms")} value={detail.termsSnapshot} />
              <Kv label={t("detail.currency")} value={detail.currency} ltr />
            </section>

            <section className={styles.section}>
              <h3>{t("detail.customer")}</h3>
              <Kv label={t("detail.customerName")} value={detail.customerName} />
            </section>

            <section className={styles.section}>
              <h3>{t("detail.contract")}</h3>
              <Kv label={t("detail.contractNumber")} value={detail.contractNumber} ltr />
            </section>

            <section className={styles.section}>
              <h3>{t("detail.vehicle")}</h3>
              <Kv label={t("detail.vehicleName")} value={detail.vehicleName} />
              <Kv label={t("detail.plateNumber")} value={detail.plateNumber} ltr />
            </section>

            <section className={styles.section}>
              <h3>{t("detail.source")}</h3>
              <Kv label={t("detail.sourceLabel")} value={detail.sourceLabel} />
            </section>

            <section className={styles.section}>
              <h3>{t("detail.lines")}</h3>
              <table className={styles.linesTable} data-testid="invoice-lines-table">
                <thead>
                  <tr>
                    <th>{t("detail.lineService")}</th>
                    <th>{t("detail.lineDescription")}</th>
                    <th>{t("detail.lineQty")}</th>
                    <th>{t("detail.lineRate")}</th>
                    <th>{t("detail.lineAmount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((line) => (
                    <tr key={line.id}>
                      <td>{line.serviceLabel}</td>
                      <td>{line.description}</td>
                      <td dir="ltr">{line.quantity}</td>
                      <td dir="ltr">{formatInvoiceAmount(line.unitRate, detail.currency)}</td>
                      <td dir="ltr">{formatInvoiceAmount(line.amount, detail.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className={styles.total} data-testid="invoice-detail-total">
              <span>{t("detail.total")}</span>
              <strong dir="ltr">{formatInvoiceAmount(detail.totalAmount, detail.currency)}</strong>
            </section>

            <section className={styles.section}>
              <h3>{t("detail.delivery")}</h3>
              <div className={styles.deliveryStatus}>
                <span>{t("detail.latestWhatsApp")}</span>
                <Badge variant={deliveryStatusBadgeVariant(latestStatus)}>
                  {t(deliveryStatusTranslationKey(latestStatus))}
                </Badge>
              </div>
              {deliveriesLoading ? <p className={styles.loading}>{t("detail.deliveryLoading")}</p> : null}
              {deliveriesError ? (
                <p className={styles.errorInline}>{deliveriesError}</p>
              ) : null}
              {!deliveriesLoading && deliveries.length === 0 ? (
                <p className={styles.muted}>{t("delivery.historyEmpty")}</p>
              ) : null}
              {deliveries.length > 0 ? (
                <ul className={styles.history} data-testid="invoice-delivery-history">
                  {deliveries.map((row) => (
                    <li key={row.id}>
                      <div className={styles.historyRow}>
                        <Badge variant={deliveryStatusBadgeVariant(row.status)}>
                          {t(deliveryStatusTranslationKey(row.status))}
                        </Badge>
                        <span dir="ltr">{formatInvoiceCalendarDate(row.requestedAt)}</span>
                      </div>
                      {maskRecipientPhone(row.recipientPhoneSnapshot) ? (
                        <span className={styles.muted} dir="ltr">
                          {maskRecipientPhone(row.recipientPhoneSnapshot)}
                        </span>
                      ) : null}
                      {row.failureMessage ? (
                        <span className={styles.errorInline}>{row.failureMessage}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            <div className={styles.actions}>
              <Button
                type="button"
                variant="secondary"
                size="md"
                disabled={pdfBusy}
                data-testid="invoice-detail-view-pdf"
                onClick={onViewPdf}
              >
                {t("actions.viewPdf")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                disabled={pdfBusy}
                data-testid="invoice-detail-download-pdf"
                onClick={onDownloadPdf}
              >
                {t("actions.download")}
              </Button>
              {canSendWhatsApp && detail.status === "ISSUED" ? (
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  data-testid="invoice-detail-send-whatsapp"
                  onClick={onSendWhatsApp}
                >
                  {t("actions.sendWhatsApp")}
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </Drawer>
  );
}
