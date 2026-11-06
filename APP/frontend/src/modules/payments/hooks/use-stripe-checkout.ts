"use client";

import { useCallback, useState } from "react";
import type { PaymentCheckoutDto } from "../types/payment.types";

export function useStripeCheckout() {
  const [pending, setPending] = useState(false);
  const [lastCheckoutUrl, setLastCheckoutUrl] = useState<string | null>(null);
  const [lastStatusToken, setLastStatusToken] = useState<string | null>(null);

  const storeCheckout = useCallback((checkout: PaymentCheckoutDto) => {
    const url = checkout.checkoutUrl ?? checkout.payment.checkoutUrl ?? null;
    setLastCheckoutUrl(url);
    setLastStatusToken(checkout.statusToken);
    return url;
  }, []);

  /** Opens Stripe Checkout in a new tab (staff must click explicitly). */
  const openCheckoutInNewTab = useCallback((url: string | null) => {
    if (url && typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, []);

  const runCheckout = useCallback(
    async (start: () => Promise<PaymentCheckoutDto>) => {
      setPending(true);
      try {
        const checkout = await start();
        storeCheckout(checkout);
        return checkout;
      } finally {
        setPending(false);
      }
    },
    [storeCheckout],
  );

  const copyCheckoutLink = useCallback(async (url?: string | null) => {
    const target = url ?? lastCheckoutUrl;
    if (!target || typeof navigator === "undefined") return false;
    await navigator.clipboard.writeText(target);
    return true;
  }, [lastCheckoutUrl]);

  return {
    pending,
    lastCheckoutUrl,
    lastStatusToken,
    runCheckout,
    openCheckoutInNewTab,
    storeCheckout,
    copyCheckoutLink,
  };
}
