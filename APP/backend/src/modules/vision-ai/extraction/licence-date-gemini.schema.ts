import { z } from "zod";
import {
  normalizePrintedDate,
  preferDayFirstForLicenceContext,
} from "src/modules/vision-ai/extraction/date-normalize";
import { cleanOptionalText } from "src/modules/vision-ai/extraction/field-normalize";
import type { DrivingLicenceVisualFields } from "src/modules/vision-ai/identity-document.types";
import { VisionAIError } from "src/modules/vision-ai/vision-ai.errors";

export const GeminiLicenceDatesOnlyRawSchema = z
  .object({
    dateOfBirth: z.string().nullable().optional(),
    issueDate: z.string().nullable().optional(),
    expiryDate: z.string().nullable().optional(),
  })
  .strict();

export const GEMINI_LICENCE_DATES_ONLY_JSON_SCHEMA = {
  type: "object",
  properties: {
    dateOfBirth: {
      type: "string",
      nullable: true,
      description: "Printed Date of Birth value exactly as on the card, or null if unreadable.",
    },
    issueDate: {
      type: "string",
      nullable: true,
      description: "Printed Issue Date value exactly as on the card, or null if unreadable.",
    },
    expiryDate: {
      type: "string",
      nullable: true,
      description: "Printed Expiry Date value exactly as on the card, or null if unreadable.",
    },
  },
  additionalProperties: false,
} as const;

export const GEMINI_LICENCE_DATES_ONLY_SYSTEM_INSTRUCTION = `You read driving licence date fields from an identity document image.
For each date field:
1. Locate the visible printed label (Date of Birth, DOB, Birth Date, Issue Date, Date of Issue, Expiry Date, Expiry, Valid Until).
2. Read only the value physically associated with that label.
3. Do not use another nearby date.
4. Do not infer missing dates.
5. Return the printed value as seen (keep slashes or dashes).
6. If the label exists but the value is unreadable, return null.
Never swap Issue Date with Expiry Date.`;

export type LicenceDateReviewFlags = {
  dateOfBirthNeedsReview: boolean;
  issueDateNeedsReview: boolean;
  expiryDateNeedsReview: boolean;
};

export type ParsedLicenceVisual = DrivingLicenceVisualFields & LicenceDateReviewFlags;

function normalizeLicenceDateFields(
  raw: { dateOfBirth?: string | null; issueDate?: string | null; expiryDate?: string | null },
  preferDayFirst: boolean,
): Pick<ParsedLicenceVisual, "dateOfBirth" | "issueDate" | "expiryDate" | LicenceDateReviewFlags> {
  const dob = normalizePrintedDate(raw.dateOfBirth, { preferDayFirst });
  const issue = normalizePrintedDate(raw.issueDate, { preferDayFirst });
  const expiry = normalizePrintedDate(raw.expiryDate, { preferDayFirst });

  return {
    dateOfBirth: dob.iso,
    issueDate: issue.iso,
    expiryDate: expiry.iso,
    dateOfBirthNeedsReview: dob.ambiguous,
    issueDateNeedsReview: issue.ambiguous,
    expiryDateNeedsReview: expiry.ambiguous,
  };
}

export function parseGeminiLicenceDatesOnlyRaw(
  input: unknown,
  context: { issuingCountry: string | null; nationality: string | null },
): Pick<ParsedLicenceVisual, "dateOfBirth" | "issueDate" | "expiryDate" | LicenceDateReviewFlags> {
  const parsed = GeminiLicenceDatesOnlyRawSchema.safeParse(input);
  if (!parsed.success) {
    throw new VisionAIError("VISION_AI_SCHEMA_INVALID", "Licence dates response failed schema validation");
  }
  const preferDayFirst = preferDayFirstForLicenceContext(context.issuingCountry, context.nationality);
  return normalizeLicenceDateFields(parsed.data, preferDayFirst);
}

export function mergeLicenceDateFields(
  base: ParsedLicenceVisual,
  patch: Pick<ParsedLicenceVisual, "dateOfBirth" | "issueDate" | "expiryDate" | LicenceDateReviewFlags>,
): ParsedLicenceVisual {
  return {
    ...base,
    dateOfBirth: base.dateOfBirth ?? patch.dateOfBirth,
    issueDate: base.issueDate ?? patch.issueDate,
    expiryDate: base.expiryDate ?? patch.expiryDate,
    dateOfBirthNeedsReview: base.dateOfBirthNeedsReview || (patch.dateOfBirthNeedsReview && !base.dateOfBirth),
    issueDateNeedsReview: base.issueDateNeedsReview || (patch.issueDateNeedsReview && !base.issueDate),
    expiryDateNeedsReview: base.expiryDateNeedsReview || (patch.expiryDateNeedsReview && !base.expiryDate),
  };
}
