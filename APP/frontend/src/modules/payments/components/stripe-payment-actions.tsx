"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button/button";

interface StripePaymentActionsProps {
  providerAvailable: boolean;
  settled: boolean;
  amountDue: number;
  currency: string;
  pending: boolean;
  checkoutUrl: string | null;
  onCreateLink: () => void;
  onCopyLink: () => void;
  onOpenLink: () => void;
}

export function StripePaymentActions({
  providerAvailable,
  settled,
  amountDue,
  currency,
  pending,
  checkoutUrl,
  onCreateLink,
  onCopyLink,
  onOpenLink,
}: StripePaymentActionsProps) {
  const t = useTranslations("Payments");

  if (amountDue <= 0) {
    return <p className="text-sm text-muted-foreground">{t("noPaymentRequired")}</p>;
  }

  if (settled) {
    return <p className="text-sm font-medium">{t("paid")}</p>;
  }

  if (!providerAvailable) {
    return <p className="text-sm text-muted-foreground">{t("unavailable")}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{t("paymentRequired")}</p>
      <p className="text-sm" dir="ltr">
        {amountDue} {currency}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" loading={pending} onClick={onCreateLink}>
          {t("createLink")}
        </Button>
        {checkoutUrl ? (
          <>
            <Button type="button" variant="secondary" size="sm" onClick={onCopyLink}>
              {t("copyLink")}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={onOpenLink}>
              {t("openLink")}
            </Button>
          </>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{t("providerStripe")}</p>
    </div>
  );
}
