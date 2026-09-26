"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { Icon } from "@/shared/components/ui/icon";
import type { FullReconciliationReadDto, ReconciliationLinkIssuedDto } from "../../types/reconciliation.types";
import {
  canCollectReconciliation,
  isReconciliationAwaitingPayment,
  isReconciliationEditable,
  isReconciliationPaymentFailed,
  isReconciliationPaymentPending,
  settlementAmountDue,
} from "../../utils/reconciliation.utils";
import { ReconciliationFinancialSummary } from "./reconciliation-sections";
import styles from "./reconcile-dialog.module.css";

type CollectionView = "none" | "method" | "cash" | "link";

export function ReconciliationActionBar({
  data,
  issuedLink,
  finalizePending,
  cashPending,
  linkPending,
  onFinalize,
  onSettleCash,
  onGenerateLink,
}: {
  data: FullReconciliationReadDto;
  issuedLink: ReconciliationLinkIssuedDto | null;
  finalizePending: boolean;
  cashPending: boolean;
  linkPending: boolean;
  onFinalize: () => Promise<boolean>;
  onSettleCash: () => Promise<boolean>;
  onGenerateLink: () => Promise<boolean>;
}) {
  const t = useTranslations("Contracts");
  const format = useFormatter();
  const editable = isReconciliationEditable(data);
  const canCollect = canCollectReconciliation(data);
  const awaitingPayment = isReconciliationAwaitingPayment(data);
  const paymentPending = isReconciliationPaymentPending(data);
  const paymentFailed = isReconciliationPaymentFailed(data);
  const [view, setView] = useState<CollectionView>("none");
  const [copied, setCopied] = useState(false);
  const [confirmZeroOpen, setConfirmZeroOpen] = useState(false);

  const linkUrl = issuedLink?.publicUrl ?? null;
  const hasRecoverableLink = Boolean(linkUrl || data.paymentLink.active);

  const copyLink = async (url: string) => {
    if (typeof navigator === "undefined") return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
  };

  const amountLabel = t("finalReconciliation.finalAmountDue");
  const amountValue = `${format.number(settlementAmountDue(data))} AED`;

  const collectLabel =
    awaitingPayment && (paymentPending || paymentFailed)
      ? t("finalReconciliation.retryPayment")
      : t("finalReconciliation.collect");

  const collectionStatusNote = (() => {
    if (paymentFailed) return t("finalReconciliation.paymentFailed");
    if (awaitingPayment) return t("finalReconciliation.awaitingPayment");
    return null;
  })();

  const renderDialogs = () => (
    <>
      <Dialog
        open={view === "method"}
        onClose={() => setView("none")}
        title={t("finalReconciliation.chooseCollectionMethod")}
        closeLabel={t("detail.close")}
      >
        <div className={styles.methodOptions}>
          <button type="button" className={styles.methodOption} onClick={() => setView("cash")}>
            <Icon name="mdi:cash" size={20} className={styles.methodOptionIcon} />
            <div className={styles.methodOptionText}>
              <strong>{t("finalReconciliation.cashPayment")}</strong>
              <span>{t("finalReconciliation.cashPaymentHint")}</span>
            </div>
          </button>
          <button
            type="button"
            className={styles.methodOption}
            disabled={linkPending}
            onClick={() => void onGenerateLink().then((ok) => ok && setView("link"))}
          >
            <Icon name="mdi:credit-card-outline" size={20} className={styles.methodOptionIcon} />
            <div className={styles.methodOptionText}>
              <strong>{t("finalReconciliation.electronicPayment")}</strong>
              <span>
                {hasRecoverableLink && !linkUrl
                  ? t("finalReconciliation.reissueLinkHint")
                  : t("finalReconciliation.electronicPaymentHint")}
              </span>
            </div>
          </button>
        </div>
      </Dialog>

      <Dialog
        open={view === "cash"}
        onClose={() => setView("none")}
        title={t("finalReconciliation.cashConfirmTitle")}
        closeLabel={t("detail.close")}
      >
        <div className={styles.cashConfirmBody}>
          <ReconciliationFinancialSummary data={data} variant="compact" />
          <p className={styles.cashConfirmNote}>{t("finalReconciliation.paymentMethodCash")}</p>
          <div className={styles.dialogActions}>
            <Button type="button" size="sm" variant="ghost" onClick={() => setView("none")}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              size="md"
              loading={cashPending}
              onClick={() => void onSettleCash().then((ok) => ok && setView("none"))}
            >
              {t("finalReconciliation.confirmCollection")}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={view === "link"}
        onClose={() => setView("none")}
        title={t("finalReconciliation.paymentLinkReady")}
        closeLabel={t("detail.close")}
      >
        {issuedLink ? (
          <div className={styles.linkResultBody} data-testid="reconciliation-link-dialog">
            <div className={styles.linkResultSummary}>
              <p className={styles.linkResultSummaryLabel}>{t("finalReconciliation.finalAmountDue")}</p>
              <p className={styles.linkResultSummaryAmount} dir="ltr">
                {amountValue}
              </p>
            </div>
            <div className={styles.linkResultField}>
              <p className={styles.linkResultFieldLabel}>{t("finalReconciliation.customerPaymentLink")}</p>
              <p
                className={styles.linkDisplay}
                dir="ltr"
                title={issuedLink.publicUrl}
                data-testid="reconciliation-link-url"
              >
                {issuedLink.publicUrl}
              </p>
            </div>
            <div className={styles.linkActions}>
              <Button type="button" size="sm" variant="secondary" onClick={() => void copyLink(issuedLink.publicUrl)}>
                {copied ? t("link.copied") : t("finalReconciliation.copyLink")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => window.open(issuedLink.publicUrl, "_blank", "noopener,noreferrer")}
              >
                {t("finalReconciliation.openLink")}
              </Button>
            </div>
            <p className={styles.linkResultNote}>{t("finalReconciliation.paymentLinkInstructions")}</p>
          </div>
        ) : (
          <p className={styles.muted}>{t("detail.loading")}</p>
        )}
      </Dialog>

      <Dialog
        open={confirmZeroOpen}
        onClose={() => setConfirmZeroOpen(false)}
        title={t("finalReconciliation.completeWithoutChargesConfirmTitle")}
        closeLabel={t("detail.close")}
      >
        <div className={styles.cashConfirmBody} data-testid="reconciliation-complete-without-charges-dialog">
          <p className={styles.cashConfirmNote}>{t("finalReconciliation.completeWithoutChargesConfirmBody")}</p>
          <div className={styles.dialogActions}>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmZeroOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              size="md"
              loading={finalizePending}
              data-testid="reconciliation-complete-without-charges-confirm"
              onClick={() => {
                void onFinalize().then((ok) => {
                  if (ok) setConfirmZeroOpen(false);
                });
              }}
            >
              {t("finalReconciliation.completeWithoutCharges")}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );

  if (data.reconciliation.settled) {
    return (
      <>
        <footer className={styles.completionBar} data-testid="reconciliation-completed">
          <div className={styles.completionBarMain}>
            <Icon name="mdi:check-circle-outline" size={22} className={styles.completionIcon} />
            <div>
              <p className={styles.completionTitle}>{t("finalReconciliation.completed")}</p>
              <p className={styles.completionNote}>
                {data.totals.finalAmount === 0
                  ? t("finalReconciliation.completedWithoutChargesNote")
                  : t("finalReconciliation.paymentSettledNote")}
              </p>
            </div>
          </div>
          <p className={styles.completionAmount} dir="ltr">
            {amountValue}
          </p>
        </footer>
        {renderDialogs()}
      </>
    );
  }

  if (data.contract.status === "CLOSED") {
    return renderDialogs();
  }

  if (editable && data.settlementAmountDue === 0) {
    return (
      <>
        <footer className={styles.actionBar} data-testid="reconciliation-zero-draft">
          <div className={styles.actionBarMain}>
            <p className={styles.actionBarLabel}>{amountLabel}</p>
            <p className={styles.actionBarAmount} dir="ltr">
              {amountValue}
            </p>
          </div>
          <div className={styles.actionBarActions}>
            <Button
              type="button"
              size="md"
              variant="secondaryStrong"
              data-testid="reconciliation-complete-without-charges"
              onClick={() => setConfirmZeroOpen(true)}
            >
              {t("finalReconciliation.completeWithoutCharges")}
            </Button>
          </div>
        </footer>
        {renderDialogs()}
      </>
    );
  }

  if (!canCollect) {
    return renderDialogs();
  }

  const footerTestId = awaitingPayment ? "reconciliation-awaiting-payment" : "reconciliation-collection";

  return (
    <>
      <footer
        className={awaitingPayment ? styles.awaitingPaymentBar : styles.actionBar}
        data-testid={footerTestId}
      >
        <div className={styles.actionBarMain}>
          <p className={styles.actionBarLabel}>{amountLabel}</p>
          <p className={styles.actionBarAmount} dir="ltr">
            {amountValue}
          </p>
          {collectionStatusNote ? (
            <p className={styles.actionBarNote} data-testid="reconciliation-collection-status">
              {collectionStatusNote}
            </p>
          ) : null}
        </div>

        {linkUrl ? (
          <div className={styles.awaitingPaymentLinkBlock} data-testid="reconciliation-link-result">
            <p className={styles.awaitingPaymentLinkLabel}>{t("finalReconciliation.customerPaymentLink")}</p>
            <p className={styles.linkDisplay} dir="ltr" title={linkUrl} data-testid="reconciliation-link-url">
              {linkUrl}
            </p>
            <div className={styles.linkActions}>
              <Button type="button" size="sm" variant="secondary" onClick={() => void copyLink(linkUrl)}>
                {copied ? t("link.copied") : t("finalReconciliation.copyLink")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => window.open(linkUrl, "_blank", "noopener,noreferrer")}
              >
                {t("finalReconciliation.openLink")}
              </Button>
            </div>
          </div>
        ) : null}

        <div className={styles.actionBarActions}>
          <Button type="button" size="md" onClick={() => setView("method")} data-testid="reconciliation-collect">
            {collectLabel}
          </Button>
          {!linkUrl && data.paymentLink.active ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              loading={linkPending}
              onClick={() => void onGenerateLink().then((ok) => ok && setView("link"))}
              data-testid="reconciliation-reissue-link"
            >
              {t("finalReconciliation.reissueLink")}
            </Button>
          ) : null}
        </div>
      </footer>
      {renderDialogs()}
    </>
  );
}

/** Preserved export name for existing imports and tests */
export const ReconciliationCollectionSection = ReconciliationActionBar;
