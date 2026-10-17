import type { PublicRentalContext, PublicRentalFormPayload } from "../types/public-rental.types";

/** Pins active document ids from the latest rental context before POST /form. */
export function syncFormPayloadWithContext(
  payload: PublicRentalFormPayload,
  context: PublicRentalContext,
): PublicRentalFormPayload {
  return {
    ...payload,
    licenseDocumentId: context.licenseVerification.activeDocumentId ?? undefined,
    passportDocumentId: context.identity?.passport.activeDocumentId ?? undefined,
  };
}
