"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { getPublicPaymentStatus } from "@/modules/payments/api/payments.api";
import type { PaymentStatusDto } from "@/modules/payments/types/payment.types";
import {
  isPaymentCallbackVerified,
  resolveCallbackAmountLabelKey,
  resolveCallbackMessage,
  resolveCallbackPageTitleKey,
  shouldShowRentalHandoverCopy,
} from "@/modules/payments/utils/payment-callback.utils";

function PaymentCallbackContent() {
  const t = useTranslations("Payments.callback");
  const searchParams = useSearchParams();
  const statusToken = searchParams.get("statusToken");
  const [status, setStatus] = useState<PaymentStatusDto | null>(null);
  const [failedToken, setFailedToken] = useState<string | null>(null);

  useEffect(() => {
    if (!statusToken) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      try {
        const result = await getPublicPaymentStatus(statusToken);
        if (cancelled) return;
        setStatus(result);
        setFailedToken(null);
        if (result.status === "PENDING" || result.status === "PROCESSING") {
          timer = setTimeout(check, 3000);
        }
      } catch {
        if (cancelled) return;
        setFailedToken(statusToken);
        timer = setTimeout(check, 5000);
      }
    };
    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [statusToken]);

  const paymentVerified = isPaymentCallbackVerified(status);
  const showRentalHandover = shouldShowRentalHandoverCopy(status);
  const authIncomplete =
    showRentalHandover &&
    paymentVerified &&
    status?.summary?.rentalPaymentAuthorizationState === "incomplete";
  const summary = paymentVerified ? status?.summary : null;
  const message = resolveCallbackMessage(status, failedToken, statusToken, t);
  const pageTitleKey = resolveCallbackPageTitleKey(status, paymentVerified);
  const amountLabelKey = resolveCallbackAmountLabelKey(status, paymentVerified);
  const card =
    summary?.cardLast4
      ? `${summary.cardBrand ?? "Card"} \u2022\u2022\u2022\u2022 ${summary.cardLast4}`
      : null;

  return (
    <main style={{ margin: "2rem auto", maxWidth: 480, padding: "0 1rem" }}>
      <h1>{t(pageTitleKey)}</h1>
      <p role="status">{summary ? `\u2713 ${message}` : message}</p>
      {authIncomplete ? (
        <p role="status" className="payment-callback-info">
          {t("savedCardUnavailableInfo")}
        </p>
      ) : null}
      {(status?.status === "PROCESSING" || status?.status === "PENDING") && status.checkoutUrl ? (
        <p><a href={status.checkoutUrl}>{t("continueCheckout")}</a></p>
      ) : null}
      {summary ? (
        <>
          <dl>
            <dt>{t("contract")}</dt>
            <dd dir="ltr">{summary.contractNumber}</dd>
            <dt>{t("vehicle")}</dt>
            <dd>
              {summary.vehicle.displayName}
              {summary.vehicle.plateNumber ? ` - ${summary.vehicle.plateNumber}` : ""}
            </dd>
            <dt>{t(amountLabelKey)}</dt>
            <dd dir="ltr">
              {summary.currency} {summary.amount.toLocaleString("en-US")}
            </dd>
            {card ? (
              <>
                <dt>{t("card")}</dt>
                <dd dir="ltr">{card}</dd>
              </>
            ) : null}
          </dl>
          {showRentalHandover ? (
            <>
              <p>{t("readyForHandover")}</p>
              {summary.paymentMethodSavedForFutureUse ? (
                <p role="status">{t("paymentMethodSaved")}</p>
              ) : authIncomplete ? (
                <p role="status">{t("savedCardNotAvailable")}</p>
              ) : null}
            </>
          ) : status?.purpose === "RENEWAL" ? (
            <p>{t("renewalExtensionApplied")}</p>
          ) : null}
        </>
      ) : null}
    </main>
  );
}

export default function PaymentCallbackPage() {
  const t = useTranslations("Payments.callback");

  return (
    <Suspense
      fallback={
        <main style={{ margin: "2rem auto", maxWidth: 480, padding: "0 1rem" }}>
          <h1>{t("title")}</h1>
          <p role="status">{t("checking")}</p>
        </main>
      }
    >
      <PaymentCallbackContent />
    </Suspense>
  );
}
