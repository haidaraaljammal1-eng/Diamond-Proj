import { z } from "zod";
import { cleanIsoDate, cleanOptionalText, cleanSex } from "src/modules/vision-ai/extraction/field-normalize";
import type { PassportVisualFields } from "src/modules/vision-ai/identity-document.types";
import { VisionAIError } from "src/modules/vision-ai/vision-ai.errors";

export const GeminiPassportRawSchema = z
  .object({
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  fullName: z.string().nullable().optional(),
  passportNumber: z.string().nullable().optional(),
  nationality: z.string().nullable().optional(),
  dateOfBirth: z.string().nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  sex: z.string().nullable().optional(),
  issuingCountry: z.string().nullable().optional(),
  mrzLine1: z.string().nullable().optional(),
  mrzLine2: z.string().nullable().optional(),
})
  .strict();

export const GEMINI_PASSPORT_JSON_SCHEMA = {
  type: "object",
  properties: {
    firstName: { type: "string", nullable: true },
    lastName: { type: "string", nullable: true },
    fullName: { type: "string", nullable: true },
    passportNumber: { type: "string", nullable: true },
    nationality: { type: "string", nullable: true },
    dateOfBirth: { type: "string", nullable: true },
    expiryDate: { type: "string", nullable: true },
    sex: { type: "string", nullable: true },
    issuingCountry: { type: "string", nullable: true },
    mrzLine1: { type: "string", nullable: true },
    mrzLine2: { type: "string", nullable: true },
  },
  additionalProperties: false,
} as const;

export function parseGeminiPassportRaw(input: unknown): PassportVisualFields {
  const parsed = GeminiPassportRawSchema.safeParse(input);
  if (!parsed.success) {
    throw new VisionAIError("VISION_AI_SCHEMA_INVALID", "Passport response failed schema validation");
  }
  const raw = parsed.data;
  return {
    firstName: cleanOptionalText(raw.firstName),
    lastName: cleanOptionalText(raw.lastName),
    fullName: cleanOptionalText(raw.fullName),
    passportNumber: cleanOptionalText(raw.passportNumber),
    nationality: cleanOptionalText(raw.nationality),
    dateOfBirth: cleanIsoDate(raw.dateOfBirth),
    expiryDate: cleanIsoDate(raw.expiryDate),
    sex: cleanSex(raw.sex),
    issuingCountry: cleanOptionalText(raw.issuingCountry),
    mrzLine1: cleanOptionalText(raw.mrzLine1),
    mrzLine2: cleanOptionalText(raw.mrzLine2),
  };
}
