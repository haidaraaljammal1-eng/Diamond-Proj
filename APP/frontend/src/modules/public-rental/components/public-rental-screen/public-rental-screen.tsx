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
import {
  SimulationButton,
  applyRentalSimulation,
  shouldHoldLicenseStage,
  shouldSkipRentalMutation,
  useDemoSimulation,
} from "@/modules/demo-simulation";
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
  const simulation = useDemoSimulation();
  const clearRentalOverlay = simulation.clearRentalOverlay;
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
    clearRentalOverlay();
  }, [token, clearRentalOverlay]);

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

  const context = applyRentalSimulation(rental.context, simulation.snapshot);
  const allowed = uiStageFromFlowStep(context.flow.step);
  const current: PublicRentalUiStage =
    allowed === "handover"
      ? "handover"
      : viewStage && canEnterStage(viewStage, allowed)
        ? viewStage
        : shouldHoldLicenseStage(simulation.snapshot, viewStage, allowed)
          ? "license"
          : allowed;
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
    if (!shouldSkipRentalMutation(simulation.active)) {
      void rental.uploadLicense(file);
    }
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
            {simulation.enabled ? (
              <div className={styles.simRow}>
                {current === "license" ? <SimulationButton surface="license" /> : null}
                {current === "contract" ? <SimulationButton surface="contract" /> : null}
                {current === "payment" ? <SimulationButton surface="payment" /> : null}
              </div>
            ) : null}
            {current === "license" ? (
              <LicenseStep
                context={context}
                pending={rental.uploadPending || simulation.snapshot.license.verifying}
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
                formPending={rental.formPending || simulation.snapshot.formPending}
                acceptPending={rental.acceptPending || simulation.snapshot.acceptPending}
                formError={inlineError}
                onSubmitForm={async (values) => {
                  if (shouldSkipRentalMutation(simulation.active)) {
                    await simulation.simulateFormSubmit(values);
                    return;
                  }
                  await rental.submitForm(toPublicRentalFormPayload(values));
                }}
                onAccept={async () => {
                  if (shouldSkipRentalMutation(simulation.active)) {
                    const ok = await simulation.simulateAccept();
                    if (ok) setViewStage("payment");
                    return;
                  }
                  const ok = await rental.accept();
                  if (ok) setViewStage("payment");
                }}
              />
            ) : null}

            {current === "payment" ? (
              <PaymentStep
                context={context}
                paymentStatus={
                  simulation.snapshot.payment.status ??
                  rental.paymentStatus?.status ??
                  context.payment.status
                }
                payPending={rental.payPending || simulation.snapshot.payment.payPending}
                statusPending={rental.statusPending}
                linkExpiredDuringPayment={rental.linkExpiredDuringPayment}
                onPay={() => {
                  if (shouldSkipRentalMutation(simulation.active)) {
                    void simulation.simulatePayment();
                    return;
                  }
                  void rental.startPayment();
                }}
                onRefreshStatus={() => {
                  if (shouldSkipRentalMutation(simulation.active)) return;
                  void rental.refreshPaymentStatus();
                }}
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
