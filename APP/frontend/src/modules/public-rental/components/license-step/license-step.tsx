"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button/button";
import { Card } from "@/shared/components/ui/card/card";
import { Icon } from "@/shared/components/ui/icon/icon";
import type { PublicRentalContext } from "../../types/public-rental.types";
import { resolveLicenseStatusCardValues } from "../../utils/license-status-card-display";
import { licensePanelFromStatus } from "../../utils/license-view";
import { DocumentVerificationSuccessLayout } from "../document-verification-success-layout/document-verification-success-layout";
import { LicenseUpload } from "../license-upload/license-upload";
import { VerifiedDocumentValue } from "../verified-document-value/verified-document-value";
import { VerificationProcessingStatus } from "../verification-loading-dots/verification-loading-dots";
import grid from "../../styles/public-rental-field-grid.module.css";
import styles from "./license-step.module.css";

function LicenseStatusFacts({
  licenseNumber,
  expiry,
  labelNumber,
  labelExpiry,
}: {
  licenseNumber: string;
  expiry: string;
  labelNumber: string;
  labelExpiry: string;
}) {
  return (
    <dl className={`${grid.gridTwo} ${styles.facts}`} data-testid="license-status-facts">
      <div className={grid.cell}>
        <dt className={grid.label} data-testid="license-fact-label-number">{labelNumber}</dt>
        <dd className={grid.value} dir="ltr" data-testid="license-fact-value-number">
          {licenseNumber}
        </dd>
      </div>
      <div className={grid.cell}>
        <dt className={grid.label} data-testid="license-fact-label-expiry">{labelExpiry}</dt>
        <dd className={grid.value} dir="ltr" data-testid="license-fact-value-expiry">
          {expiry}
        </dd>
      </div>
    </dl>
  );
}

interface LicenseStepProps {
  context: PublicRentalContext;
  pending: boolean;
  previewUrl: string | null;
  readOnly: boolean;
  fileHint: string | null;
  clientBadFrame?: boolean;
  onFile: (file: File) => void;
  onRealign?: () => void;
  onEditCurrent?: () => void;
  /** True after alignment confirm while original source is kept for re-edit (not OCR-gated). */
  hasEditableLicenseSource?: boolean;
  /** When set, hides framing hints (used after licence is verified). */
  summaryOnly?: boolean;
}

export function LicenseStep({
  context,
  pending,
  previewUrl,
  readOnly,
  fileHint,
  clientBadFrame = false,
  onFile,
  onRealign,
  onEditCurrent,
  hasEditableLicenseSource = false,
  summaryOnly = false,
}: LicenseStepProps) {
  const t = useTranslations("PublicRental.license");
  const tAlign = useTranslations("PublicRental.documentAlignment");
  const panel = licensePanelFromStatus(
    context.licenseVerification.status,
    pending,
    context.licenseVerification.unreadableReason,
    clientBadFrame,
  );
  const { licenseNumber, expiryDisplay: expiry, showFacts: showStatusFacts } =
    resolveLicenseStatusCardValues(context);
  const isDev = process.env.NODE_ENV === "development";
  const showInitialDropzone = !readOnly && !summaryOnly && panel === "idle";
  const hasDocumentPreview = Boolean(previewUrl);
  const showDocumentActionRow =
    !readOnly && panel !== "idle" && hasDocumentPreview;
  const licenseCameraLabel =
    hasDocumentPreview || panel !== "idle"
      ? tAlign("cameraAnother")
      : tAlign("cameraLicense");

  return (
    <Card data-testid="license-step" data-summary={summaryOnly || undefined}>
      <Card.Title>{summaryOnly ? t("validTitle") : t("title")}</Card.Title>
      {summaryOnly ? null : (
        <>
          <p className={styles.intro}>{t("intro")}</p>
          <p className={styles.frameHint}>{t("uploadFrameHint")}</p>
          <p className={styles.frameHintSecondary}>{t("uploadFrameHintSecondary")}</p>
        </>
      )}

      {panel === "verifying" ? (
        <div className={`${styles.panel} ${styles.muted}`} role="status" data-testid="license-verifying">
          <VerificationProcessingStatus message={t("verifying")} />
        </div>
      ) : null}

      {panel === "valid" ? (
        <DocumentVerificationSuccessLayout
          testId="license-valid"
          title={t("validTitle")}
          previewUrl={previewUrl}
          previewAlt={t("previewAlt")}
          previewTestId="license-preview-image"
        >
          {showStatusFacts && licenseNumber && expiry ? (
            <div className={grid.gridTwo}>
              <VerifiedDocumentValue
                label={t("number")}
                value={licenseNumber}
                testId="license-fact-value-number"
                ltr
              />
              <VerifiedDocumentValue
                label={t("expiry")}
                value={expiry}
                testId="license-fact-value-expiry"
                ltr
              />
            </div>
          ) : null}
        </DocumentVerificationSuccessLayout>
      ) : null}

      {panel === "expired" ? (
        <div
          className={`${styles.panel} ${styles.danger}`}
          data-testid="license-expired"
          role="alert"
        >
          <Icon name="mdi:alert-circle-outline" size={22} />
          <p className={styles.title}>{t("expiredTitle")}</p>
          {showStatusFacts && licenseNumber && expiry ? (
            <LicenseStatusFacts
              licenseNumber={licenseNumber}
              expiry={expiry}
              labelNumber={t("number")}
              labelExpiry={t("expiry")}
            />
          ) : null}
          <p className={styles.body}>{t("expiredBody")}</p>
        </div>
      ) : null}

      {panel === "bad_frame" ? (
        <div
          className={`${styles.panel} ${styles.warn}`}
          data-testid="license-bad-frame"
          role="alert"
        >
          <p className={styles.title}>{t("badFrameTitle")}</p>
          <p className={styles.body}>{t("badFrameBody")}</p>
          {onRealign ? (
            <Button
              type="button"
              variant="secondary"
              size="md"
              data-testid="license-realign"
              onClick={onRealign}
            >
              {tAlign("realignImage")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {panel === "unreadable" ? (
        <div className={`${styles.panel} ${styles.warn}`} data-testid="license-unreadable">
          <p className={styles.title}>{t("unreadableTitle")}</p>
          <p className={styles.body}>{t("unreadableOcrBody")}</p>
          {onRealign ? (
            <Button
              type="button"
              variant="secondary"
              size="md"
              data-testid="license-realign"
              onClick={onRealign}
            >
              {tAlign("realignImage")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {panel === "review" ? (
        <div className={`${styles.panel} ${styles.warn}`} data-testid="license-review">
          <p className={styles.title}>{t("reviewTitle")}</p>
          <p className={styles.body}>{t("reviewBody")}</p>
          {onRealign ? (
            <Button
              type="button"
              variant="secondary"
              size="md"
              data-testid="license-realign"
              onClick={onRealign}
            >
              {tAlign("realignImage")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {panel === "unavailable" ? (
        <div
          className={`${styles.panel} ${styles.muted}`}
          data-testid="license-unavailable"
        >
          <p className={styles.title}>{t("unavailableTitle")}</p>
          <p className={styles.body}>{t("unavailableBody")}</p>
          {isDev ? <p className={styles.dev}>{t("ocrDevNote")}</p> : null}
        </div>
      ) : null}

      {fileHint ? (
        <p className={styles.body} role="alert">
          {fileHint}
        </p>
      ) : null}

      {showInitialDropzone ? (
        <LicenseUpload
          previewUrl={previewUrl}
          pending={pending}
          testId="license-capture"
          onFile={onFile}
          cameraLabel={licenseCameraLabel}
          cameraTestId="license-camera"
        />
      ) : null}
      {showDocumentActionRow ? (
        <LicenseUpload
          previewUrl={previewUrl}
          pending={pending}
          testId="license-capture"
          showPreview={false}
          variant="replaceAction"
          onFile={onFile}
          onEditCurrent={hasEditableLicenseSource ? onEditCurrent : undefined}
          editCurrentLabel={
            hasEditableLicenseSource ? tAlign("editCurrentImage") : undefined
          }
          editCurrentTestId="license-edit-current"
          cameraLabel={licenseCameraLabel}
          cameraTestId="license-camera"
        />
      ) : null}
    </Card>
  );
}
