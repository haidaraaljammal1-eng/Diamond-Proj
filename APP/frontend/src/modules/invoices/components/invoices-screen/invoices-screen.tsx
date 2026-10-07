"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ContractDetailDrawer } from "@/modules/contracts/components/contract-detail/contract-detail-drawer";
import { Button } from "@/shared/components/ui/button";
import { PageHeader } from "@/shared/components/ui/page-header";
import {
  openInvoicePdfInNewTab,
  triggerInvoicePdfDownload,
} from "../../api/invoices.api";
import { useInvoices } from "../../hooks/use-invoices";
import type { InvoiceListItemDto } from "../../types/invoices.types";
import { resolveInvoicesErrorMessage } from "../../utils/resolve-invoices-error";
import { InvoiceDetailDrawer } from "../invoice-detail-drawer/invoice-detail-drawer";
import { InvoiceWhatsAppDialog } from "../invoice-whatsapp-dialog/invoice-whatsapp-dialog";
import { InvoicesCompanyFilter } from "../invoices-company-filter/invoices-company-filter";
import { InvoicesTable } from "../invoices-table/invoices-table";
import { InvoicesToolbar } from "../invoices-toolbar/invoices-toolbar";
import styles from "./invoices-screen.module.css";

export function InvoicesScreen() {
  const t = useTranslations("Invoices");
  const locale = useLocale();
  const router = useRouter();
  const page = useInvoices();

  const [whatsappTarget, setWhatsappTarget] = useState<InvoiceListItemDto | null>(null);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [contractId, setContractId] = useState<string | null>(null);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3200);
  }, []);

  const listErrorMessage = resolveInvoicesErrorMessage(t, page.listError);
  const detailErrorMessage = resolveInvoicesErrorMessage(t, page.detailError);
  const deliveriesErrorMessage = resolveInvoicesErrorMessage(t, page.deliveriesError);

  const resultsLabel = useMemo(() => {
    const total = page.pagination?.total ?? page.items.length;
    return t("list.results", { count: total });
  }, [page.pagination?.total, page.items.length, t]);

  const handleViewPdf = async (id: string) => {
    setPdfBusy(true);
    try {
      await openInvoicePdfInNewTab(id);
    } catch {
      showNotice(t("errors.pdfView"));
    } finally {
      setPdfBusy(false);
    }
  };

  const handleDownloadPdf = async (id: string) => {
    setPdfBusy(true);
    try {
      await triggerInvoicePdfDownload(id);
    } catch {
      showNotice(t("errors.pdfDownload"));
    } finally {
      setPdfBusy(false);
    }
  };

  const openWhatsApp = (item: InvoiceListItemDto) => {
    setWhatsappTarget(item);
    setWhatsappOpen(true);
  };

  const header = (
    <PageHeader
      crumbs={t("crumbs")}
      title={t("title")}
      subtitle={t("subtitle")}
      actions={
        page.isAllowed ? (
          <Button
            type="button"
            variant="secondary"
            size="md"
            data-testid="invoices-refresh"
            onClick={() => void page.refresh()}
            disabled={page.isListLoading}
          >
            {t("refresh")}
          </Button>
        ) : null
      }
    />
  );

  if (!page.isAllowed) {
    return (
      <>
        {header}
        <section className={styles.denied} role="status" data-testid="invoices-denied">
          <p className={styles.deniedTitle}>{t("denied.title")}</p>
          <p>{t("denied.description")}</p>
        </section>
      </>
    );
  }

  return (
    <div className={styles.screen} data-testid="invoices-screen">
      {header}
      {notice ? (
        <p className={styles.notice} role="status" data-testid="invoices-notice">
          {notice}
        </p>
      ) : null}

      <InvoicesCompanyFilter value={page.query.companyCode} onChange={page.setCompanyCode} />

      <InvoicesToolbar
        query={page.query}
        onSearch={page.applySearch}
        onClearSearch={page.clearSearch}
        onTypeChange={page.setInvoiceType}
        onDateFrom={(from) => page.setDateRange(from, page.query.dateTo)}
        onDateTo={(to) => page.setDateRange(page.query.dateFrom, to)}
        onClearFilters={page.clearFilters}
        activeFilterCount={page.activeFilterCount}
        resultsLabel={resultsLabel}
        loading={page.isListLoading}
      />

      <InvoicesTable
        items={page.items}
        meta={page.pagination}
        query={page.query}
        loading={page.isListLoading}
        error={listErrorMessage}
        canSendWhatsApp={page.canSendWhatsApp}
        onSelect={page.selectInvoice}
        onViewPdf={(id) => void handleViewPdf(id)}
        onDownloadPdf={(id) => void handleDownloadPdf(id)}
        onWhatsApp={openWhatsApp}
        onRetry={() => void page.refresh()}
        onPage={page.setPage}
        onViewContract={(id) => setContractId(id)}
      />

      <InvoiceDetailDrawer
        open={page.detailOpen}
        detail={page.selectedDetail}
        deliveries={page.deliveries}
        loading={page.isDetailLoading}
        deliveriesLoading={page.isDeliveriesLoading}
        error={detailErrorMessage}
        deliveriesError={deliveriesErrorMessage}
        canSendWhatsApp={page.canSendWhatsApp}
        onClose={page.closeDetail}
        onRetry={() => {
          if (page.selectedInvoiceId) page.selectInvoice(page.selectedInvoiceId);
        }}
        onViewPdf={() => {
          if (page.selectedInvoiceId) void handleViewPdf(page.selectedInvoiceId);
        }}
        onDownloadPdf={() => {
          if (page.selectedInvoiceId) void handleDownloadPdf(page.selectedInvoiceId);
        }}
        onSendWhatsApp={() => {
          const item = page.items.find((row) => row.id === page.selectedInvoiceId);
          if (item) openWhatsApp(item);
          else if (page.selectedDetail) {
            openWhatsApp(page.selectedDetail);
          }
        }}
        pdfBusy={pdfBusy}
      />

      <InvoiceWhatsAppDialog
        open={whatsappOpen}
        invoice={whatsappTarget}
        onClose={() => setWhatsappOpen(false)}
        onSuccess={() => {
          showNotice(t("whatsapp.success"));
          void page.reloadDetailAndDeliveries();
          void page.refresh();
        }}
      />

      <ContractDetailDrawer
        contractId={contractId}
        onClose={() => setContractId(null)}
        onGenerateRentalLink={() => router.push(`/${locale}/contracts`)}
        onCarOut={() => router.push(`/${locale}/contracts`)}
        onCarIn={() => router.push(`/${locale}/contracts`)}
        onReturnLink={() => router.push(`/${locale}/contracts`)}
        onRenew={() => router.push(`/${locale}/contracts`)}
        onReconcile={() => router.push(`/${locale}/contracts`)}
        onCloseContract={() => router.push(`/${locale}/contracts`)}
      />
    </div>
  );
}
