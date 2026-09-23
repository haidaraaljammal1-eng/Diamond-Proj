"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button/button";
import { Card } from "@/shared/components/ui/card/card";
import { Checkbox } from "@/shared/components/ui/checkbox/checkbox";
import { SimulationAction } from "@/modules/demo-simulation";
import type {
  ContractPaymentStatus,
  PublicRentalContext,
} from "../../types/public-rental.types";
import { formatRentalAmount, formatRentalDays } from "../../utils/format-money";
import {
  canRetryPayment,
  canStartCardPayment,
  paymentPanelFromStatus,
} from "../../utils/payment-view";
import styles from "./payment-step.module.css";

interface PaymentStepProps {
  context: PublicRentalContext;
  simulationEnabled: boolean;
  onSimulatePayment: () => void;
  paymentStatus: ContractPaymentStatus | null;
  payPending: boolean;
  statusPending: boolean;
  linkExpiredDuringPayment: boolean;
  paymentNotice: string | null;
  paymentError: string | null;
  onPay: (savePaymentMethodForFutureUse: boolean) => void;
  onRefreshStatus: () => void;
}

function formatRentalPeriod(
  startAt: string | null,
  endAt: string | null,
  durationLabel: string,
): string {
  if (startAt && endAt) {
    const start = startAt.slice(0, 10);
    const end = endAt.slice(0, 10);
    return `${start} → ${end} · ${durationLabel}`;
  }
  return durationLabel;
}

export function PaymentStep({
  context,
  simulationEnabled,
  onSimulatePayment,
  paymentStatus,
  payPending,
  statusPending,
  linkExpiredDuringPayment,
  paymentNotice,
  paymentError,
  onPay,
  onRefreshStatus,
}: PaymentStepProps) {
  const t = useTranslations("PublicRental.payment");
  const [saveForFutureUse, setSaveForFutureUse] = useState(false);
  const status = paymentStatus ?? context.payment.status;
  const panel = paymentPanelFromStatus(context.payment.providerAvailable || simulationEnabled, status);
  const amount = formatRentalAmount(context.rental.agreedAmount, context.rental.currency);
  const duration = formatRentalDays(context.rental.rentalDays, t("days"));
  const canPay = canStartCardPayment({
    providerAvailable: context.payment.providerAvailable,
    paymentStatus: status,
    payPending,
    contractStatus: context.contract.status,
    checkoutRecoverable: context.payment.checkoutRecoverable,
  });
  const futureUseConsentAvailable = context.payment.futureUseConsentAvailable;
  const futureUseConsent = context.payment.futureUseConsent;
  const isDev = process.env.NODE_ENV === "development";
  const inFlight = panel === "processing" || panel === "pending" || payPending;
  const stripeCheckoutAvailable = context.payment.providerAvailable;
  const vehicleLine = [
    context.vehicle.displayName,
    context.vehicle.plateNumber,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card data-testid="payment-step">
      <Card.Title>{t("title")}</Card.Title>

      {linkExpiredDuringPayment ? (
        <p className={styles.unavailable}>{t("linkExpiredDuring")}</p>
      ) : null}
      {paymentNotice ? (
        <p className={styles.notice} role="status" data-testid="payment-notice">
          {paymentNotice}
        </p>
      ) : null}
      {paymentError ? (
        <p className={styles.unavailable} role="alert" data-testid="payment-error">
          {paymentError}
        </p>
      ) : null}

      <dl className={styles.summary}>
        <div className={styles.summaryRow}>
          <dt>{t("contractLabel")}</dt>
          <dd dir="ltr">{context.contract.contractNumber}</dd>
        </div>
        <div className={styles.summaryRow}>
          <dt>{t("companyLabel")}</dt>
          <dd>{context.office.company.displayName}</dd>
        </div>
        <div className={styles.summaryRow}>
          <dt>{t("vehicleLabel")}</dt>
          <dd>{vehicleLine}</dd>
        </div>
        <div className={styles.summaryRow}>
          <dt>{t("periodLabel")}</dt>
          <dd dir="ltr">
            {formatRentalPeriod(context.rental.startAt, context.rental.endAt, duration)}
          </dd>
        </div>
      </dl>

      <div className={styles.amountHero} data-testid="payment-amount-due">
        <span className={styles.amountLabel}>{t("amountDueNow")}</span>
        <b dir="ltr">{amount}</b>
      </div>

      {panel === "processing" || payPending ? (
        <div className={styles.status} role="status" data-testid="payment-processing">
          <p className={styles.unavailable}>{payPending ? t("preparing") : t("processing")}</p>
          {!payPending ? (
            <Button
              type="button"
              variant="secondary"
              size="md"
              loading={statusPending}
              onClick={onRefreshStatus}
            >
              {t("checkStatus")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {panel === "pending" ? (
        <div className={styles.status} role="status" data-testid="payment-pending">
          <p className={styles.unavailable}>{t("pending")}</p>
          <Button
            type="button"
            variant="secondary"
            size="md"
            loading={statusPending}
            onClick={onRefreshStatus}
          >
            {t("checkStatus")}
          </Button>
        </div>
      ) : null}

      {panel === "failed" ? (
        <div className={styles.status} role="alert" data-testid="payment-failed">
          <p className={styles.unavailable}>{t("failed")}</p>
        </div>
      ) : null}

      {panel === "cancelled" ? (
        <div className={styles.status} data-testid="payment-cancelled">
          <p className={styles.unavailable}>{t("cancelled")}</p>
        </div>
      ) : null}

      {panel === "confirmed" ? (
        <div className={styles.status} data-testid="payment-confirmed">
          <p className={styles.unavailable}>{t("confirmed")}</p>
        </div>
      ) : null}

      {stripeCheckoutAvailable ? (
        <>
          <p className={styles.secure}>{t("secureStripe")}</p>
          <p className={styles.stripeMethod}>{t("stripeMethod")}</p>
          {futureUseConsentAvailable && futureUseConsent ? (
            <label className={styles.consent} data-testid="payment-future-use-consent">
              <Checkbox
                checked={saveForFutureUse}
                onChange={(event) => setSaveForFutureUse(event.target.checked)}
                disabled={inFlight || linkExpiredDuringPayment}
                aria-label={t("futureUseConsentTitle")}
              />
              <span>
                <b>{t("futureUseConsentOptional")}</b>
                <span className={styles.consentHint}>{futureUseConsent.text}</span>
                <span className={styles.consentLegal}>{t("futureUseConsentLegal")}</span>
              </span>
            </label>
          ) : !futureUseConsentAvailable ? (
            <p className={styles.consentUnavailable} data-testid="payment-consent-unavailable">
              {t("futureUseConsentUnavailable")}
            </p>
          ) : null}
        </>
      ) : simulationEnabled ? (
        <p className={styles.dev}>{t("devCardSetupNotice")}</p>
      ) : null}

      {!stripeCheckoutAvailable && panel === "unavailable" ? (
        <p className={styles.unavailable} data-testid="payment-unavailable">
          {t("unavailable")}
        </p>
      ) : null}

      {isDev && !stripeCheckoutAvailable ? (
        <p className={styles.dev}>{t("devNote")}</p>
      ) : null}

      {stripeCheckoutAvailable ? (
        <Button
          type="button"
          className={styles.pay}
          variant="primary"
          disabled={!canPay || linkExpiredDuringPayment}
          loading={payPending}
          data-testid="payment-pay-stripe"
          onClick={() => onPay(futureUseConsentAvailable && saveForFutureUse)}
        >
          {payPending
            ? t("openingCheckout")
            : canRetryPayment(status)
              ? t("retry")
              : t("payNowStripe")}
        </Button>
      ) : null}
      {simulationEnabled && !stripeCheckoutAvailable ? (
        <SimulationAction
          label={t("simulateSuccess")}
          testId="simulate-payment-success"
          disabled={
            context.contract.status !== "SIGNED" ||
            inFlight ||
            status === "CONFIRMED" ||
            linkExpiredDuringPayment
          }
          onClick={onSimulatePayment}
        />
      ) : null}
    </Card>
  );
}
