"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button/button";
import { Card } from "@/shared/components/ui/card/card";
import { usePublicRenewal } from "../../hooks/use-public-renewal";
import {
  isRenewalLinkGoneReason,
  publicRenewalErrorReason,
  resolvePublicRenewalErrorMessage,
} from "../../utils/resolve-public-renewal-error";
import { RenewalHeader } from "../renewal-header/renewal-header";
import { RenewalLinkError } from "../renewal-link-error/renewal-link-error";
import styles from "./public-renewal-screen.module.css";

interface PublicRenewalScreenProps {
  token: string;
}

function errorTranslator(t: ReturnType<typeof useTranslations<"PublicRenewal">>) {
  const translate = ((key: string) => t(key as never)) as ((key: string) => string) & {
    has: (key: string) => boolean;
  };
  translate.has = (key: string) => t.has(key as never);
  return translate;
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function PublicRenewalScreen({ token }: PublicRenewalScreenProps) {
  const t = useTranslations("PublicRenewal");
  const format = useFormatter();
  const renewal = usePublicRenewal(token);

  const reason = publicRenewalErrorReason(renewal.error);
  const linkGone = isRenewalLinkGoneReason(reason);

  if (renewal.status === "error" && linkGone) {
    return <RenewalLinkError reason={reason} />;
  }

  if (renewal.status === "error") {
    return (
      <div className={styles.root}>
        <div className={styles.shell}>
          <RenewalHeader officeName={t("fallbackOffice")} />
          <Card>
            <p>{resolvePublicRenewalErrorMessage(errorTranslator(t), renewal.error)}</p>
            <Button type="button" size="md" onClick={() => void renewal.load(token)}>
              {t("retry")}
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  if (renewal.status !== "ready" || !renewal.view) {
    return (
      <div className={styles.root} data-testid="public-renewal">
        <div className={styles.shell}>
          <RenewalHeader officeName={t("fallbackOffice")} />
          <p className={styles.loading}>{t("loading")}</p>
        </div>
      </div>
    );
  }

  const view = renewal.view;
  const offer = view.renewal ?? null;
  const confirmed = Boolean(offer?.confirmed);
  const money = (value: number) => `${format.number(value)} ${view.currency}`;
  const when = (value: string | null | undefined) =>
    value
      ? format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" })
      : null;

  const confirmError =
    renewal.error && !isRenewalLinkGoneReason(publicRenewalErrorReason(renewal.error))
      ? resolvePublicRenewalErrorMessage(errorTranslator(t), renewal.error)
      : null;

  return (
    <div className={styles.root} data-testid="public-renewal">
      <div className={styles.shell}>
        <RenewalHeader officeName={view.office.displayName} />
        <Card>
          <h1 className={styles.title} data-testid={confirmed ? "renewal-success" : "renewal-title"}>
            {confirmed ? t("successTitle") : t("title")}
          </h1>
          {confirmed ? <p className={styles.instructions}>{t("successBody")}</p> : null}

          <section className={styles.block} data-testid="current-rental">
            <h2 className={styles.sectionTitle}>{t("currentRental")}</h2>
            <dl className={styles.facts}>
              <Fact label={t("office")} value={view.office.displayName} />
              <Fact label={t("contractNumber")} value={view.contractNumber} />
              <Fact label={t("vehicle")} value={view.vehicle.displayName} />
              <Fact label={t("plate")} value={view.vehicle.plateNumber} />
              <Fact
                label={t("duration")}
                value={t("daysValue", { count: view.rentalDays })}
              />
              <Fact label={t("end")} value={when(view.endAt)} />
              <Fact label={t("agreedAmount")} value={money(view.agreedAmount)} />
              <Fact label={t("currency")} value={view.currency} />
            </dl>
          </section>

          {offer ? (
            <section className={styles.block} data-testid="renewal-offer">
              <h2 className={styles.sectionTitle}>{t("renewalOffer")}</h2>
              <dl className={styles.facts}>
                <Fact
                  label={t("extension")}
                  value={t("daysValue", { count: offer.additionalDays })}
                />
                <Fact label={t("previousEnd")} value={when(offer.previousEndAt)} />
                <Fact label={t("newEnd")} value={when(offer.newEndAt)} />
                <Fact label={t("renewalAmount")} value={money(offer.additionalAmount)} />
                <Fact label={t("currency")} value={view.currency} />
              </dl>
            </section>
          ) : (
            <p className={styles.instructions}>{t("missingOffer")}</p>
          )}

          {confirmError ? <p className={styles.error} role="alert">{confirmError}</p> : null}

          {!confirmed && offer ? (
            <Button
              type="button"
              size="md"
              loading={renewal.confirmPending}
              data-testid="renewal-confirm"
              onClick={() => void renewal.confirm(token)}
            >
              {t("confirm")}
            </Button>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
