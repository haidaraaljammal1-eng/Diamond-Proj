"use client";

import { useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import type { PublicRentalReviewFormValues } from "../../schemas/public-rental-review.schema";
import { VerifiedDocumentValue } from "../verified-document-value/verified-document-value";
import { RENTER_PERSONAL_FIELD_NAMES } from "../../utils/renter-details-ui-mode";
import grid from "../../styles/public-rental-field-grid.module.css";

function display(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "—";
}

const LABEL_KEYS: Record<(typeof RENTER_PERSONAL_FIELD_NAMES)[number], string> = {
  name: "fields.name",
  mobile: "fields.mobile",
  nationality: "fields.nationality",
  address: "fields.address",
};

export function RenterDetailsLockedSummary() {
  const tc = useTranslations("PublicRental.contract");
  const watched = useWatch<PublicRentalReviewFormValues>();

  return (
    <div className={grid.gridTwo} data-testid="renter-details-locked">
      {RENTER_PERSONAL_FIELD_NAMES.map((name) => (
        <VerifiedDocumentValue
          key={name}
          label={tc(LABEL_KEYS[name])}
          value={display(watched[name])}
          testId={`renter-locked-${name}`}
          ltr={name === "mobile"}
        />
      ))}
    </div>
  );
}
