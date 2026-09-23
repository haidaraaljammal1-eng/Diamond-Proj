"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/shared/components/ui/card/card";
import type { PublicRentalContext } from "../../types/public-rental.types";
import { formatRentalAmount } from "../../utils/format-money";
import styles from "./handover-step.module.css";

interface HandoverStepProps {
  context: PublicRentalContext;
}

export function HandoverStep({ context }: HandoverStepProps) {
  const isCash = context.collection.mode === "CASH";
  const t = useTranslations(isCash ? "PublicRental.handoverCash" : "PublicRental.handover");
  const amount = formatRentalAmount(
    context.rental.agreedAmount,
    context.rental.currency,
  );

  return (
    <Card data-testid="handover-step">
      <div className={styles.wrap}>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className={styles.body}>{t("body")}</p>
        <p className={styles.body}>
          {context.contract.contractNumber}
          {" · "}
          {context.vehicle.displayName}
          {" · "}
          <span dir="ltr">{amount}</span>
        </p>
      </div>
    </Card>
  );
}
