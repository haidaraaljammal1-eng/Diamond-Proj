"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { getPublicPaymentStatus } from "@/modules/payments/api/payments.api";
import type { PaymentStatusDto } from "@/modules/payments/types/payment.types";

function PaymentCallbackContent() {
  const t = useTranslations("Payments.callback");
  const searchParams = useSearchParams();
  const statusToken = searchParams.get("statusToken");
  const outcome = searchParams.get("outcome");
  const [status, setStatus] = useState<PaymentStatusDto | null>(null);
  const [failedToken, setFailedToken] = useState<string | null>(null);

  useEffect(() => {
    if (!statusToken || outcome === "cancel") return;
    void getPublicPaymentStatus(statusToken)
      .then((result) => {
        setStatus(result);
      })
      .catch(() => setFailedToken(statusToken));
  }, [outcome, statusToken]);

  const summary = status?.status === "CONFIRMED" ? status.summary : null;
  const message =
    !statusToken || failedToken === statusToken
      ? t("failed")
      : outcome === "cancel" || status?.status === "CANCELLED"
        ? t("cancelled")
        : status?.status === "CONFIRMED"
          ? t("success")
          : status
            ? t("failed")
            : t("checking");
  const card =
    summary?.cardLast4
      ? `${summary.cardBrand ?? "Card"} \u2022\u2022\u2022\u2022 ${summary.cardLast4}`
      : null;

  return (
    <main style={{ margin: "2rem auto", maxWidth: 480, padding: "0 1rem" }}>
      <h1>{t("title")}</h1>
      <p role="status">{summary ? `\u2713 ${message}` : message}</p>
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
            <dt>{t("amountPaid")}</dt>
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
          <p>{t("readyForHandover")}</p>
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
