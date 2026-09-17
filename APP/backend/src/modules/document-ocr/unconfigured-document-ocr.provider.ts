import type {
  DocumentOcrProvider,
  DocumentOcrProviderResult,
} from "src/modules/document-ocr/document-ocr.types";

/** Runtime default. Fails closed: never invents names, numbers, or dates. */
export class UnconfiguredDocumentOcrProvider implements DocumentOcrProvider {
  readonly name = "unconfigured";
  readonly capabilities = { supportsDriverLicense: false, supportsPassport: false };

  async analyze(): Promise<DocumentOcrProviderResult> {
    return { ok: false, reason: "DOCUMENT_OCR_PROVIDER_NOT_CONFIGURED" };
  }
}
