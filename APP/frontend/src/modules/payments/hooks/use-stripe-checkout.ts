"use client";

import { useCallback, useState } from "react";
import type { PaymentCheckoutDto } from "../types/payment.types";

export function useStripeCheckout() {
  const [pending, setPending] = useState(false);
  const [lastCheckoutUrl, setLastCheckoutUrl] = useState<string | null>(null);
  const [lastStatusToken, setLastStatusToken] = useState<string | null>(null);

  const openCheckout = useCallback((checkout: PaymentCheckoutDto) => {
    const url = checkout.checkoutUrl ?? checkout.payment.checkoutUrl ?? null;
    setLastCheckoutUrl(url);
    setLastStatusToken(checkout.statusToken);
    if (url && typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    return url;
  }, []);

  const runCheckout = useCallback(
    async (start: () => Promise<PaymentCheckoutDto>) => {
      setPending(true);
      try {
        const checkout = await start();
        openCheckout(checkout);
        return checkout;
      } finally {
        setPending(false);
      }
    },
    [openCheckout],
  );

  const copyCheckoutLink = useCallback(async () => {
    if (!lastCheckoutUrl || typeof navigator === "undefined") return false;
    await navigator.clipboard.writeText(lastCheckoutUrl);
    return true;
  }, [lastCheckoutUrl]);

  return {
    pending,
    lastCheckoutUrl,
    lastStatusToken,
    runCheckout,
    openCheckout,
    copyCheckoutLink,
  };
}
