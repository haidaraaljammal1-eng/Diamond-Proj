import { env } from "src/config/env";
import type { DocumentOcrProvider } from "src/modules/document-ocr/document-ocr.types";
import { UnconfiguredDocumentOcrProvider } from "src/modules/document-ocr/unconfigured-document-ocr.provider";

let testProvider: DocumentOcrProvider | undefined;

/**
 * Automated-test injection only. Refused in production so a fake provider can
 * never become the runtime OCR authority.
 */
export function setDocumentOcrProviderForTests(provider: DocumentOcrProvider | undefined): void {
  if (env.NODE_ENV === "production") {
    throw new Error("Document OCR test provider cannot be injected in production");
  }
  testProvider = provider;
}

/** The only place a runtime OCR provider is selected. */
export function createDocumentOcrProvider(): DocumentOcrProvider {
  if (testProvider && env.NODE_ENV !== "production") return testProvider;
  switch (env.DOCUMENT_OCR_PROVIDER) {
    // Future vendors register here, e.g. `case "AZURE_DOCUMENT_INTELLIGENCE":`.
    case "UNCONFIGURED":
    default:
      return new UnconfiguredDocumentOcrProvider();
  }
}
