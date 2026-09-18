"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button/button";
import { Card } from "@/shared/components/ui/card/card";
import { SimulationAction } from "@/modules/demo-simulation";
import type {
  ContractPaymentStatus,
  PublicRentalContext,
} from "../../types/public-rental.types";
import { formatRentalAmount, formatRentalDays } from "../../utils/format-money";
import {
  canRetryPayment,
  canStartCardLink,
  canStartCardPayment,
  maskCardLast4,
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
  /** Free Stripe-hosted card linking (no charge) request state. */
  cardLinkPending: boolean;
  cardLinkError: boolean;
  /** Notice after returning from the Stripe-hosted setup page (?card=linked|cancelled). */
  linkNotice: string | null;
  onPay: () => void;
  onLinkCard: () => void;
  onRefreshStatus: () => void;
}

export function PaymentStep({
  context,
  simulationEnabled,
  onSimulatePayment,
  paymentStatus,
  payPending,
  statusPending,
  linkExpiredDuringPayment,
  cardLinkPending,
  cardLinkError,
  linkNotice,
  onPay,
  onLinkCard,
  onRefreshStatus,
}: PaymentStepProps) {
  const t = useTranslations("PublicRental.payment");
  const status = paymentStatus ?? context.payment.status;
  const panel = paymentPanelFromStatus(context.payment.providerAvailable || simulationEnabled, status);
  const amount = formatRentalAmount(
    context.rental.agreedAmount,
    context.rental.currency,
  );
  const duration = formatRentalDays(context.rental.rentalDays, t("days"));
  const cardLinked = context.payment.cardReady;
  const canPay = canStartCardPayment({
    providerAvailable: context.payment.providerAvailable,
    cardLinked,
    paymentStatus: status,
    payPending,
  });
  const isDev = process.env.NODE_ENV === "development";
  const inFlight = panel === "processing" || panel === "pending" || payPending;
  const cardMask = maskCardLast4(context.payment.cardLast4);
  const cardBrand = context.payment.cardBrand
    ? context.payment.cardBrand.charAt(0).toUpperCase() + context.payment.cardBrand.slice(1)
    : t("cardTitle");
  const rentalPeriod =
    context.rental.startAt && context.rental.endAt
      ? `${context.rental.startAt.slice(0, 10)} - ${context.rental.endAt.slice(0, 10)}`
      : duration;
  const canLink = canStartCardLink({
    providerAvailable: context.payment.providerAvailable,
    cardLinked,
    payPending,
    cardLinkPending,
    paymentStatus: status,
  });

  return (
    <Card data-testid="payment-step">
      <Card.Title>{t("title")}</Card.Title>
      {linkExpiredDuringPayment ? (
        <p className={styles.unavailable}>{t("linkExpiredDuring")}</p>
      ) : null}
      {linkNotice ? (
        <p className={styles.notice} role="status" data-testid="payment-card-link-notice">
          {linkNotice}
        </p>
      ) : null}

      <div className={styles.total}>
        <span>{t("totalDue")}</span>
        <b dir="ltr">{amount}</b>
      </div>
      <p className={styles.meta}>
        {context.vehicle.displayName}
        {context.vehicle.vehicleType ? ` · ${context.vehicle.vehicleType}` : ""}
        {context.vehicle.plateNumber ? ` · ${context.vehicle.plateNumber}` : ""}
        {" · "}
        <span dir="ltr">{rentalPeriod}</span>
        {context.rental.startAt && context.rental.endAt ? ` · ${duration}` : ""}
      </p>
      <p className={styles.meta}>
        {t("contract")}{" "}
        <span dir="ltr">{context.contract.contractNumber}</span>
        {" · "}
        {context.office.displayName}
      </p>

      {panel === "processing" || payPending ? (
        <div className={styles.status} role="status" data-testid="payment-processing">
          <p className={styles.unavailable}>{t("processing")}</p>
          {!payPending ? (
            <Button type="button" variant="secondary" size="md" loading={statusPending} onClick={onRefreshStatus}>
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

      {!simulationEnabled ? <><h3 className={styles.methodsTitle}>{t("methods")}</h3>
      <div className={styles.methods}>
        <div
          className={styles.method}
          data-disabled={!context.payment.providerAvailable || inFlight}
          data-testid="payment-card-method"
        >
          <span className={styles.mark}>C</span>
          <div className={styles.copy}>
            <b>{t("cardTitle")}</b>
            <span>{t("cardHint")}</span>
          </div>
        </div>
      </div></> : <p className={styles.dev}>{t("devCardSetupNotice")}</p>}

      {/* Stripe-hosted card linking: prepares a saved payment method, never charges. */}
      {!simulationEnabled && cardLinked ? (
        <div className={styles.method} data-testid="payment-card-linked">
          <span className={styles.mark}>C</span>
          <div className={styles.copy}>
            <b>
              {t("cardSaved")} <span dir="ltr">{cardBrand} {cardMask}</span>
            </b>
            <span>{t("cardSavedHint")}</span>
          </div>
        </div>
      ) : !simulationEnabled && canLink ? (
        <div className={styles.linkBlock} data-testid="payment-card-link">
          <p className={styles.unavailable}>{t("linkCardHint")}</p>
          <Button
            type="button"
            variant="secondary"
            size="md"
            loading={cardLinkPending}
            disabled={cardLinkPending}
            data-testid="payment-link-card"
            onClick={onLinkCard}
          >
            {cardLinkPending ? t("linking") : t("linkCard")}
          </Button>
        </div>
      ) : null}
      {!simulationEnabled && cardLinkError ? (
        <p className={styles.unavailable} role="alert" data-testid="payment-card-link-error">
          {t("linkCardFailed")}
        </p>
      ) : null}

      {!simulationEnabled && (panel === "unavailable" || !context.payment.providerAvailable) ? (
        <p className={styles.unavailable} data-testid="payment-unavailable">
          {t("unavailable")}
        </p>
      ) : null}

      {isDev && !simulationEnabled && !context.payment.providerAvailable ? (
        <p className={styles.dev}>{t("devNote")}</p>
      ) : null}

      {!simulationEnabled ? <p className={styles.meta}>{t("secureStripe")}</p> : null}

      {!simulationEnabled ? <Button
        type="button"
        className={styles.pay}
        disabled={!canPay || linkExpiredDuringPayment}
        loading={payPending}
        onClick={onPay}
      >
        {canRetryPayment(status) ? t("retry") : t("completePayment")}
      </Button> : null}
      {simulationEnabled ? <SimulationAction label={t("simulateSuccess")} testId="simulate-payment-success" disabled={context.contract.status !== "SIGNED" || inFlight || status === "CONFIRMED" || linkExpiredDuringPayment} onClick={onSimulatePayment} /> : null}
    </Card>
  );
}
