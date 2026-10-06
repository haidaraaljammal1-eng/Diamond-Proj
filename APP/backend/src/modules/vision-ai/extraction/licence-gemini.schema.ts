import { z } from "zod";
import {
  normalizePrintedDate,
  preferDayFirstForLicenceContext,
} from "src/modules/vision-ai/extraction/date-normalize";
import type { ParsedLicenceVisual } from "src/modules/vision-ai/extraction/licence-date-gemini.schema";
import { cleanOptionalText } from "src/modules/vision-ai/extraction/field-normalize";
import { VisionAIError } from "src/modules/vision-ai/vision-ai.errors";

export const GeminiLicenceRawSchema = z
  .object({
    fullName: z.string().nullable().optional(),
    licenceNumber: z.string().nullable().optional(),
    nationality: z.string().nullable().optional(),
    dateOfBirth: z.string().nullable().optional(),
    issueDate: z.string().nullable().optional(),
    expiryDate: z.string().nullable().optional(),
    issuingCountry: z.string().nullable().optional(),
    issuingAuthority: z.string().nullable().optional(),
  })
  .strict();

export const GEMINI_LICENCE_JSON_SCHEMA = {
  type: "object",
  properties: {
    fullName: { type: "string", nullable: true },
    licenceNumber: { type: "string", nullable: true },
    nationality: { type: "string", nullable: true },
    dateOfBirth: {
      type: "string",
      nullable: true,
      description:
        "Printed Date of Birth as on the card (e.g. DD/MM/YYYY). Do not convert to ISO. null if unreadable.",
    },
    issueDate: {
      type: "string",
      nullable: true,
      description:
        "Printed Issue Date as on the card (e.g. DD/MM/YYYY). Do not convert to ISO. null if unreadable.",
    },
    expiryDate: {
      type: "string",
      nullable: true,
      description:
        "Printed Expiry Date as on the card (e.g. DD/MM/YYYY). Do not convert to ISO. null if unreadable.",
    },
    issuingCountry: { type: "string", nullable: true },
    issuingAuthority: { type: "string", nullable: true },
  },
  additionalProperties: false,
} as const;

export function parseGeminiLicenceRaw(input: unknown): ParsedLicenceVisual {
  const parsed = GeminiLicenceRawSchema.safeParse(input);
  if (!parsed.success) {
    throw new VisionAIError("VISION_AI_SCHEMA_INVALID", "Licence response failed schema validation");
  }
  const raw = parsed.data;
  const issuingCountry = cleanOptionalText(raw.issuingCountry);
  const nationality = cleanOptionalText(raw.nationality);
  const preferDayFirst = preferDayFirstForLicenceContext(issuingCountry, nationality);

  const dob = normalizePrintedDate(raw.dateOfBirth, { preferDayFirst });
  const issue = normalizePrintedDate(raw.issueDate, { preferDayFirst });
  const expiry = normalizePrintedDate(raw.expiryDate, { preferDayFirst });

  return {
    fullName: cleanOptionalText(raw.fullName),
    licenceNumber: cleanOptionalText(raw.licenceNumber),
    nationality,
    dateOfBirth: dob.iso,
    issueDate: issue.iso,
    expiryDate: expiry.iso,
    issuingCountry,
    issuingAuthority: cleanOptionalText(raw.issuingAuthority),
    dateOfBirthNeedsReview: dob.ambiguous,
    issueDateNeedsReview: issue.ambiguous,
    expiryDateNeedsReview: expiry.ambiguous,
  };
}
