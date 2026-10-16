"use client";

import { useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button/button";
import { Icon } from "@/shared/components/ui/icon/icon";
import { FieldRenderer } from "@/shared/components/forms/form-builder/field-renderer";
import type { PublicRentalReviewFormValues } from "../../schemas/public-rental-review.schema";
import { VerifiedDocumentValue } from "../verified-document-value/verified-document-value";
import {
  RENTER_REVIEW_SEVEN_FIELD_NAMES,
  renterReviewSevenEditFields,
  renterReviewSevenFieldLabel,
} from "../../utils/renter-review-seven-fields";
import grid from "../../styles/public-rental-field-grid.module.css";
import formStyles from "@/shared/components/forms/form-builder/form-builder.module.css";
import styles from "./renter-information-review.module.css";

interface RenterInformationReviewProps {
  reviewEditMode: boolean;
  formPending: boolean;
  licenseExpiryReadOnly: boolean;
  showActions?: boolean;
  onStartEdit: () => void;
  onSaveChanges: () => void;
}

function display(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "—";
}

export function RenterInformationReview({
  reviewEditMode,
  formPending,
  licenseExpiryReadOnly,
  showActions = true,
  onStartEdit,
  onSaveChanges,
}: RenterInformationReviewProps) {
  const t = useTranslations("PublicRental.renterReview");
  const tc = useTranslations("PublicRental.contract");
  const watched = useWatch<PublicRentalReviewFormValues>();

  const editFields = renterReviewSevenEditFields((key) => tc(key), licenseExpiryReadOnly);

  return (
    <section className={styles.root} data-testid="renter-information-review">
      <h3 className={styles.title}>{t("title")}</h3>

      {reviewEditMode ? (
        <div className={styles.editPane} data-testid="renter-review-edit">
          <div className={formStyles.fields}>
            {editFields.map((field) => (
              <div key={String(field.name)} className={formStyles.full}>
                <FieldRenderer field={field} />
              </div>
            ))}
          </div>
          <div className={styles.actions}>
            <Button
              type="button"
              variant="secondary"
              size="md"
              data-testid="renter-review-save"
              disabled={formPending}
              onClick={onSaveChanges}
            >
              {t("saveChanges")}
            </Button>
          </div>
        </div>
      ) : (
        <div className={grid.gridTwo} data-testid="renter-review-summary">
          {RENTER_REVIEW_SEVEN_FIELD_NAMES.map((name) => {
            const ltr =
              name === "passportNumber" ||
              name === "drivingLicenseNumber" ||
              name === "drivingLicenseExpiryDate" ||
              name === "mobile";
            return (
              <VerifiedDocumentValue
                key={name}
                label={renterReviewSevenFieldLabel(name, (key) => tc(key))}
                value={display(watched[name])}
                testId={`review-${name}`}
                ltr={ltr}
              />
            );
          })}
        </div>
      )}

      <p className={styles.notice} role="note">
        <Icon name="mdi:information-outline" size={18} aria-hidden />
        {t("responsibilityNotice")}
      </p>

      {showActions && !reviewEditMode ? (
        <div className={styles.actions}>
          <Button
            type="button"
            variant="secondary"
            size="md"
            data-testid="renter-review-edit"
            onClick={onStartEdit}
            disabled={formPending}
          >
            {t("editInformation")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
