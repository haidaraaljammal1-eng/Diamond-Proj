"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FormBuilder } from "@/shared/components/forms/form-builder/form-builder";
import { Button } from "@/shared/components/ui/button/button";
import { Checkbox } from "@/shared/components/ui/checkbox/checkbox";
import { publicRentalFormFields } from "../../schemas/public-rental-form.fields";
import {
  publicRentalFormSchema,
  type PublicRentalFormValues,
} from "../../schemas/public-rental-form.schema";
import type { PublicRentalContext } from "../../types/public-rental.types";
import { formatLicenseExpiry } from "../../utils/format-license-date";
import { formatRentalAmount, formatRentalDays } from "../../utils/format-money";
import styles from "./contract-step.module.css";

interface ContractStepProps {
  context: PublicRentalContext;
  formPending: boolean;
  acceptPending: boolean;
  formError: string | null;
  onSubmitForm: (values: PublicRentalFormValues) => Promise<void>;
  onAccept: () => Promise<void>;
}

function Field({
  label,
  value,
  ltr = false,
  placeholder = false,
}: {
  label: string;
  value: string;
  ltr?: boolean;
  placeholder?: boolean;
}) {
  return (
    <div className={`${styles.field} ${styles.gridItem}`}>
      <dt>{label}</dt>
      <dd className={placeholder ? styles.placeholder : undefined} dir={ltr ? "ltr" : undefined}>
        {value}
      </dd>
    </div>
  );
}

export function ContractStep({
  context,
  formPending,
  acceptPending,
  formError,
  onSubmitForm,
  onAccept,
}: ContractStepProps) {
  const t = useTranslations("PublicRental.contract");
  const [accepted, setAccepted] = useState(false);
  const signed = context.contract.status !== "AWAITING" && context.contract.status !== "FORM";
  const canEdit = context.contract.status === "AWAITING" || context.contract.status === "FORM";
  const canAccept = context.contract.status === "FORM" && !signed;
  const licenseNumber =
    context.licenseVerification.licenseNumber ??
    context.customer?.drivingLicenseNumber;
  const expiry = formatLicenseExpiry(
    context.licenseVerification.expiryDate ??
      context.customer?.drivingLicenseExpiry,
  );
  const amount = formatRentalAmount(
    context.rental.agreedAmount,
    context.rental.currency,
  );
  const duration = formatRentalDays(context.rental.rentalDays, t("days"));
  const defaultValues: PublicRentalFormValues = {
    name: context.customer?.name ?? "",
    mobile: context.customer?.mobile ?? "",
    email: context.customer?.email ?? "",
    nationality: context.customer?.nationality ?? "",
    identityNumber: context.customer?.identityNumber ?? "",
    passportNumber: context.customer?.passportNumber ?? "",
    address: context.customer?.address ?? "",
  };

  return (
    <article className={styles.sheet} data-testid="contract-step">
      <header className={styles.masthead}>
        <p className={styles.office}>{context.office.displayName}</p>
        <p className={styles.number}>
          {t("numberLabel")}{" "}
          <b dir="ltr">{context.contract.contractNumber}</b>
        </p>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("vehicleTitle")}</h2>
        <dl className={styles.grid}>
          <Field label={t("vehicle")} value={context.vehicle.displayName} />
          <Field
            label={t("vehicleType")}
            value={context.vehicle.vehicleType ?? "—"}
          />
          <Field
            label={t("plate")}
            value={context.vehicle.plateNumber ?? "—"}
            ltr
          />
          <Field
            label={t("year")}
            value={context.vehicle.modelYear ? String(context.vehicle.modelYear) : "—"}
            ltr
          />
          <Field label={t("color")} value={context.vehicle.color ?? "—"} />
          {context.vehicle.vin ? (
            <Field label={t("vin")} value={context.vehicle.vin} ltr />
          ) : null}
        </dl>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("commercialTitle")}</h2>
        <dl className={styles.grid}>
          <Field label={t("duration")} value={duration} ltr />
          <Field label={t("amount")} value={amount} ltr />
          {context.rental.depositAmount != null ? (
            <Field
              label={t("deposit")}
              value={formatRentalAmount(
                context.rental.depositAmount,
                context.rental.currency,
              )}
              ltr
            />
          ) : null}
        </dl>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("licenseTitle")}</h2>
        <dl className={styles.grid}>
          <Field label={t("licenseNumber")} value={licenseNumber ?? "—"} ltr />
          <Field label={t("licenseExpiry")} value={expiry ?? "—"} ltr />
        </dl>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("datesTitle")}</h2>
        <dl className={styles.grid}>
          <Field
            label={t("pickup")}
            value={t("pickupPlaceholder")}
            placeholder
          />
          <Field
            label={t("return")}
            value={t("returnPlaceholder")}
            placeholder
          />
        </dl>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("customerTitle")}</h2>
        {canEdit ? (
          <FormBuilder<PublicRentalFormValues>
            key={`${context.contract.status}-${context.customer?.name ?? "new"}-${context.customer?.mobile ?? ""}`}
            fields={publicRentalFormFields((key) => t(key))}
            schema={publicRentalFormSchema}
            defaultValues={defaultValues}
            onSubmit={async (values) => {
              await onSubmitForm(values);
            }}
            submitLabel={t("save")}
            submittingLabel={t("saving")}
            submitDisabled={formPending}
          />
        ) : (
          <dl className={styles.grid}>
            <Field label={t("fields.name")} value={context.customer?.name ?? "—"} />
            <Field
              label={t("fields.mobile")}
              value={context.customer?.mobile ?? "—"}
              ltr
            />
            <Field label={t("fields.email")} value={context.customer?.email ?? "—"} ltr />
            <Field
              label={t("fields.nationality")}
              value={context.customer?.nationality ?? "—"}
            />
            <Field
              label={t("fields.identityNumber")}
              value={context.customer?.identityNumber ?? "—"}
              ltr
            />
            <Field
              label={t("fields.passportNumber")}
              value={context.customer?.passportNumber ?? "—"}
              ltr
            />
            <Field label={t("fields.address")} value={context.customer?.address ?? "—"} />
          </dl>
        )}
      </section>

      {canAccept ? (
        <>
          <label className={styles.consent}>
            <Checkbox
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
              aria-label={t("acceptance")}
            />
            <span>{t("acceptance")}</span>
          </label>
          <div className={styles.accept}>
            <Button
              type="button"
              loading={acceptPending}
              disabled={!accepted || acceptPending}
              onClick={() => void onAccept()}
            >
              {t("accept")}
            </Button>
          </div>
        </>
      ) : null}

      {signed ? <p className={styles.bodyNote}>{t("alreadyAccepted")}</p> : null}
      {formError ? (
        <p className={styles.note} role="alert">
          {formError}
        </p>
      ) : null}
    </article>
  );
}
