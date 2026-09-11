"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { getPublicPaymentStatus } from "@/modules/payments/api/payments.api";

function PaymentCallbackContent() {
  const t = useTranslations("Payments.callback");
  const searchParams = useSearchParams();
  const statusToken = searchParams.get("statusToken");
  const outcome = searchParams.get("outcome");
  const [message, setMessage] = useState(t("checking"));

  useEffect(() => {
    if (!statusToken) {
      setMessage(t("failed"));
      return;
    }
    if (outcome === "cancel") {
      setMessage(t("cancelled"));
      return;
    }
    void getPublicPaymentStatus(statusToken)
      .then((result) => {
        if (result.status === "CONFIRMED") setMessage(t("success"));
        else if (result.status === "CANCELLED") setMessage(t("cancelled"));
        else setMessage(t("failed"));
      })
      .catch(() => setMessage(t("failed")));
  }, [outcome, statusToken, t]);

  return (
    <main style={{ margin: "2rem auto", maxWidth: 480, padding: "0 1rem" }}>
      <h1>{t("title")}</h1>
      <p role="status">{message}</p>
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
