/** Renter Details step — single editable surface at a time. */
export type RenterDetailsUiMode = "entry" | "review" | "reviewEdit";

export const RENTER_PERSONAL_FIELD_NAMES = ["name", "mobile", "nationality", "address"] as const;

export function resolveRenterDetailsUiMode(
  hasEnteredReview: boolean,
  reviewEditMode: boolean,
): RenterDetailsUiMode {
  if (!hasEnteredReview) return "entry";
  if (reviewEditMode) return "reviewEdit";
  return "review";
}

export function isOriginalRenterFormEditable(mode: RenterDetailsUiMode): boolean {
  return mode === "entry";
}

export function isReviewBlockEditable(mode: RenterDetailsUiMode): boolean {
  return mode === "reviewEdit";
}
