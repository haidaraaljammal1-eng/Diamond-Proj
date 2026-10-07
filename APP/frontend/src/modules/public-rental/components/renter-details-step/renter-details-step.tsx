"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { FormBuilder } from "@/shared/components/forms/form-builder/form-builder";
import { Card } from "@/shared/components/ui/card/card";
import { publicRentalFormFields } from "../../schemas/public-rental-form.fields";
import {
  publicRentalFormSchema,
  type PublicRentalFormValues,
} from "../../schemas/public-rental-form.schema";
import type { PublicRentalContext } from "../../types/public-rental.types";
import { formatLicenseExpiry } from "../../utils/format-license-date";
import {
  publicRentalFormMountKey,
  resolvePublicRentalFormDefaults,
} from "../../utils/public-rental-form-prefill";
import grid from "../../styles/public-rental-field-grid.module.css";
import { VerifiedDocumentValue } from "../verified-document-value/verified-document-value";
import styles from "./renter-details-step.module.css";

interface RenterDetailsStepProps {
  context: PublicRentalContext;
  formPending: boolean;
  formError: string | null;
  readOnly: boolean;
  onSubmitForm: (values: PublicRentalFormValues) => Promise<void>;
}

export function RenterDetailsStep({
  context,
  formPending,
  formError,
  readOnly,
  onSubmitForm,
}: RenterDetailsStepProps) {
  const t = useTranslations("PublicRental.renter");
  const tc = useTranslations("PublicRental.contract");
  const formMountKey = useMemo(() => publicRentalFormMountKey(context), [context]);
  const defaultValues = useMemo(
    () => resolvePublicRentalFormDefaults(context),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount key is the stability boundary
    [formMountKey],
  );

  const passportNumber =
    context.identity?.passport.fields?.passportNumber?.trim() ||
    context.customer?.passportNumber?.trim() ||
    "—";
  const licenseNumber =
    context.licenseVerification.licenseNumber ??
    context.customer?.drivingLicenseNumber ??
    "—";
  const licenseExpiry = formatLicenseExpiry(
    context.licenseVerification.expiryDate ?? context.customer?.drivingLicenseExpiry,
  ) ?? "—";

  return (
    <Card data-testid="renter-details-step">
      <Card.Title>{t("title")}</Card.Title>
      <p className={styles.intro}>{t("intro")}</p>

      <section className={styles.verifiedSection} aria-labelledby="renter-verified-heading">
        <h3 id="renter-verified-heading" className={styles.verifiedTitle}>
          {t("verifiedTitle")}
        </h3>
        <div className={`${grid.gridThree} ${styles.verifiedGrid}`} data-testid="renter-verified-grid">
          <VerifiedDocumentValue
            label={tc("fields.passportNumber")}
            value={passportNumber}
            testId="verified-passport-number"
            ltr
          />
          <VerifiedDocumentValue
            label={tc("fields.drivingLicenseNumber")}
            value={licenseNumber}
            testId="verified-license-number"
            ltr
          />
          <VerifiedDocumentValue
            label={tc("fields.drivingLicenseExpiry")}
            value={licenseExpiry}
            testId="verified-license-expiry"
            ltr
          />
        </div>
      </section>

      <section className={styles.editableSection} aria-labelledby="renter-editable-heading">
        <h3 id="renter-editable-heading" className={styles.sectionTitle}>
          {t("editableTitle")}
        </h3>
        {readOnly ? (
          <dl className={styles.readOnlyGrid}>
            <div>
              <dt>{tc("fields.name")}</dt>
              <dd dir="auto">{context.customer?.name ?? "—"}</dd>
            </div>
            <div>
              <dt>{tc("fields.mobile")}</dt>
              <dd dir="ltr">{context.customer?.mobile ?? "—"}</dd>
            </div>
            <div>
              <dt>{tc("fields.nationality")}</dt>
              <dd dir="auto">{context.customer?.nationality ?? "—"}</dd>
            </div>
            <div>
              <dt>{tc("fields.address")}</dt>
              <dd dir="auto">{context.customer?.address ?? "—"}</dd>
            </div>
          </dl>
        ) : (
          <FormBuilder<PublicRentalFormValues>
            key={formMountKey}
            fields={publicRentalFormFields((key) => tc(key))}
            schema={publicRentalFormSchema}
            defaultValues={defaultValues}
            onSubmit={async (values) => {
              await onSubmitForm(values);
            }}
            submitLabel={t("save")}
            submittingLabel={t("saving")}
            submitDisabled={formPending}
          />
        )}
      </section>

      {formError ? (
        <p className={styles.error} role="alert">
          {formError}
        </p>
      ) : null}
    </Card>
  );
}
