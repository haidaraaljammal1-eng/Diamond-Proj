"use client";

import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { Drawer } from "@/shared/components/ui/drawer";
import { CompanyIdentity } from "@/shared/components/company-identity";
import { StripePaymentActions } from "@/modules/payments/components/stripe-payment-actions";
import { useStripeCheckout } from "@/modules/payments/hooks/use-stripe-checkout";
import { startPostCloseReceivablePayment } from "@/modules/payments/api/payments.api";
import { useContract } from "../../hooks/use-contract";
import { ContractStatusChip } from "../contract-status/contract-status";
import { ContractTimeline } from "../contract-timeline/contract-timeline";
import { ContractInspectionImage } from "../contract-inspection-image/contract-inspection-image";
import { ContractTarsStatus } from "../contract-tars/contract-tars-status";
import { ContractTarsInlineStatus } from "../contract-tars/contract-tars-inline-status";
import { resolveContractsErrorMessage } from "../../utils/resolve-contracts-error";
import { formatRentalDuration } from "../../utils/format-rental-duration";
import { contractPaymentMethodLabel } from "../../utils/contract-payment-method";
import { renewalCollectionState, renewalHistoryLabelKey } from "../../utils/renewal-history";
import { createIdempotencyKey } from "../../utils/contract-link";
import type { ContractDetailDto } from "../../types/contract.types";
import type { FinalReconciliationDetailDto } from "../../types/reconciliation.types";
import {
  ReconciliationCustodySection,
  ReconciliationFinancialSummary,
} from "../../forms/reconcile/reconciliation-sections";
import { ReconciliationImagePairsSection } from "../../forms/reconcile/reconciliation-images";
import styles from "./contract-detail-drawer.module.css";

function reviewSettlementAmountDue(detail: ContractDetailDto): number {
  const charges = detail.reconciliation?.finalAmount ?? 0;
  if (detail.status !== "REVIEW") return charges;
  return (
    charges +
    detail.renewals
      .filter((row) => row.collectable)
      .reduce((sum, row) => sum + row.additionalAmount, 0)
  );
}

function finalReconciliationSummaryData(detail: FinalReconciliationDetailDto) {
  return {
    totals: detail.totals,
    reconciliationChargesAmount: detail.reconciliationChargesAmount,
    outstandingRenewalAmount: detail.outstandingRenewalAmount,
    settlementAmountDue: detail.settlementAmountDue,
  };
}

export interface ContractDetailDrawerProps {
  contractId: string | null;
  onClose: () => void;
  onGenerateRentalLink: (id: string) => void;
  onCarOut: (id: string) => void;
  onCarIn: (id: string) => void;
  onReturnLink: (id: string) => void;
  onRenew: (id: string) => void;
  onReconcile: (id: string) => void;
  onCloseContract: (id: string) => void;
}

function Kv({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className={styles.kv}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

export function ContractDetailDrawer({
  contractId,
  onClose,
  onGenerateRentalLink,
  onCarOut,
  onCarIn,
  onReturnLink,
  onRenew,
  onReconcile,
  onCloseContract,
}: ContractDetailDrawerProps) {
  const t = useTranslations("Contracts");
  const td = useTranslations("Contracts.duration");
  const tPay = useTranslations("Payments");
  const format = useFormatter();
  const checkout = useStripeCheckout();
  const [providerAvailable, setProviderAvailable] = useState(true);
  const [collectRenewalId, setCollectRenewalId] = useState<string | null>(null);
  const collectKeyRef = useRef(createIdempotencyKey());
  const {
    detail,
    detailStatus,
    detailError,
    actions,
    loadContract,
    settleRenewalCash,
    renewPending,
  } = useContract();

  useEffect(() => {
    if (contractId) void loadContract(contractId);
  }, [contractId, loadContract]);

  const errorMessage = resolveContractsErrorMessage(t, detailError);
  const money = (value: number, currency: string) =>
    `${format.number(value)} ${currency}`;
  const carOutAngleLabel = (angle: string) =>
    t.has(`carOut.angle.${angle}`) ? t(`carOut.angle.${angle}`) : t(`carOutAngles.${angle}`);

  const collectRenewal =
    collectRenewalId && detail
      ? detail.renewals.find((row) => row.id === collectRenewalId) ?? null
      : null;

  return (
    <>
    <Drawer
      open={contractId != null}
      onClose={onClose}
      title={t("detail.title")}
      closeLabel={t("detail.close")}
      heading={detail?.contractNumber}
    >
      {detailStatus === "loading" || (contractId && !detail && !detailError) ? (
        <p className={styles.muted}>{t("detail.loading")}</p>
      ) : null}

      {errorMessage ? (
        <p className={styles.error} role="alert">{errorMessage}</p>
      ) : null}

      {detail ? (
        <div className={styles.root} data-testid="contract-detail">
          <div className={styles.summary}>
            <div className={styles.summaryHead}>
              <ContractStatusChip status={detail.status} />
              <CompanyIdentity company={detail.company} />
            </div>
            <Kv label={t("table.customer")} value={detail.customer?.name} />
            {detail.customer?.mobile ? (
              <Kv label={t("detail.mobile")} value={detail.customer.mobile} />
            ) : null}
            <Kv label={t("table.vehicle")} value={detail.vehicle.displayName} />
            {detail.vehicle.plateNumber ? (
              <Kv label={t("detail.plate")} value={detail.vehicle.plateNumber} />
            ) : null}
            <Kv
              label={t("detail.rentalDuration")}
              value={formatRentalDuration(
                { durationValue: detail.durationValue, durationUnit: detail.durationUnit },
                (key, values) => td(key, values),
              )}
            />
            <Kv
              label={t("detail.amount")}
              value={money(detail.agreedAmount, detail.currency)}
            />
            {detail.startAt ? (
              <Kv
                label={t("detail.start")}
                value={format.dateTime(new Date(detail.startAt), { dateStyle: "medium" })}
              />
            ) : null}
            {detail.endAt ? (
              <Kv
                label={t("detail.end")}
                value={format.dateTime(new Date(detail.endAt), { dateStyle: "medium" })}
              />
            ) : null}
          </div>

          {detail.payment ? (
            <section className={styles.section}>
              <p className={styles.sectionTitle}>{t("detail.payment")}</p>
              <Kv
                label={t("detail.paidAmount")}
                value={money(detail.payment.amount, detail.payment.currency)}
              />
              <Kv
                label={t("detail.method")}
                value={contractPaymentMethodLabel(detail.payment.method, t)}
              />
            </section>
          ) : null}

          {detail.carOut ? (
            <section className={styles.section}>
              <p className={styles.sectionTitle}>{t("detail.carOut")}</p>
              {detail.carOutHandover.actualHandoverAt ? (
                <Kv label={t("carOut.actualHandover")} value={format.dateTime(new Date(detail.carOutHandover.actualHandoverAt), { dateStyle: "medium", timeStyle: "short" })} />
              ) : null}
              <Kv label={t("carOut.mileage")} value={format.number(detail.carOut.mileageOut)} />
              <Kv label={t("carOut.fuel")} value={detail.carOut.fuelOut} />
              {detail.carOut.damageOut.length ? <Kv label={t("carOut.damage")} value={detail.carOut.damageOut.map((mark) => `${mark.zone} · ${mark.type}`).join(", ")} /> : null}
              <Kv label={t("carOut.signatureSaved")} value={detail.carOut.hirerSignatureAttachmentId ? t("carOut.signatureSaved") : t("carOut.signatureMissing")} />
              {detail.carOut.photos.length > 0 ? (
                <div className={styles.photos}>
                  {detail.carOut.photos.map((photo) => (
                    <ContractInspectionImage
                      key={photo.id}
                      path={photo.url}
                      alt={carOutAngleLabel(photo.angle)}
                      className={styles.photo}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {detail.carIn ? (
            <section className={styles.section} data-testid="contract-custody">
              <p className={styles.sectionTitle}>{t("detail.carIn")}</p>
              <p className={styles.custody}>{t("detail.carInReturned")}</p>
              <p className={styles.custodyMuted}>{t("detail.custodyEnded")}</p>
              <Kv label={t("carOut.mileage")} value={format.number(detail.carIn.mileageIn)} />
              <Kv label={t("carOut.fuel")} value={detail.carIn.fuelIn} />
              {detail.carIn.photos.length > 0 ? (
                <div className={styles.photos}>
                  {detail.carIn.photos.map((photo) => (
                    <ContractInspectionImage
                      key={photo.id}
                      path={photo.url}
                      alt={photo.angle}
                      className={styles.photo}
                    />
                  ))}
                </div>
              ) : null}
              <ContractTarsInlineStatus
                contractId={detail.id}
                operation="returnDocumentation"
                className={styles.inlineIntegration}
              />
            </section>
          ) : null}

          {detail.roadLiabilitySignals?.hasSalikGpsSignal ? (
            <section className={styles.gpsFlag} data-testid="contract-gps-salik-flag">
              <p className={styles.gpsTitle}>{t("detail.gpsSalikTitle")}</p>
              {detail.roadLiabilitySignals.unconfirmedSalikGpsSignalCount > 0 ? (
                <>
                  <p className={styles.gpsBody}>{t("detail.gpsSalikBody")}</p>
                  {detail.status === "CLOSED" ? (
                    <p className={styles.gpsBody}>{t("detail.gpsSalikClosed")}</p>
                  ) : null}
                </>
              ) : null}
            </section>
          ) : null}

          {detail.postCloseReceivables && detail.postCloseReceivables.count > 0 ? (
            <section className={styles.section} data-testid="contract-post-close">
              <p className={styles.sectionTitle}>{t("detail.postClose")}</p>
              {detail.postCloseReceivables.items.map((item) => (
                <div key={item.id} className={styles.postCloseItem}>
                  <div className={styles.kv}>
                    <span>
                      {item.roadLiabilityType === "SALIK_TOLL"
                        ? t("reconcile.type.SALIK")
                        : t("reconcile.type.VIOLATION")}
                      {" · "}
                      {item.status === "SETTLED" ? tPay("collected") : t("detail.postCloseOpen")}
                    </span>
                    <b dir="ltr">{money(item.amount, item.currency)}</b>
                  </div>
                  {item.status === "OPEN" ? (
                    <StripePaymentActions
                      providerAvailable={providerAvailable}
                      settled={false}
                      amountDue={item.amount}
                      currency={item.currency}
                      pending={checkout.pending}
                      checkoutUrl={checkout.lastCheckoutUrl}
                      onCreateLink={() => {
                        if (!detail) return;
                        void checkout
                          .runCheckout(() =>
                            startPostCloseReceivablePayment(detail.id, item.id),
                          )
                          .then((result) => {
                            setProviderAvailable(result.providerAvailable);
                            void loadContract(detail.id);
                          })
                          .catch(() => setProviderAvailable(false));
                      }}
                      onCopyLink={() => void checkout.copyCheckoutLink()}
                      onOpenLink={() => {
                        if (checkout.lastCheckoutUrl) {
                          window.open(checkout.lastCheckoutUrl, "_blank", "noopener,noreferrer");
                        }
                      }}
                    />
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}

          {detail.status === "REVIEW" && detail.reconciliation ? (
            <section className={styles.section} data-testid="contract-review-reconciliation">
              <p className={styles.sectionTitle}>{t("finalReconciliation.title")}</p>
              <p className={styles.muted}>{t("finalReconciliation.openDialogHint")}</p>
              <Kv
                label={t("finalReconciliation.finalAmountDue")}
                value={money(reviewSettlementAmountDue(detail), detail.currency)}
              />
            </section>
          ) : null}

          {detail.finalReconciliation ? (
            <section className={styles.section} data-testid="contract-final-reconciliation">
              <p className={styles.sectionTitle}>{t("finalReconciliation.title")}</p>
              <ReconciliationImagePairsSection pairs={detail.finalReconciliation.imagePairs} />
              <ReconciliationCustodySection custody={detail.finalReconciliation.custody} />
              <ReconciliationFinancialSummary
                data={finalReconciliationSummaryData(detail.finalReconciliation)}
                currency={detail.currency}
              />
              {detail.finalReconciliation.finalizedAt ? (
                <Kv
                  label={t("finalReconciliation.finalizedAt")}
                  value={format.dateTime(new Date(detail.finalReconciliation.finalizedAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                />
              ) : null}
              {detail.finalReconciliation.finalizedBy ? (
                <Kv label={t("finalReconciliation.finalizedBy")} value={detail.finalReconciliation.finalizedBy.name} />
              ) : null}
              {detail.finalReconciliation.settlement.method ? (
                <Kv
                  label={t("detail.method")}
                  value={
                    detail.finalReconciliation.settlement.method === "CASH"
                      ? t("payment.method.CASH")
                      : detail.finalReconciliation.settlement.method === "CARD"
                        ? t("payment.method.CARD")
                        : detail.finalReconciliation.settlement.method
                  }
                />
              ) : null}
            </section>
          ) : null}

          {detail.reconciliation && !detail.finalReconciliation && detail.status !== "REVIEW" ? (
            <section className={styles.section}>
              <p className={styles.sectionTitle}>{t("detail.reconciliation")}</p>
              <Kv
                label={t("reconcile.charges")}
                value={money(detail.reconciliation.chargesTotal, detail.currency)}
              />
              <Kv
                label={t("reconcile.final")}
                value={money(detail.reconciliation.finalAmount, detail.currency)}
              />
            </section>
          ) : null}

          {detail.renewals.length > 0 ? (
            <section className={styles.section} data-testid="renewal-history">
              <p className={styles.sectionTitle}>{t("detail.renewals")}</p>
              <ol className={styles.renewalList}>
                {detail.renewals.map((renewal) => {
                  const state = renewalCollectionState(renewal);
                  const stamp = renewal.approvedAt ?? renewal.createdAt;
                  const dateLabel = renewal.extensionApplied
                    ? t("detail.renewalDatesApplied")
                    : t("detail.renewalDatesPlanned");
                  return (
                    <li key={renewal.id} className={styles.renewalItem} data-renewal-state={state}>
                      <p className={styles.renewalMeta}>
                        {format.dateTime(new Date(stamp), { dateStyle: "medium", timeStyle: "short" })}
                        {" · "}
                        {t(renewalHistoryLabelKey(state))}
                        {renewal.paymentMethod
                          ? ` · ${contractPaymentMethodLabel(renewal.paymentMethod, t as never)}`
                          : null}
                      </p>
                      <p className={styles.muted}>
                        {dateLabel}:{" "}
                        {format.dateTime(new Date(renewal.previousEndAt), { dateStyle: "medium" })}
                        {" → "}
                        {format.dateTime(new Date(renewal.newEndAt), { dateStyle: "medium" })}
                      </p>
                      <p className={styles.muted}>
                        +{format.number(renewal.additionalDays)} {t("detail.days").toLowerCase()}
                        {" · "}
                        {money(renewal.additionalAmount, detail.currency)}
                      </p>
                      {state === "OFFICE_UNPAID" && detail.status !== "REVIEW" ? (
                        <>
                          <p className={styles.renewalDue}>
                            {t("detail.renewalAmountDue", {
                              amount: money(renewal.additionalAmount, detail.currency),
                            })}
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            data-testid={`renewal-collect-${renewal.id}`}
                            onClick={() => setCollectRenewalId(renewal.id)}
                          >
                            {t("detail.renewalCollect")}
                          </Button>
                        </>
                      ) : null}
                      {state === "OFFICE_UNPAID" && detail.status === "REVIEW" ? (
                        <p className={styles.muted}>{t("finalReconciliation.autoIncludedInSettlement")}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}

          <section className={styles.section}>
            <p className={styles.sectionTitle}>{t("timeline.title")}</p>
            <ContractTimeline status={detail.status} />
          </section>

          <ContractTarsStatus contractId={detail.id} />

          {actions ? (
            <div className={styles.actions}>
              {actions.showGenerateRentalLink ? (
                <Button type="button" size="sm" onClick={() => onGenerateRentalLink(detail.id)}>
                  {t("actions.rentalLink")}
                </Button>
              ) : null}
              {actions.showCarOut ? (
                <Button type="button" size="sm" onClick={() => onCarOut(detail.id)}>
                  {t("actions.carOut")}
                </Button>
              ) : null}
              {actions.showGenerateReturnLink ? (
                <Button type="button" size="sm" onClick={() => onReturnLink(detail.id)}>
                  {t("actions.returnLink")}
                </Button>
              ) : null}
              {actions.showCarIn ? (
                <Button type="button" size="sm" onClick={() => onCarIn(detail.id)}>
                  {t("actions.carIn")}
                </Button>
              ) : null}
              {actions.showReturnWaiting ? (
                <p className={styles.muted}>{t("actions.returnWaiting")}</p>
              ) : null}
              {actions.showRenew ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => onRenew(detail.id)}>
                  {t("actions.renew")}
                </Button>
              ) : null}
              {actions.showReconcile ? (
                <Button type="button" size="sm" onClick={() => onReconcile(detail.id)}>
                  {t("actions.reconcile")}
                </Button>
              ) : null}
              {detail.reconciliation &&
              reviewSettlementAmountDue(detail) > 0 &&
              !detail.reconciliation.settled ? (
                <p className={styles.muted}>{tPay("closeBlocked")}</p>
              ) : null}
              {actions.showClose ? (
                <Button type="button" size="sm" onClick={() => onCloseContract(detail.id)}>
                  {t("actions.close")}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Drawer>
    <Dialog
      open={collectRenewal != null}
      onClose={() => setCollectRenewalId(null)}
      title={t("detail.renewalCollectTitle")}
      description={t("detail.renewalCollectBody")}
      closeLabel={t("common.cancel")}
    >
      {collectRenewal && detail ? (
        <div className={styles.renewalCollectDialog}>
          <p className={styles.muted}>
            {format.dateTime(new Date(collectRenewal.previousEndAt), { dateStyle: "medium" })}
            {" → "}
            {format.dateTime(new Date(collectRenewal.newEndAt), { dateStyle: "medium" })}
          </p>
          <p className={styles.muted}>
            +{format.number(collectRenewal.additionalDays)} {t("detail.days").toLowerCase()}
          </p>
          <p>
            <b>{money(collectRenewal.additionalAmount, detail.currency)}</b>
          </p>
          <p className={styles.muted}>{t("detail.renewalCollectMethod")}</p>
          <Button
            type="button"
            size="md"
            loading={renewPending}
            onClick={() =>
              void settleRenewalCash(detail.id, collectRenewal.id, collectKeyRef.current).then(
                (ok) => {
                  if (ok) setCollectRenewalId(null);
                },
              )
            }
          >
            {t("detail.renewalCollectConfirm")}
          </Button>
        </div>
      ) : null}
    </Dialog>
    </>
  );
}
