"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button/button";
import { Card } from "@/shared/components/ui/card/card";
import { Icon } from "@/shared/components/ui/icon/icon";
import type { PublicRentalContext } from "../../types/public-rental.types";
import { formatLicenseExpiry } from "../../utils/format-license-date";
import {
  canContinueFromLicense,
  licensePanelFromStatus,
} from "../../utils/license-view";
import { LicenseUpload } from "../license-upload/license-upload";
import styles from "./license-step.module.css";

interface LicenseStepProps {
  context: PublicRentalContext;
  pending: boolean;
  previewUrl: string | null;
  readOnly: boolean;
  fileHint: string | null;
  onFile: (file: File) => void;
  onContinue: () => void;
}

export function LicenseStep({
  context,
  pending,
  previewUrl,
  readOnly,
  fileHint,
  onFile,
  onContinue,
}: LicenseStepProps) {
  const t = useTranslations("PublicRental.license");
  const panel = licensePanelFromStatus(
    context.licenseVerification.status,
    pending,
  );
  const canContinue = canContinueFromLicense(
    context.licenseVerification.status,
    context.flow.step,
  );
  const licenseNumber =
    context.licenseVerification.licenseNumber ??
    context.customer?.drivingLicenseNumber;
  const expiry = formatLicenseExpiry(
    context.licenseVerification.expiryDate ??
      context.customer?.drivingLicenseExpiry,
  );
  const isDev = process.env.NODE_ENV === "development";

  return (
    <Card data-testid="license-step">
      <Card.Title>{t("title")}</Card.Title>
      <p className={styles.intro}>{t("intro")}</p>

      {panel === "verifying" ? (
        <div className={`${styles.panel} ${styles.muted}`} role="status" data-testid="license-verifying">
          <p className={styles.title}>{t("verifying")}</p>
        </div>
      ) : null}

      {panel === "valid" ? (
        <div className={`${styles.panel} ${styles.ok}`} data-testid="license-valid">
          <Icon name="mdi:check-circle-outline" size={22} />
          <p className={styles.title}>{t("validTitle")}</p>
          <dl className={styles.facts}>
            <div>
              <dt>{t("number")}</dt>
              <dd dir="ltr">{licenseNumber ?? "—"}</dd>
            </div>
            <div>
              <dt>{t("expiry")}</dt>
              <dd dir="ltr">{expiry ?? "—"}</dd>
            </div>
          </dl>
          {canContinue && !readOnly ? (
            <Button type="button" className={styles.continue} onClick={onContinue}>
              {t("continue")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {panel === "expired" ? (
        <div
          className={`${styles.panel} ${styles.danger}`}
          data-testid="license-expired"
          role="alert"
        >
          <Icon name="mdi:alert-circle-outline" size={22} />
          <p className={styles.title}>{t("expiredTitle")}</p>
          <p className={styles.body}>{t("expiredBody")}</p>
        </div>
      ) : null}

      {panel === "unreadable" ? (
        <div className={`${styles.panel} ${styles.warn}`} data-testid="license-unreadable">
          <p className={styles.title}>{t("unreadableTitle")}</p>
          <p className={styles.body}>{t("unreadableBody")}</p>
        </div>
      ) : null}

      {panel === "review" ? (
        <div className={`${styles.panel} ${styles.warn}`} data-testid="license-review">
          <p className={styles.title}>{t("reviewTitle")}</p>
          <p className={styles.body}>{t("reviewBody")}</p>
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

      {readOnly ? null : (
        <LicenseUpload
          previewUrl={previewUrl}
          pending={pending}
          onFile={onFile}
        />
      )}
    </Card>
  );
}
