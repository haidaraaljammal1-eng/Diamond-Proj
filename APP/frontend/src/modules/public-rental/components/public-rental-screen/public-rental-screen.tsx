"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button/button";
import { Card } from "@/shared/components/ui/card/card";
import { usePublicRental } from "../../hooks/use-public-rental";
import type { PublicRentalUiStage } from "../../types/public-rental.types";
import { canEnterStage, isLinkGoneReason, uiStageFromFlowStep } from "../../utils/flow-step";
import { isAcceptedLicenseFile } from "../../utils/license-file";
import {
  publicRentalErrorReason,
  resolvePublicRentalErrorMessage,
} from "../../utils/resolve-public-rental-error";
import { ContractReviewStep } from "../contract-review-step/contract-review-step";
import { HandoverStep } from "../handover-step/handover-step";
import { LicenseStep } from "../license-step/license-step";
import { PassportStep } from "../passport-step/passport-step";
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
  const [passportPreviewUrl, setPassportPreviewUrl] = useState<string | null>(null);
  const [passportHint, setPassportHint] = useState<string | null>(null);
  // Notice after returning from the free Stripe-hosted card-linking page.
  const searchParams = useSearchParams();
  const [cardLinkNotice, setCardLinkNotice] = useState<string | null>(null);

  if (boundToken !== token) {
    setBoundToken(token);
    setViewStage(null);
    setFileHint(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPassportHint(null);
    if (passportPreviewUrl) URL.revokeObjectURL(passportPreviewUrl);
    setPassportPreviewUrl(null);
  }

  useEffect(() => {
    clearRentalOverlay();
  }, [token, clearRentalOverlay]);

  // After a free Stripe-hosted card-linking redirect (?card=linked|cancelled):
  // refresh the Backend-derived card state and surface the return outcome once.
  useEffect(() => {
    const outcome = searchParams.get("card");
    if (outcome !== "linked" && outcome !== "cancelled") return;
    setCardLinkNotice(
      outcome === "linked" ? t("cardLinkedNotice") : t("cardLinkCancelledNotice"),
    );
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("card");
      window.history.replaceState(null, "", url.toString());
    }
    void rental.load(token);
    // rental.load and translate are stable; the query param is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, token]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (passportPreviewUrl) URL.revokeObjectURL(passportPreviewUrl);
    };
  }, [passportPreviewUrl]);

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

  // Passport preview is an in-memory object URL only; never persisted.
  const handlePassportFile = (file: File) => {
    setPassportHint(null);
    if (!isAcceptedLicenseFile(file)) {
      setPassportHint(t("passport.invalidFile"));
      return;
    }
    if (passportPreviewUrl) URL.revokeObjectURL(passportPreviewUrl);
    setPassportPreviewUrl(URL.createObjectURL(file));
    setViewStage("license");
    if (shouldSkipRentalMutation(simulation.active)) {
      // Demo mode: the photo produces a simulated normalized passport result; nothing is uploaded.
      void simulation.simulatePassport("ready");
      return;
    }
    void rental.uploadPassport(file);
  };
  const passportError = resolvePublicRentalErrorMessage(
    errorTranslator(t),
    rental.passportError,
  );

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

        <div className={styles.layout} data-full-width={current === "contract" || undefined}>
          <div className={styles.main}>
            {simulation.enabled ? (
              <div className={styles.simRow}>
                {current === "license" ? <SimulationButton surface="license" /> : null}
                {current === "license" && context.licenseVerification.status === "VALID" ? (
                  <SimulationButton surface="passport" />
                ) : null}
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
              />
            ) : null}

            {current === "license" ? (
              <PassportStep
                context={context}
                phase={simulation.snapshot.passport.processing ? "processing" : rental.passportPhase}
                previewUrl={passportPreviewUrl}
                readOnly={
                  context.contract.status !== "AWAITING" &&
                  context.contract.status !== "FORM"
                }
                fileHint={passportHint ?? passportError}
                onFile={handlePassportFile}
                onContinue={() => setViewStage("contract")}
              />
            ) : null}

            {current === "contract" ? (
              <ContractReviewStep
                token={token}
                context={context}
                allowed={allowed}
                persistEdits={!shouldSkipRentalMutation(simulation.active)}
                onNextStage={setViewStage}
                onSigned={async () => {
                  if (shouldSkipRentalMutation(simulation.active)) {
                    // Demo: local signing moves the overlay to payment; nothing reaches the Backend.
                    if (await simulation.simulateAccept()) setViewStage("payment");
                    return;
                  }
                  await rental.load(token);
                  setViewStage("payment");
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
                cardLinkPending={rental.cardLinkPending}
                cardLinkError={Boolean(rental.cardLinkError)}
                linkNotice={cardLinkNotice}
                onPay={() => {
                  if (shouldSkipRentalMutation(simulation.active)) {
                    void simulation.simulatePayment();
                    return;
                  }
                  void rental.startPayment();
                }}
                onLinkCard={() => {
                  if (shouldSkipRentalMutation(simulation.active)) return;
                  void rental.linkCard();
                }}
                onRefreshStatus={() => {
                  if (shouldSkipRentalMutation(simulation.active)) return;
                  void rental.refreshPaymentStatus();
                }}
              />
            ) : null}

            {current === "handover" ? <HandoverStep context={context} /> : null}
          </div>
          {current === "contract" ? null : (
            <aside className={styles.aside}>
              <RentalSummary context={context} />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
