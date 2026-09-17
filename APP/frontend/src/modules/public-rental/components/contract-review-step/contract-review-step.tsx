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
  publicRentalErrorReason,
  resolvePublicRentalErrorMessage,
} from "../../utils/resolve-public-rental-error";
import { OfficialContractA4 } from "../official-contract-a4/official-contract-a4";
import { RentalLinkError } from "../rental-link-error/rental-link-error";
import styles from "./contract-review-step.module.css";

/** A4 width in CSS px (210 mm at 96 dpi). */
const SHEET_WIDTH_PX = (210 / 25.4) * 96;

interface ContractReviewStepProps {
  token: string;
  /** Rental context after any demo overlay; supplies normalized identity. */
  context: PublicRentalContext;
  allowed: PublicRentalUiStage;
  /** Demo simulation keeps review edits, marks and signatures in the browser. */
  persistEdits: boolean;
  onNextStage: (stage: PublicRentalUiStage) => void;
  /** Called after the agreement is signed (Backend) or locally signed (demo). */
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
  persistEdits,
  onNextStage,
  onSigned,
}: ContractReviewStepProps) {
  const t = useTranslations("PublicRental.review");
  const tRental = useTranslations("PublicRental");
  const contract = useOfficialContract(token, true);
  const { ref, scale } = useSheetScale();
  const [notice, setNotice] = useState<string | null>(null);

  const errorTranslator = Object.assign((key: string) => tRental(key as never), {
    has: (key: string) => tRental.has(key as never),
  });

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

  const view = contract.view ? withNormalizedIdentity(contract.view, context) : null;
  const saving = contract.saveStatus === "saving";
  const signing = contract.signStatus === "signing";
  const signed = view ? !["AWAITING", "FORM"].includes(view.contract.status) : false;
  const pendingMarks = Object.fromEntries(
    Object.entries(contract.pendingSignatures).map(([slot, value]) => [slot, value === "CLEAR" ? "CLEAR" : "DRAWN"]),
  ) as Partial<Record<OfficialSignatureSlot, "DRAWN" | "CLEAR">>;

  const signatureLabel = (slot: OfficialSignatureSlot) => t(`signatureSlots.${slot}` as never);
  const errorMessage = (() => {
    if (contract.missingSignatures.length > 0) {
      return t("missingSignatures", { slots: contract.missingSignatures.map(signatureLabel).join("، ") });
    }
    if (contract.signStatus === "error" && contract.signError) {
      return resolvePublicRentalErrorMessage(errorTranslator, contract.signError) ?? t("signFailed");
    }
    if (contract.saveStatus === "error") {
      return contract.invalidFields.length > 0
        ? t("invalidFields")
        : (resolvePublicRentalErrorMessage(errorTranslator, contract.saveError) ?? t("saveFailed"));
    }
    return null;
  })();

  const handleSave = async () => {
    setNotice(null);
    await contract.save({ persist: persistEdits });
  };

  const handleSign = async () => {
    setNotice(null);
    const ok = await contract.sign({ persist: persistEdits });
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
              cardDigits={contract.cardDigits}
              damageOut={contract.damageOut}
              pendingSignatures={pendingMarks}
              invalidFields={contract.invalidFields}
              signatureImageUrl={(slot) =>
                publicOfficialSignatureUrl(token, SIGNATURE_SLOT_PATHS[slot], view.signatures[slot].signedAt ?? "")
              }
              onEdit={contract.setEdit}
              onCardDigits={contract.setCardDigits}
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

      <div className={styles.actions}>
        {errorMessage ? (
          <p className={styles.error} role="alert">{errorMessage}</p>
        ) : null}
        {contract.saveStatus === "saved" && !contract.dirty && !signed ? (
          <p className={styles.saved} role="status">{t("saved")}</p>
        ) : null}
        {notice ? <p className={styles.body} role="status">{notice}</p> : null}
        <div className={styles.buttons}>
          {signed ? (
            <Button type="button" size="md" data-testid="contract-review-continue" onClick={handleContinue}>
              {t("continue")}
            </Button>
          ) : (
            <>
              {view?.permissions.canEdit ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  loading={saving && !signing}
                  disabled={!contract.dirty || saving || signing}
                  onClick={() => void handleSave()}
                >
                  {saving && !signing ? t("saving") : t("save")}
                </Button>
              ) : null}
              <Button
                type="button"
                size="md"
                data-testid="contract-review-sign"
                loading={signing}
                disabled={!view?.permissions.canEdit || saving || signing}
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
