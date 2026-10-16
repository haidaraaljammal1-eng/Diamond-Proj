"use client";

import { useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button/button";
import { Card } from "@/shared/components/ui/card/card";
import { FieldRenderer } from "@/shared/components/forms/form-builder/field-renderer";
import type { PublicRentalReviewFormValues } from "../../schemas/public-rental-review.schema";
import { publicRentalReviewFormSchema } from "../../schemas/public-rental-review.schema";
import { publicRentalFormFields } from "../../schemas/public-rental-form.fields";
import type { PublicRentalContext } from "../../types/public-rental.types";
import {
  renterReviewMountKey,
  resolveRenterReviewDefaults,
} from "../../utils/resolve-renter-review-defaults";
import { RENTER_REVIEW_SEVEN_FIELD_NAMES } from "../../utils/renter-review-seven-fields";
import {
  isOriginalRenterFormEditable,
  isReviewBlockEditable,
  RENTER_PERSONAL_FIELD_NAMES,
  resolveRenterDetailsUiMode,
} from "../../utils/renter-details-ui-mode";
import formStyles from "@/shared/components/forms/form-builder/form-builder.module.css";
import { RenterInformationReview } from "../renter-information-review/renter-information-review";
import { markPublicRenterReviewEditOpened } from "../../api/public-rental.api";
import { RenterDetailsLockedSummary } from "./renter-details-locked-summary";
import styles from "./renter-details-step.module.css";

interface RenterDetailsStepProps {
  rentalToken: string;
  context: PublicRentalContext;
  formPending: boolean;
  formError: string | null;
  readOnly: boolean;
  onSubmitForm: (values: PublicRentalReviewFormValues) => Promise<void>;
}

export function RenterDetailsStep({
  rentalToken,
  context,
  formPending,
  formError,
  readOnly,
  onSubmitForm,
}: RenterDetailsStepProps) {
  const t = useTranslations("PublicRental.renter");
  const tr = useTranslations("PublicRental.renterReview");
  const tc = useTranslations("PublicRental.contract");
  const [hasEnteredReview, setHasEnteredReview] = useState(false);
  const [reviewEditMode, setReviewEditMode] = useState(false);
  const mountKey = useMemo(() => renterReviewMountKey(context), [context]);
  const defaultValues = useMemo(
    () => resolveRenterReviewDefaults(context),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount key is the stability boundary
    [mountKey],
  );
  const licenseExpiryReadOnly = context.licenseVerification.status !== "VALID";

  const methods = useForm<PublicRentalReviewFormValues, unknown, PublicRentalReviewFormValues>({
    resolver: zodResolver(publicRentalReviewFormSchema),
    defaultValues,
  });

  const uiMode = resolveRenterDetailsUiMode(hasEnteredReview, reviewEditMode);
  const originalFormEditable = isOriginalRenterFormEditable(uiMode);
  const reviewBlockEditable = isReviewBlockEditable(uiMode);

  const personalFields = useMemo(() => publicRentalFormFields((key) => tc(key)), [tc]);

  const enterReview = async () => {
    const valid = await methods.trigger([...RENTER_PERSONAL_FIELD_NAMES]);
    if (!valid) return;
    setHasEnteredReview(true);
    setReviewEditMode(false);
  };

  const startReviewEdit = () => {
    setReviewEditMode(true);
    void markPublicRenterReviewEditOpened(rentalToken).catch((error: unknown) => {
      console.error("Failed to persist renter review edit marker", error);
    });
  };

  const saveReviewChanges = async () => {
    const valid = await methods.trigger([...RENTER_REVIEW_SEVEN_FIELD_NAMES]);
    if (!valid) return;
    setReviewEditMode(false);
  };

  const confirmAndSubmit = async () => {
    if (!hasEnteredReview || reviewEditMode) return;
    const valid = await methods.trigger();
    if (!valid) return;
    await onSubmitForm(methods.getValues());
  };

  if (readOnly) {
    return (
      <Card data-testid="renter-details-step">
        <Card.Title>{t("title")}</Card.Title>
        <FormProvider {...methods} key={mountKey}>
          <RenterInformationReview
            reviewEditMode={false}
            formPending={false}
            licenseExpiryReadOnly={true}
            showActions={false}
            onStartEdit={() => undefined}
            onSaveChanges={() => undefined}
          />
        </FormProvider>
      </Card>
    );
  }

  return (
    <Card data-testid="renter-details-step">
      <Card.Title>{t("title")}</Card.Title>
      <p className={styles.intro}>{t("intro")}</p>

      <FormProvider {...methods} key={mountKey}>
        <>
          <div className={styles.editableSection} data-testid="renter-details-form">
            {originalFormEditable ? (
              <>
                <div className={formStyles.fields}>
                  {personalFields.map((field) => (
                    <div
                      key={String(field.name)}
                      className={field.colSpan === 1 ? undefined : formStyles.full}
                    >
                      <FieldRenderer field={field} />
                    </div>
                  ))}
                </div>
                <div className={styles.enterReviewRow}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    data-testid="renter-continue-to-review"
                    disabled={formPending}
                    onClick={() => void enterReview()}
                  >
                    {tr("continueToReview")}
                  </Button>
                </div>
              </>
            ) : (
              <RenterDetailsLockedSummary />
            )}
          </div>

          {hasEnteredReview ? (
            <RenterInformationReview
              reviewEditMode={reviewBlockEditable}
              formPending={formPending}
              licenseExpiryReadOnly={licenseExpiryReadOnly}
              onStartEdit={startReviewEdit}
              onSaveChanges={() => void saveReviewChanges()}
            />
          ) : null}

          {hasEnteredReview ? (
            <div className={styles.confirmRow}>
              <Button
                type="button"
                variant="primary"
                size="lg"
                data-testid="renter-review-confirm"
                loading={formPending}
                disabled={formPending || reviewEditMode}
                onClick={() => void confirmAndSubmit()}
              >
                {tr("confirmAndContinue")}
              </Button>
            </div>
          ) : null}
        </>
      </FormProvider>

      {formError ? (
        <p className={styles.error} role="alert">
          {formError}
        </p>
      ) : null}
    </Card>
  );
}
