"use client";

import { useEffect } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Icon } from "@/shared/components/ui/icon";
import { resolvePublicRentalErrorMessage } from "@/modules/public-rental/utils/resolve-public-rental-error";
import type { PublicReconciliationReadDto } from "@/modules/contracts/types/reconciliation.types";
import { usePublicReconciliation } from "../../hooks/use-public-reconciliation";
import styles from "./public-reconciliation-screen.module.css";

export function PublicReconciliationScreen({ token }: { token: string }) {
  const t = useTranslations("PublicReconciliation");
  const format = useFormatter();
  const reconciliation = usePublicReconciliation(token);

  useEffect(() => {
    void reconciliation.load(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const errorTranslator = Object.assign(
    (key: string) => t(key as never),
    { has: (key: string) => t.has(key as never) },
  );
  const errorMessage = resolvePublicRentalErrorMessage(errorTranslator, reconciliation.error);

  if (reconciliation.status === "loading" || !reconciliation.data) {
    return <p className={styles.muted}>{errorMessage ?? t("loading")}</p>;
  }

  if (reconciliation.status === "error") {
    return (
      <Card className={styles.card} data-testid="public-reconciliation-error">
        <h1>{t("title")}</h1>
        <p>{errorMessage ?? t("error.generic")}</p>
      </Card>
    );
  }

  const data = reconciliation.data;
  const completed = data.payment.settled || !data.payment.required;
  const payError = resolvePublicRentalErrorMessage(errorTranslator, reconciliation.payError);

  return (
    <main className={styles.page} data-testid="public-reconciliation-screen">
      <Card className={styles.card}>
        <header className={styles.header}>
          <h1>{t("title")}</h1>
          <p>{data.contractNumber}</p>
          <p>{data.vehicle.displayName}{data.vehicle.plateNumber ? ` · ${data.vehicle.plateNumber}` : ""}</p>
        </header>

        <section className={styles.breakdown}>
          <h2>{t("detailsTitle")}</h2>
          <ul className={styles.lineList}>
            {data.lines.map((line: PublicReconciliationReadDto["lines"][number], index: number) => (
              <li key={`${line.type}-${index}`}>
                <span>{line.description}</span>
                <span dir="ltr">{format.number(line.amount)} AED</span>
              </li>
            ))}
          </ul>
          <p className={styles.finalAmount}>
            <span>{t("finalAmount")}</span>
            <span dir="ltr">{format.number(data.finalAmount)} AED</span>
          </p>
        </section>

        {completed ? (
          <section className={styles.completedPanel} data-testid="public-reconciliation-completed">
            <div className={styles.completedHeader}>
              <Icon name="mdi:check-circle-outline" size={22} aria-hidden />
              <h2>{t("completedTitle")}</h2>
            </div>
            <p className={styles.completedMessage}>{t("completedMessage")}</p>
            <p className={styles.completedAmount}>
              <span>{t("paidAmount")}</span>
              <span dir="ltr">{format.number(data.finalAmount)} AED</span>
            </p>
          </section>
        ) : (
          <>
            {payError ? <p className={styles.error}>{payError}</p> : null}
            <Button
              type="button"
              size="md"
              loading={reconciliation.payPending}
              onClick={() => void reconciliation.continueToPayment(token)}
            >
              {t("continueToPayment")}
            </Button>
          </>
        )}
      </Card>
    </main>
  );
}
