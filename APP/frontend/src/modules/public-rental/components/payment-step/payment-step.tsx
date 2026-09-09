"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button/button";
import { Card } from "@/shared/components/ui/card/card";
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
  paymentStatus: ContractPaymentStatus | null;
  payPending: boolean;
  statusPending: boolean;
  linkExpiredDuringPayment: boolean;
  onPay: () => void;
  onRefreshStatus: () => void;
}

export function PaymentStep({
  context,
  paymentStatus,
  payPending,
  statusPending,
  linkExpiredDuringPayment,
  onPay,
  onRefreshStatus,
}: PaymentStepProps) {
  const t = useTranslations("PublicRental.payment");
  const status = paymentStatus ?? context.payment.status;
  const panel = paymentPanelFromStatus(context.payment.providerAvailable, status);
  const amount = formatRentalAmount(
    context.rental.agreedAmount,
    context.rental.currency,
  );
  const duration = formatRentalDays(context.rental.rentalDays, t("days"));
  const canPay = canStartCardPayment({
    providerAvailable: context.payment.providerAvailable,
    paymentStatus: status,
    payPending,
  });
  const isDev = process.env.NODE_ENV === "development";
  const inFlight = panel === "processing" || panel === "pending" || payPending;

  return (
    <Card data-testid="payment-step">
      <Card.Title>{t("title")}</Card.Title>
      {linkExpiredDuringPayment ? (
        <p className={styles.unavailable}>{t("linkExpiredDuring")}</p>
      ) : null}

      <div className={styles.total}>
        <span>{t("totalDue")}</span>
        <b dir="ltr">{amount}</b>
      </div>
      <p className={styles.meta}>
        {context.vehicle.displayName}
        {" · "}
        <span dir="ltr">{duration}</span>
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

      <h3 className={styles.methodsTitle}>{t("methods")}</h3>
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
      </div>

      {panel === "unavailable" || !context.payment.providerAvailable ? (
        <p className={styles.unavailable} data-testid="payment-unavailable">
          {t("unavailable")}
        </p>
      ) : null}

      {isDev && !context.payment.providerAvailable ? (
        <p className={styles.dev}>{t("devNote")}</p>
      ) : null}

      <Button
        type="button"
        className={styles.pay}
        disabled={!canPay || linkExpiredDuringPayment}
        loading={payPending}
        onClick={onPay}
      >
        {canRetryPayment(status) ? t("retry") : t("pay")}
      </Button>
    </Card>
  );
}
