"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { sendInvoiceWhatsApp } from "../../api/invoices.api";
import type { InvoiceListItemDto } from "../../types/invoices.types";
import { formatInvoiceAmount } from "../../utils/invoice-format";
import { resolveInvoicesErrorMessage } from "../../utils/resolve-invoices-error";
import styles from "./invoice-whatsapp-dialog.module.css";

export interface InvoiceWhatsAppDialogProps {
  open: boolean;
  invoice: InvoiceListItemDto | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function InvoiceWhatsAppDialog({
  open,
  invoice,
  onClose,
  onSuccess,
}: InvoiceWhatsAppDialogProps) {
  const t = useTranslations("Invoices");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  function handleClose() {
    if (sending) return;
    setSending(false);
    setError(null);
    idempotencyKeyRef.current = null;
    onClose();
  }

  async function handleSend() {
    if (!invoice || sending) return;
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }
    setSending(true);
    setError(null);
    try {
      await sendInvoiceWhatsApp(invoice.id, idempotencyKeyRef.current);
      idempotencyKeyRef.current = null;
      setSending(false);
      setError(null);
      idempotencyKeyRef.current = null;
      onSuccess();
      onClose();
    } catch (err) {
      setError(resolveInvoicesErrorMessage(t, err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={t("whatsapp.title")}
      description={t("whatsapp.description")}
      closeLabel={t("whatsapp.cancel")}
    >
      <div className={styles.body} data-testid="invoice-whatsapp-dialog">
        {invoice ? (
          <dl className={styles.summary}>
            <div>
              <dt>{t("whatsapp.customer")}</dt>
              <dd>{invoice.customerName}</dd>
            </div>
            <div>
              <dt>{t("whatsapp.invoiceNumber")}</dt>
              <dd dir="ltr">{invoice.invoiceNumber}</dd>
            </div>
            <div>
              <dt>{t("whatsapp.contract")}</dt>
              <dd dir="ltr">{invoice.contractNumber}</dd>
            </div>
            <div>
              <dt>{t("whatsapp.company")}</dt>
              <dd>{invoice.companyCode}</dd>
            </div>
            <div>
              <dt>{t("whatsapp.amount")}</dt>
              <dd dir="ltr">{formatInvoiceAmount(invoice.totalAmount, invoice.currency)}</dd>
            </div>
          </dl>
        ) : null}
        <p className={styles.phoneHint}>{t("whatsapp.phoneHint")}</p>
        {error ? (
          <p className={styles.error} role="status" data-testid="invoice-whatsapp-error">
            {error}
          </p>
        ) : null}
        <div className={styles.actions}>
          <Button type="button" variant="secondary" size="md" onClick={handleClose} disabled={sending}>
            {t("whatsapp.cancel")}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            data-testid="invoice-whatsapp-send"
            disabled={sending || !invoice}
            onClick={() => void handleSend()}
          >
            {sending ? t("whatsapp.sending") : t("whatsapp.send")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
