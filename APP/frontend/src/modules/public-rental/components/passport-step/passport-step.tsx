"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button/button";
import { Card } from "@/shared/components/ui/card/card";
import { Icon } from "@/shared/components/ui/icon/icon";
import type {
  DocumentCapturePhase,
  PublicRentalContext,
} from "../../types/public-rental.types";
import {
  canContinueFromIdentity,
  passportPanelFromState,
} from "../../utils/passport-view";
import { LicenseUpload } from "../license-upload/license-upload";
import panel from "../license-step/license-step.module.css";
import styles from "./passport-step.module.css";

interface PassportStepProps {
  context: PublicRentalContext;
  phase: DocumentCapturePhase;
  previewUrl: string | null;
  readOnly: boolean;
  fileHint: string | null;
  onFile: (file: File) => void;
  onContinue: () => void;
  simulationAction?: ReactNode;
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
  onContinue,
  simulationAction,
}: PassportStepProps) {
  const t = useTranslations("PublicRental.passport");
  const kind = passportPanelFromState({
    licenseStatus: context.licenseVerification.status,
    passportStatus: context.identity?.passport.status,
    phase,
  });
  const fields = context.identity?.passport.fields ?? null;
  const canContinue = canContinueFromIdentity(
    context.identity?.identityReady,
    context.flow.step,
  );
  const busy = phase !== "idle";
  const isDev = process.env.NODE_ENV === "development";

  return (
    <Card data-testid="passport-step" aria-disabled={kind === "locked"}>
      <Card.Title>{t("title")}</Card.Title>

      {kind === "locked" ? (
        <div className={`${panel.panel} ${panel.muted} ${styles.locked}`} data-testid="passport-locked">
          <Icon name="mdi:lock-outline" size={20} />
          <p className={panel.body}>{t("locked")}</p>
        </div>
      ) : (
        <>
          <p className={panel.intro}>{t("intro")}</p>

          {kind === "uploading" ? (
            <div className={`${panel.panel} ${panel.muted}`} role="status" data-testid="passport-uploading">
              <p className={panel.title}>{t("uploading")}</p>
            </div>
          ) : null}

          {kind === "processing" ? (
            <div className={`${panel.panel} ${panel.muted}`} role="status" data-testid="passport-processing">
              <p className={panel.title}>{t("processing")}</p>
            </div>
          ) : null}

          {kind === "ready" ? (
            <div className={`${panel.panel} ${panel.ok}`} data-testid="passport-ready">
              <Icon name="mdi:check-circle-outline" size={22} />
              <p className={panel.title}>{t("readyTitle")}</p>
              <dl className={panel.facts}>
                <div>
                  <dt>{t("fullName")}</dt>
                  <dd dir="auto">{fields?.fullName ?? "—"}</dd>
                </div>
                <div>
                  <dt>{t("passportNumber")}</dt>
                  <dd dir="ltr">{fields?.passportNumber ?? "—"}</dd>
                </div>
                <div>
                  <dt>{t("nationality")}</dt>
                  <dd dir="auto">{fields?.nationality ?? "—"}</dd>
                </div>
              </dl>
            </div>
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

          {readOnly ? null : (
            <LicenseUpload
              testId="passport-capture"
              icon="mdi:passport"
              previewUrl={previewUrl}
              pending={busy}
              labels={{
                upload: t("capture"),
                replace: t("retake"),
                formats: t("formats"),
                previewAlt: t("previewAlt"),
              }}
              onFile={onFile}
            />
          )}
        </>
      )}

      {readOnly ? null : (
        <div className={styles.footer}>
          <Button
            type="button"
            data-testid="identity-continue"
            disabled={!canContinue || busy}
            onClick={() => {
              if (canContinue) onContinue();
            }}
          >
            {t("continue")}
          </Button>
          {canContinue ? null : <p className={styles.hint}>{t("continueHint")}</p>}
          {simulationAction}
        </div>
      )}
    </Card>
  );
}
