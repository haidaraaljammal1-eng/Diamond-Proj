"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button/button";
import { Card } from "@/shared/components/ui/card/card";
import { usePublicReturn } from "../../hooks/use-public-return";
import { canConfirmReturn, isReturnConfirmedStatus, isReturnReceivedStatus } from "../../utils/return-view";
import {
  isReturnLinkGoneReason,
  publicReturnErrorReason,
  resolvePublicReturnErrorMessage,
} from "../../utils/resolve-public-return-error";
import { ReturnHeader } from "../return-header/return-header";
import { ReturnLinkError } from "../return-link-error/return-link-error";
import styles from "./public-return-screen.module.css";

interface PublicReturnScreenProps {
  token: string;
}

function errorTranslator(t: ReturnType<typeof useTranslations<"PublicReturn">>) {
  const translate = ((key: string) => t(key as never)) as ((key: string) => string) & {
    has: (key: string) => boolean;
  };
  translate.has = (key: string) => t.has(key as never);
  return translate;
}

export function PublicReturnScreen({ token }: PublicReturnScreenProps) {
  const t = useTranslations("PublicReturn");
  const format = useFormatter();
  const ret = usePublicReturn(token);

  const reason = publicReturnErrorReason(ret.error);
  const linkGone = isReturnLinkGoneReason(reason);

  if (ret.status === "error" && linkGone) {
    return <ReturnLinkError reason={reason} />;
  }

  if (ret.status === "error") {
    return (
      <div className={styles.root}>
        <div className={styles.shell}>
          <ReturnHeader officeName={t("fallbackOffice")} />
          <Card>
            <p>{resolvePublicReturnErrorMessage(errorTranslator(t), ret.error)}</p>
            <Button type="button" size="md" onClick={() => void ret.load(token)}>
              {t("retry")}
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  if (ret.status !== "ready" || !ret.view) {
    return (
      <div className={styles.root} data-testid="public-return">
        <div className={styles.shell}>
          <ReturnHeader officeName={t("fallbackOffice")} />
          <p className={styles.loading}>{t("loading")}</p>
        </div>
      </div>
    );
  }

  const view = ret.view;
  const received = isReturnReceivedStatus(view.status);
  const confirmable = canConfirmReturn(view.status);
  const confirmed = isReturnConfirmedStatus(view.status);
  const title = received ? t("receivedTitle") : confirmed ? t("confirmedTitle") : t("title");
  const money = `${format.number(view.agreedAmount)} ${view.currency}`;
  const returnAt = view.endAt
    ? format.dateTime(new Date(view.endAt), { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <div className={styles.root} data-testid="public-return">
      <div className={styles.shell}>
        <ReturnHeader officeName={view.office.displayName} />
        <Card>
          <h1 className={styles.title}>{title}</h1>
          <dl className={styles.facts}>
            <div>
              <dt>{t("office")}</dt>
              <dd>{view.office.displayName}</dd>
            </div>
            <div>
              <dt>{t("contractNumber")}</dt>
              <dd>{view.contractNumber}</dd>
            </div>
            <div>
              <dt>{t("vehicle")}</dt>
              <dd>{view.vehicle.displayName}</dd>
            </div>
            {view.vehicle.plateNumber ? (
              <div>
                <dt>{t("plate")}</dt>
                <dd>{view.vehicle.plateNumber}</dd>
              </div>
            ) : null}
            {returnAt ? (
              <div>
                <dt>{t("agreedReturn")}</dt>
                <dd>{returnAt}</dd>
              </div>
            ) : null}
            <div>
              <dt>{t("agreedAmount")}</dt>
              <dd>{money}</dd>
            </div>
          </dl>
          {confirmable ? (
            <div className={styles.confirm}>
              <p className={styles.instructions}>{t("activeBody")}</p>
              <p className={styles.hint}>{t("extendHint")}</p>
              {ret.confirmError ? (
                <p className={styles.error} role="alert">
                  {resolvePublicReturnErrorMessage(errorTranslator(t), ret.confirmError)}
                </p>
              ) : null}
              <Button type="button" size="lg" loading={ret.confirming} onClick={() => void ret.confirm()}>
                {t("confirmReturn")}
              </Button>
            </div>
          ) : (
            <p className={styles.instructions}>
              {received ? t("receivedBody") : t("instructions")}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
