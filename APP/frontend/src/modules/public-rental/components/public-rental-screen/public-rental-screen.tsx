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
import { evaluateLicenseFramePreflight } from "../../utils/license-frame";
import { readLicenseImageMeta } from "../../utils/read-license-image-meta";
import {
  publicRentalErrorReason,
  resolvePublicRentalErrorMessage,
} from "../../utils/resolve-public-rental-error";
import { ContractReviewStep } from "../contract-review-step/contract-review-step";
import { DocumentVerificationProgress } from "../document-verification-progress/document-verification-progress";
import { toPublicRentalFormPayload } from "../../utils/to-form-payload";
import { resolveDocumentVerificationSubStage } from "../../utils/document-verification-substage";
import { resolvePassportPreviewUrl } from "../../utils/resolve-passport-preview-url";
import { HandoverStep } from "../handover-step/handover-step";
import { LicenseStep } from "../license-step/license-step";
import { PassportStep } from "../passport-step/passport-step";
import { RenterDetailsStep } from "../renter-details-step/renter-details-step";
import { PaymentStep } from "../payment-step/payment-step";
import { RentalHeader } from "../rental-header/rental-header";
import { RentalLinkError } from "../rental-link-error/rental-link-error";
import { RentalProgress } from "../rental-progress/rental-progress";
import { RentalSummary } from "../rental-summary/rental-summary";
import { SimulationAction } from "@/modules/demo-simulation";
import { isProviderSimulationEnabled } from "@/modules/demo-simulation/simulation.enabled";
import {
  STAGE_SUCCESS_DURATION_MS,
  type StageSuccessKind,
} from "../../constants/stage-success";
import motion from "../../styles/public-rental-motion.module.css";
import { StageSuccessTransition } from "../stage-success-transition/stage-success-transition";
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
  const providerSimulationEnabled = isProviderSimulationEnabled();
  const [boundToken, setBoundToken] = useState(token);
  const [viewStage, setViewStage] = useState<PublicRentalUiStage | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileHint, setFileHint] = useState<string | null>(null);
  const [clientBadFrame, setClientBadFrame] = useState(false);
  const [passportPreviewUrl, setPassportPreviewUrl] = useState<string | null>(null);
  const [passportHint, setPassportHint] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const [paymentCancelNotice, setPaymentCancelNotice] = useState<string | null>(null);
  const [stageSuccess, setStageSuccess] = useState<StageSuccessKind | null>(null);

  const playStageSuccess = (kind: StageSuccessKind) =>
    new Promise<void>((resolve) => {
      setStageSuccess(kind);
      window.setTimeout(() => {
        setStageSuccess(null);
        resolve();
      }, STAGE_SUCCESS_DURATION_MS);
    });

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

  // Stripe Checkout cancel returns to the payment step with ?payment=cancelled.
  useEffect(() => {
    if (searchParams.get("payment") !== "cancelled") return;
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("payment");
      window.history.replaceState(null, "", url.toString());
    }
    setPaymentCancelNotice(t("payment.notCompleted"));
    setViewStage("payment");
    void import("../../api/public-rental.api").then(({ abandonPublicRentalPayment }) =>
      abandonPublicRentalPayment(token).finally(() => rental.load(token)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- query param is the trigger
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
        <div className={`${styles.shell} ${motion.shell}`}>
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
        <div className={`${styles.shell} ${motion.shell}`}>
          <RentalHeader officeName={t("fallbackOffice")} />
          <p className={styles.loading}>{t("loading")}</p>
        </div>
      </div>
    );
  }

  const context = rental.context;
  const rentalSimulation = providerSimulationEnabled && context.payment.devSimulationAvailable;
  const isCashCollection = context.collection.mode === "CASH";
  const allowed = uiStageFromFlowStep(context.flow.step);
  const requestedStage = viewStage;
  const current: PublicRentalUiStage =
    allowed === "handover"
      ? "handover"
      : requestedStage && canEnterStage(requestedStage, allowed)
        ? requestedStage
        : allowed;
  const goToStage = (stage: PublicRentalUiStage) => {
    setViewStage(stage);
  };
  const inlineError = resolvePublicRentalErrorMessage(
    errorTranslator(t),
    rental.error,
  );
  const documentsReadOnly =
    context.contract.status !== "AWAITING" && context.contract.status !== "FORM";
  const documentSubStage =
    current === "license" ? resolveDocumentVerificationSubStage(context) : null;
  const passportPreviewResolved = resolvePassportPreviewUrl(token, context, passportPreviewUrl);
  const passportReady =
    context.identity?.passport.status === "READY" &&
    (context.identity.passport.fields?.passportNumber?.trim().length ?? 0) >= 3;
  const showPassportStep =
    documentSubStage === "PASSPORT" ||
    (documentSubStage === "RENTER_DETAILS" && passportReady);

  const handleFile = (file: File) => {
    setFileHint(null);
    setClientBadFrame(false);
    if (!isAcceptedLicenseFile(file)) {
      setFileHint(t("license.invalidFile"));
      return;
    }
    void (async () => {
      try {
        const meta = await readLicenseImageMeta(file);
        const preflight = evaluateLicenseFramePreflight(meta.width, meta.height);
        if (!preflight.ok) {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setPreviewUrl(URL.createObjectURL(file));
          setClientBadFrame(true);
          goToStage("license");
          return;
        }
      } catch {
        setFileHint(t("license.invalidFile"));
        return;
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(file));
      goToStage("license");
      await rental.uploadLicense(file);
    })();
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
    goToStage("license");
    void rental.uploadPassport(file);
  };
  const passportError = resolvePublicRentalErrorMessage(
    errorTranslator(t),
    rental.passportError,
  );

  return (
    <div className={styles.root}>
      <div className={`${styles.shell} ${motion.shell}`}>
        <RentalHeader officeName={context.office.company.displayName} />
        {allowed !== "handover" ? (
          <RentalProgress
            allowed={allowed}
            current={current === "handover" ? "payment" : current}
            onSelect={goToStage}
            cashCollection={isCashCollection}
          />
        ) : null}

        <div className={styles.layout} data-full-width={current === "contract" || undefined}>
          <div className={styles.columns} data-testid="public-rental-columns">
          <div className={styles.main} data-testid="public-rental-main-column">
            {current === "license" && documentSubStage ? (
              <div className={styles.stageWorkflow} data-testid="stage1-workflow">
                <div className={styles.stage1SubProgressSlot} data-testid="stage1-sub-progress">
                  <DocumentVerificationProgress subStage={documentSubStage} />
                </div>

                <div className={styles.activeStageCard} data-testid="active-stage-card">
                  {documentSubStage === "LICENSE" ? (
                    <LicenseStep
                      context={context}
                      pending={rental.uploadPending || rental.simulationPending}
                      previewUrl={previewUrl}
                      readOnly={documentsReadOnly}
                      fileHint={fileHint ?? inlineError}
                      clientBadFrame={clientBadFrame}
                      onFile={handleFile}
                      simulationAction={
                        rentalSimulation
                          ? (
                              <SimulationAction
                                label={t("simulation.validLicense")}
                                testId="simulate-license-valid"
                                disabled={rental.simulationPending}
                                onClick={() => void rental.simulateLicense()}
                              />
                            )
                          : null
                      }
                    />
                  ) : null}

                  {documentSubStage === "PASSPORT" ? (
                    <PassportStep
                      context={context}
                      phase={rental.simulationPending ? "processing" : rental.passportPhase}
                      previewUrl={passportPreviewResolved}
                      readOnly={documentsReadOnly}
                      fileHint={passportHint ?? passportError}
                      onFile={handlePassportFile}
                      simulationAction={
                        rentalSimulation
                          ? (
                              <SimulationAction
                                label={t("simulation.passportOcr")}
                                testId="simulate-passport-ready"
                                disabled={
                                  rental.simulationPending ||
                                  context.licenseVerification.status !== "VALID"
                                }
                                onClick={() => void rental.simulatePassport()}
                              />
                            )
                          : null
                      }
                    />
                  ) : null}

                  {documentSubStage === "RENTER_DETAILS" ? (
                    <div className={styles.renterStageStack}>
                      <LicenseStep
                        context={context}
                        pending={rental.uploadPending || rental.simulationPending}
                        previewUrl={previewUrl}
                        readOnly={documentsReadOnly}
                        summaryOnly
                        fileHint={null}
                        onFile={handleFile}
                      />
                      {showPassportStep ? (
                        <PassportStep
                          context={context}
                          phase={rental.simulationPending ? "processing" : rental.passportPhase}
                          previewUrl={passportPreviewResolved}
                          readOnly={documentsReadOnly}
                          summaryOnly
                          fileHint={passportHint ?? passportError}
                          onFile={handlePassportFile}
                        />
                      ) : null}
                      <RenterDetailsStep
                        context={context}
                        formPending={rental.formPending}
                        formError={inlineError}
                        readOnly={documentsReadOnly}
                        onSubmitForm={async (values) => {
                        const ok = await rental.submitForm(
                          toPublicRentalFormPayload(values, context),
                        );
                        if (!ok) return;
                        await playStageSuccess("documents");
                        goToStage("contract");
                      }}
                      />
                    </div>
                  ) : null}
                </div>

                {documentSubStage === "PASSPORT" ? (
                  <div className={styles.stage1CompletedStack} data-testid="stage1-completed-summaries">
                    <LicenseStep
                      context={context}
                      pending={rental.uploadPending || rental.simulationPending}
                      previewUrl={previewUrl}
                      readOnly={documentsReadOnly}
                      summaryOnly
                      fileHint={null}
                      onFile={handleFile}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {current === "contract" ? (
              <ContractReviewStep
                token={token}
                context={context}
                allowed={allowed}
                onNextStage={goToStage}
                tarsOtpRequestPending={rental.tarsOtpRequestPending}
                tarsOtpVerifyPending={rental.tarsOtpVerifyPending}
                tarsOtpError={rental.tarsOtpError}
                onRequestTarsOtp={async () => {
                  await rental.requestTarsOtp();
                }}
                onVerifyTarsOtp={async (code) => {
                  await rental.verifyTarsOtp(code);
                }}
                onSigned={async () => {
                  await rental.load(token);
                  await playStageSuccess("contractSigned");
                  goToStage(isCashCollection ? "handover" : "payment");
                }}
              />
            ) : null}

            {current === "payment" && !isCashCollection ? (
              <PaymentStep
                context={context}
                simulationEnabled={rentalSimulation}
                onSimulatePayment={() => void rental.simulatePayment()}
                paymentStatus={
                  rental.paymentStatus?.status ??
                  context.payment.status
                }
                payPending={rental.payPending || rental.simulationPending}
                statusPending={rental.statusPending}
                linkExpiredDuringPayment={rental.linkExpiredDuringPayment}
                paymentNotice={paymentCancelNotice}
                paymentError={inlineError}
                onPay={(savePaymentMethodForFutureUse) => {
                  void rental.startPayment(savePaymentMethodForFutureUse);
                }}
                onRefreshStatus={() => {
                  void rental.refreshPaymentStatus();
                }}
              />
            ) : null}

            {current === "handover" ? <HandoverStep context={context} /> : null}
          </div>
          {current === "contract" ? null : (
            <aside className={styles.aside}>
              {current === "license" && documentSubStage ? (
                <div className={styles.asideProgressOffset} aria-hidden="true" data-testid="aside-sub-progress-offset" />
              ) : null}
              <RentalSummary context={context} />
            </aside>
          )}
          </div>
        </div>
      </div>
      {stageSuccess ? (
        <StageSuccessTransition
          message={
            stageSuccess === "documents"
              ? t("stageSuccess.documentsVerified")
              : t("stageSuccess.contractSigned")
          }
        />
      ) : null}
    </div>
  );
}
