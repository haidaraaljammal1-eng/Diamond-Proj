"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button/button";
import { Card } from "@/shared/components/ui/card/card";
import { usePublicRental } from "../../hooks/use-public-rental";
import type { PublicRentalUiStage } from "../../types/public-rental.types";
import { toPublicRentalFormPayload } from "../../utils/to-form-payload";
import { canEnterStage, isLinkGoneReason, uiStageFromFlowStep } from "../../utils/flow-step";
import { isAcceptedLicenseFile } from "../../utils/license-file";
import {
  publicRentalErrorReason,
  resolvePublicRentalErrorMessage,
} from "../../utils/resolve-public-rental-error";
import { ContractStep } from "../contract-step/contract-step";
import { HandoverStep } from "../handover-step/handover-step";
import { LicenseStep } from "../license-step/license-step";
import { PaymentStep } from "../payment-step/payment-step";
import { RentalHeader } from "../rental-header/rental-header";
import { RentalLinkError } from "../rental-link-error/rental-link-error";
import { RentalProgress } from "../rental-progress/rental-progress";
import { RentalSummary } from "../rental-summary/rental-summary";
import styles from "./public-rental-screen.module.css";

interface PublicRentalScreenProps {
  token: string;
}

function errorTranslator(t: ReturnType<typeof useTranslations<"PublicRental">>) {
  const translate = ((key: string) => t(key as never)) as ((key: string) => string) & {
    has: (key: string) => boolean;
  };
  translate.has = (key: string) => t.has(key as never);
  return translate;
}

export function PublicRentalScreen({ token }: PublicRentalScreenProps) {
  const t = useTranslations("PublicRental");
  const rental = usePublicRental(token);
  const [boundToken, setBoundToken] = useState(token);
  const [viewStage, setViewStage] = useState<PublicRentalUiStage | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileHint, setFileHint] = useState<string | null>(null);

  if (boundToken !== token) {
    setBoundToken(token);
    setViewStage(null);
    setFileHint(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const reason = publicRentalErrorReason(rental.error);
  const linkGone = isLinkGoneReason(reason);

  if (rental.status === "error" && linkGone) {
    return <RentalLinkError reason={reason} />;
  }

  if (rental.status === "error") {
    return (
      <div className={styles.root}>
        <div className={styles.shell}>
          <RentalHeader officeName={t("fallbackOffice")} />
          <Card>
            <p>{resolvePublicRentalErrorMessage(errorTranslator(t), rental.error)}</p>
            <Button type="button" size="md" onClick={() => void rental.load(token)}>
              {t("retry")}
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  if (rental.status !== "ready" || !rental.context) {
    return (
      <div className={styles.root}>
        <div className={styles.shell}>
          <RentalHeader officeName={t("fallbackOffice")} />
          <p className={styles.loading}>{t("loading")}</p>
        </div>
      </div>
    );
  }

  const context = rental.context;
  const allowed = uiStageFromFlowStep(context.flow.step);
  const current: PublicRentalUiStage =
    viewStage && canEnterStage(viewStage, allowed) ? viewStage : allowed;
  const inlineError = resolvePublicRentalErrorMessage(
    errorTranslator(t),
    rental.error,
  );

  const handleFile = (file: File) => {
    setFileHint(null);
    if (!isAcceptedLicenseFile(file)) {
      setFileHint(t("license.invalidFile"));
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setViewStage("license");
    void rental.uploadLicense(file);
  };

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <RentalHeader officeName={context.office.displayName} />
        {allowed !== "handover" ? (
          <RentalProgress
            allowed={allowed}
            current={current === "handover" ? "payment" : current}
            onSelect={setViewStage}
          />
        ) : null}

        <div className={styles.layout}>
          <div className={styles.main}>
            {current === "license" ? (
              <LicenseStep
                context={context}
                pending={rental.uploadPending}
                previewUrl={previewUrl}
                readOnly={
                  context.contract.status !== "AWAITING" &&
                  context.contract.status !== "FORM"
                }
                fileHint={fileHint ?? (current === "license" ? inlineError : null)}
                onFile={handleFile}
                onContinue={() => setViewStage("contract")}
              />
            ) : null}

            {current === "contract" ? (
              <ContractStep
                context={context}
                formPending={rental.formPending}
                acceptPending={rental.acceptPending}
                formError={inlineError}
                onSubmitForm={async (values) => {
                  await rental.submitForm(toPublicRentalFormPayload(values));
                }}
                onAccept={async () => {
                  const ok = await rental.accept();
                  if (ok) setViewStage("payment");
                }}
              />
            ) : null}

            {current === "payment" ? (
              <PaymentStep
                context={context}
                paymentStatus={rental.paymentStatus?.status ?? context.payment.status}
                payPending={rental.payPending}
                statusPending={rental.statusPending}
                linkExpiredDuringPayment={rental.linkExpiredDuringPayment}
                onPay={() => void rental.startPayment()}
                onRefreshStatus={() => void rental.refreshPaymentStatus()}
              />
            ) : null}

            {current === "handover" ? <HandoverStep context={context} /> : null}
          </div>
          <aside className={styles.aside}>
            <RentalSummary context={context} />
          </aside>
        </div>
      </div>
    </div>
  );
}
