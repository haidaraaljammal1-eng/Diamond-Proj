/**
 * Provider-neutral Document OCR constants.
 *
 * Runtime provider ids are a closed list. A test/fake provider is deliberately
 * NOT a value here: it can only be injected by automated tests.
 *
 * Adding a vendor later = append its id here, implement its adapter, register
 * it in `document-ocr-provider.factory.ts`.
 */
export const DOCUMENT_OCR_PROVIDER_IDS = ["UNCONFIGURED"] as const;
export type DocumentOcrProviderId = (typeof DOCUMENT_OCR_PROVIDER_IDS)[number];

export const DOCUMENT_TYPES = ["DRIVER_LICENSE", "PASSPORT"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_OCR_FAILURE_REASONS = [
  "DOCUMENT_OCR_PROVIDER_NOT_CONFIGURED",
  "DOCUMENT_OCR_NOT_RECOGNIZED",
  "DOCUMENT_OCR_FAILED",
] as const;
export type DocumentOcrFailureReason = (typeof DOCUMENT_OCR_FAILURE_REASONS)[number];

/** Legacy env values from the license-only OCR boundary. Both meant "no working provider". */
export const LEGACY_UNCONFIGURED_PROVIDER_VALUES = ["", "none", "azure"] as const;
