import type {
  DocumentOcrProvider,
  DocumentOcrProviderResult,
} from "src/modules/document-ocr/document-ocr.types";

/**
 * Deterministic OCR provider for automated tests ONLY. Lives outside `src/`,
 * is never built, and has no env switch. Inject via
 * `setDocumentOcrProviderForTests`. All values are synthetic.
 */
export interface FakeLicenseInput {
  licenseNumber?: string | null;
  expiryDate?: string | null;
  confidence?: number;
}

export type FakeOcrResponder = () => Promise<DocumentOcrProviderResult> | DocumentOcrProviderResult;

export const SYNTHETIC_PASSPORT = {
  fullName: "TEST PERSON",
  passportNumber: "TEST123456",
  nationality: "TEST",
} as const;

export function fakeLicenseResult(input: FakeLicenseInput = {}): DocumentOcrProviderResult {
  return {
    ok: true,
    documentRecognized: true,
    fields: {
      driverLicenseNumber: input.licenseNumber !== undefined ? input.licenseNumber : "DL-OK",
      driverLicenseExpiryDate: input.expiryDate !== undefined ? input.expiryDate : "2031-06-01",
    },
    confidence: input.confidence ?? 0.99,
  };
}

export function fakePassportResult(
  fields: Record<string, unknown> = SYNTHETIC_PASSPORT,
): DocumentOcrProviderResult {
  return {
    ok: true,
    documentRecognized: true,
    fields: fields as never,
    confidence: 0.97,
  };
}

export function createFakeDocumentOcrProvider(initial?: {
  license?: FakeOcrResponder;
  passport?: FakeOcrResponder;
}) {
  let license: FakeOcrResponder = initial?.license ?? (() => fakeLicenseResult());
  let passport: FakeOcrResponder = initial?.passport ?? (() => fakePassportResult());
  const calls: string[] = [];

  const provider: DocumentOcrProvider = {
    name: "test",
    capabilities: { supportsDriverLicense: true, supportsPassport: true },
    async analyze({ documentType }) {
      calls.push(documentType);
      return documentType === "PASSPORT" ? passport() : license();
    },
  };

  return {
    provider,
    calls,
    setLicense(responder: FakeOcrResponder | FakeLicenseInput) {
      license = typeof responder === "function" ? responder : () => fakeLicenseResult(responder);
    },
    setPassport(responder: FakeOcrResponder) {
      passport = responder;
    },
  };
}
