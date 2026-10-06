"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/shared/components/ui/card/card";
import { Icon } from "@/shared/components/ui/icon/icon";
import type {
  DocumentCapturePhase,
  PublicRentalContext,
} from "../../types/public-rental.types";
import { passportPanelFromState } from "../../utils/passport-view";
import { DocumentVerificationSuccessLayout } from "../document-verification-success-layout/document-verification-success-layout";
import { LicenseUpload } from "../license-upload/license-upload";
import { VerifiedDocumentValue } from "../verified-document-value/verified-document-value";
import grid from "../../styles/public-rental-field-grid.module.css";
import panel from "../license-step/license-step.module.css";
import { VerificationProcessingStatus } from "../verification-loading-dots/verification-loading-dots";
import styles from "./passport-step.module.css";

interface PassportStepProps {
  context: PublicRentalContext;
  phase: DocumentCapturePhase;
  previewUrl: string | null;
  readOnly: boolean;
  fileHint: string | null;
  onFile: (file: File) => void;
  simulationAction?: ReactNode;
  /** Compact verified summary (e.g. above renter details). */
  summaryOnly?: boolean;
}

/**
 * Step 2 of document verification. Capture only: OCR runs on the server and
 * the result is shown read-only. Review/edit happens on the contract review page.
 */
export function PassportStep({
  context,
  phase,
  previewUrl,
  readOnly,
  fileHint,
  onFile,
  simulationAction,
  summaryOnly = false,
}: PassportStepProps) {
  const t = useTranslations("PublicRental.passport");
  const kind = passportPanelFromState({
    licenseStatus: context.licenseVerification.status,
    passportStatus: context.identity?.passport.status,
    phase,
  });
  const fields = context.identity?.passport.fields ?? null;
  const busy = phase !== "idle";
  const isDev = process.env.NODE_ENV === "development";
  const captureLabels = {
    upload: t("capture"),
    replace: t("replace"),
    formats: t("formats"),
    previewAlt: t("previewAlt"),
  };
  const showDropzone =
    !readOnly &&
    kind !== "locked" &&
    kind !== "ready" &&
    (kind === "idle" ||
      kind === "notRecognized" ||
      kind === "failed" ||
      kind === "unavailable");
  const showSuccessReplace = !readOnly && kind === "ready";

  return (
    <Card data-testid="passport-step" data-summary={summaryOnly || undefined} aria-disabled={kind === "locked"}>
      <Card.Title>{summaryOnly ? t("verifiedTitle") : t("title")}</Card.Title>

      {kind === "locked" ? (
        <div className={`${panel.panel} ${panel.muted} ${styles.locked}`} data-testid="passport-locked">
          <Icon name="mdi:lock-outline" size={20} />
          <p className={panel.body}>{t("locked")}</p>
        </div>
      ) : (
        <>
          {summaryOnly ? null : <p className={panel.intro}>{t("intro")}</p>}

          {kind === "uploading" ? (
            <div className={`${panel.panel} ${panel.muted}`} role="status" data-testid="passport-uploading">
              <p className={panel.title}>{t("uploading")}</p>
            </div>
          ) : null}

          {kind === "processing" ? (
            <div className={`${panel.panel} ${panel.muted}`} role="status" data-testid="passport-processing">
              <VerificationProcessingStatus message={t("processing")} />
            </div>
          ) : null}

          {kind === "ready" ? (
            <DocumentVerificationSuccessLayout
              testId="passport-ready"
              title={t("verifiedTitle")}
              previewUrl={previewUrl}
              previewAlt={t("previewAlt")}
              previewTestId="passport-preview-image"
            >
              <div className={grid.gridTwo}>
                <VerifiedDocumentValue
                  label={t("passportNumber")}
                  value={fields?.passportNumber ?? "—"}
                  testId="passport-verified-number"
                  ltr
                />
              </div>
            </DocumentVerificationSuccessLayout>
          ) : null}

          {kind === "notRecognized" ? (
            <div className={`${panel.panel} ${panel.warn}`} role="alert" data-testid="passport-not-recognized">
              <p className={panel.title}>{t("notRecognizedTitle")}</p>
              <p className={panel.body}>{t("notRecognizedBody")}</p>
            </div>
          ) : null}

          {kind === "failed" ? (
            <div className={`${panel.panel} ${panel.warn}`} role="alert" data-testid="passport-failed">
              <p className={panel.title}>{t("failedTitle")}</p>
              <p className={panel.body}>{t("failedBody")}</p>
            </div>
          ) : null}

          {kind === "unavailable" ? (
            <div className={`${panel.panel} ${panel.muted}`} role="alert" data-testid="passport-unavailable">
              <p className={panel.title}>{t("unavailableTitle")}</p>
              <p className={panel.body}>{t("unavailableBody")}</p>
              {isDev ? <p className={panel.dev}>{t("ocrDevNote")}</p> : null}
            </div>
          ) : null}

          {fileHint ? (
            <p className={panel.body} role="alert">
              {fileHint}
            </p>
          ) : null}

          {showSuccessReplace ? (
            <LicenseUpload
              testId="passport-capture"
              icon="mdi:passport"
              previewUrl={previewUrl}
              showPreview={false}
              variant="replaceAction"
              pending={busy}
              labels={captureLabels}
              onFile={onFile}
            />
          ) : null}
          {showDropzone ? (
            <LicenseUpload
              testId="passport-capture"
              icon="mdi:passport"
              previewUrl={previewUrl}
              pending={busy}
              labels={captureLabels}
              onFile={onFile}
            />
          ) : null}
        </>
      )}

      {readOnly ? null : simulationAction ? (
        <div className={styles.footer}>{simulationAction}</div>
      ) : null}
    </Card>
  );
}
