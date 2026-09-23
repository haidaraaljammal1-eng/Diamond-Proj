"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button/button";
import { publicOfficialSignatureUrl } from "../../api/public-rental.api";
import { useOfficialContract } from "../../hooks/use-official-contract";
import type { OfficialSignatureSlot } from "../../types/official-contract.types";
import type { PublicRentalContext, PublicRentalUiStage } from "../../types/public-rental.types";
import { canEnterStage, isLinkGoneReason } from "../../utils/flow-step";
import { SIGNATURE_SLOT_PATHS } from "../../utils/official-contract-document";
import { withNormalizedIdentity } from "../../utils/official-contract-identity";
import {
  isDevTestFillEnabled,
  missingRequirementReviewFields,
} from "../../utils/official-contract-completion";
import {
  formatMissingRequirementsMessage,
  resolveContractCompletionError,
} from "../../utils/format-contract-completion-error";
import {
  publicRentalErrorReason,
  resolvePublicRentalErrorMessage,
} from "../../utils/resolve-public-rental-error";
import { OfficialContractA4 } from "../official-contract-a4/official-contract-a4";
import { RentalLinkError } from "../rental-link-error/rental-link-error";
import { isTarsOtpBlockingSign, TarsOtpPanel } from "../tars-otp-panel/tars-otp-panel";
import styles from "./contract-review-step.module.css";

/** A4 width in CSS px (210 mm at 96 dpi). */
const SHEET_WIDTH_PX = (210 / 25.4) * 96;

interface ContractReviewStepProps {
  token: string;
  /** Backend rental context; supplies normalized identity. */
  context: PublicRentalContext;
  allowed: PublicRentalUiStage;
  onNextStage: (stage: PublicRentalUiStage) => void;
  tarsOtpRequestPending: boolean;
  tarsOtpVerifyPending: boolean;
  tarsOtpError: import("@/infrastructure/api/errors").ApiRequestError | null;
  onRequestTarsOtp: () => Promise<void>;
  onVerifyTarsOtp: (code: string) => Promise<void>;
  /** Called after the Backend persists the legal signatures and acceptance. */
  onSigned: () => Promise<void> | void;
}

function useSheetScale() {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      const available = node.clientWidth - 2;
      setScale(available > 0 ? Math.min(1, available / SHEET_WIDTH_PX) : 1);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, scale };
}

export function ContractReviewStep({
  token,
  context,
  allowed,
  onNextStage,
  tarsOtpRequestPending,
  tarsOtpVerifyPending,
  tarsOtpError,
  onRequestTarsOtp,
  onVerifyTarsOtp,
  onSigned,
}: ContractReviewStepProps) {
  const t = useTranslations("PublicRental.review");
  const tRental = useTranslations("PublicRental");
  const contract = useOfficialContract(token, true);
  const { ref, scale } = useSheetScale();

  const errorTranslator = Object.assign((key: string) => tRental(key as never), {
    has: (key: string) => tRental.has(key as never),
  });
  const reviewTranslator = Object.assign((key: string) => t(key as never), {
    has: (key: string) => t.has(key as never),
  });

  useEffect(() => {
    const field = contract.scrollTargetField;
    if (!field) return;
    const node = document.querySelector<HTMLElement>(`[data-field="${field}"]`);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    if (node instanceof HTMLTextAreaElement) node.focus();
  }, [contract.scrollTargetField]);

  if (contract.status === "error") {
    const reason = publicRentalErrorReason(contract.loadError);
    if (isLinkGoneReason(reason)) return <RentalLinkError reason={reason} />;
    return (
      <section className={styles.shell}>
        <p className={styles.error} role="alert">
          {resolvePublicRentalErrorMessage(errorTranslator, contract.loadError)}
        </p>
        <Button type="button" size="md" onClick={() => void contract.load(token)}>
          {tRental("retry")}
        </Button>
      </section>
    );
  }

  const normalizedView = contract.view ? withNormalizedIdentity(contract.view, context) : null;
  const view = normalizedView;
  const saving = contract.saveStatus === "saving";
  const signing = contract.signStatus === "signing";
  const signed = view ? !["AWAITING", "FORM"].includes(view.contract.status) : false;
  const otpBlocksSign = isTarsOtpBlockingSign(context.tarsOtp);
  const highlightedFields = [
    ...new Set([
      ...contract.invalidFields,
      ...missingRequirementReviewFields(contract.missingRequirements),
    ]),
  ];
  const pendingMarks = Object.fromEntries(
    Object.entries(contract.pendingSignatures).map(([slot, value]) => [slot, value === "CLEAR" ? "CLEAR" : "DRAWN"]),
  ) as Partial<Record<OfficialSignatureSlot, "DRAWN" | "CLEAR">>;

  const signatureLabel = (slot: OfficialSignatureSlot) => t(`signatureSlots.${slot}` as never);
  const completionError =
    contract.missingRequirements.length > 0
      ? formatMissingRequirementsMessage(reviewTranslator, contract.missingRequirements)
      : null;
  const errorMessage = (() => {
    if (completionError) return completionError;
    if (contract.missingSignatures.length > 0) {
      return t("missingSignatures", { slots: contract.missingSignatures.map(signatureLabel).join("، ") });
    }
    if (contract.signStatus === "error" && contract.signError) {
      return (
        resolveContractCompletionError(reviewTranslator, contract.signError) ??
        resolvePublicRentalErrorMessage(errorTranslator, contract.signError) ??
        t("signFailed")
      );
    }
    if (contract.saveStatus === "error") {
      if (contract.invalidFields.length > 0) return t("invalidFields");
      return (
        resolveContractCompletionError(reviewTranslator, contract.saveError) ??
        resolvePublicRentalErrorMessage(errorTranslator, contract.saveError) ??
        t("saveFailed")
      );
    }
    return null;
  })();

  const handleSave = async () => {
    await contract.save();
  };

  const handleSign = async () => {
    const ok = await contract.sign();
    if (ok) await onSigned();
  };

  const handleContinue = () => {
    if (canEnterStage("payment", allowed)) onNextStage("payment");
  };

  return (
    <section className={styles.shell} data-testid="contract-review">
      <div className={styles.intro}>
        <h2 className={styles.title}>{t("title")}</h2>
        <p className={styles.body}>
          {signed
            ? t("instructionsSigned")
            : view?.permissions.canEdit
              ? t("instructionsInteractive")
              : t("instructionsReadOnly")}
        </p>
      </div>

      <div ref={ref} className={styles.viewport} data-official-contract-viewport>
        {view ? (
          <div className={styles.sheetFrame} style={{ zoom: scale }} data-official-contract-print>
            <OfficialContractA4
              contract={view}
              mode={signed ? "READONLY" : "REVIEW"}
              edits={contract.edits}
              damageOut={contract.damageOut}
              pendingSignatures={pendingMarks}
              invalidFields={highlightedFields}
              signatureImageUrl={(slot) =>
                publicOfficialSignatureUrl(token, SIGNATURE_SLOT_PATHS[slot], view.signatures[slot].signedAt ?? "")
              }
              onEdit={contract.setEdit}
              onDamageOut={contract.setDamageOut}
              onSignature={contract.setSignature}
            />
          </div>
        ) : (
          <div
            className={styles.skeleton}
            style={{ zoom: scale }}
            role="status"
            aria-label={t("loading")}
            data-testid="contract-skeleton"
          >
            <span className={styles.skHeader} />
            <span className={styles.skLine} />
            <span className={styles.skGrid} />
            <span className={styles.skBand} />
            <span className={styles.skCustody} />
            <span className={styles.skTerms} />
            <span className={styles.skSign} />
          </div>
        )}
      </div>

      {!signed ? (
        <TarsOtpPanel
          state={context.tarsOtp}
          requestPending={tarsOtpRequestPending}
          verifyPending={tarsOtpVerifyPending}
          error={tarsOtpError}
          onRequest={onRequestTarsOtp}
          onVerify={onVerifyTarsOtp}
        />
      ) : null}

      <div className={styles.actions}>
        {errorMessage ? (
          <p className={styles.error} role="alert" data-testid="contract-review-error">
            {errorMessage}
          </p>
        ) : null}
        {contract.saveStatus === "saved" && !contract.dirty && !signed ? (
          <p className={styles.saved} role="status">{t("saved")}</p>
        ) : null}
        <div className={styles.buttons}>
          {signed ? (
            <Button type="button" size="md" data-testid="contract-review-continue" onClick={handleContinue}>
              {t("continue")}
            </Button>
          ) : (
            <>
              {view?.permissions.canEdit ? (
                <>
                  {isDevTestFillEnabled() ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      disabled={saving || signing}
                      data-testid="contract-review-fill-test-data"
                      onClick={() => contract.fillDevTestData()}
                    >
                      {t("fillTestData")}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    loading={saving && !signing}
                    disabled={(view?.contract.status !== "AWAITING" && !contract.dirty) || saving || signing}
                    onClick={() => void handleSave()}
                  >
                    {saving && !signing ? t("saving") : view?.contract.status === "AWAITING" ? t("confirmReview") : t("save")}
                  </Button>
                </>
              ) : null}
              <Button
                type="button"
                size="md"
                data-testid="contract-review-sign"
                loading={signing}
                disabled={!view?.permissions.canEdit || saving || signing || otpBlocksSign}
                onClick={() => void handleSign()}
              >
                {signing ? t("signing") : t("sign")}
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
