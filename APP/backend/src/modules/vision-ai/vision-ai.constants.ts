/**
 * Provider-neutral Vision AI constants.
 *
 * Runtime provider ids are a closed list. Test doubles are injected only via
 * `setVisionAIProviderForTests` in non-production environments.
 */
export const AI_VISION_PROVIDER_IDS = ["unconfigured", "gemini"] as const;
export type AiVisionProviderId = (typeof AI_VISION_PROVIDER_IDS)[number];

export const VISION_AI_CONNECTION_ERROR_CODES = [
  "NOT_CONFIGURED",
  "PROVIDER_MISMATCH",
  "INVALID_RESPONSE",
  "PROVIDER_ERROR",
] as const;
export type VisionAIConnectionErrorCode = (typeof VISION_AI_CONNECTION_ERROR_CODES)[number];

export const VISION_AI_NOT_IMPLEMENTED_CODE = "VISION_AI_NOT_IMPLEMENTED" as const;

/** Diagnostic prompt — no customer data, no images. */
export const GEMINI_CONNECTION_TEST_PROMPT = "Return exactly:\nDIAMOND_GEMINI_OK";
export const GEMINI_CONNECTION_TEST_MARKER = "DIAMOND_GEMINI_OK";

export const LEGACY_UNCONFIGURED_AI_VISION_VALUES = ["", "none"] as const;

export const GEMINI_PASSPORT_SYSTEM_INSTRUCTION = `You extract passport data page fields from an identity document image.
Extract only visibly present information.
Never infer missing values.
Never guess document numbers.
Never guess dates.
Never correct names.
Return null when unreadable.
Do not determine legal validity.
Follow the supplied JSON schema exactly.`;

export const GEMINI_LICENCE_SYSTEM_INSTRUCTION = `You extract driving licence fields from an identity document image.
The licence may be from any country — do not assume UAE format unless visible on the card.
Extract only visibly present information.
Never infer missing values.
Never guess document numbers.
Never correct names.
Return null when unreadable.
Do not determine legal validity or whether the licence is expired.

For dateOfBirth, issueDate, and expiryDate:
1. Locate the visible printed label (Date of Birth / DOB / Birth Date; Issue Date / Date of Issue; Expiry Date / Expiry / Valid Until).
2. Read only the value physically associated with that label.
3. Do not use another nearby date.
4. Do not swap Issue Date with Expiry Date.
5. Return the printed date string as seen on the card (keep DD/MM/YYYY or similar). Do not convert to ISO.
6. If the label exists but the value is unreadable, return null.

Follow the supplied JSON schema exactly.`;
