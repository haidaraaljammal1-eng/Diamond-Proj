import type { DocumentOcrProvider, DocumentOcrProviderResult } from "./document-ocr.types";

/**
 * Explicit development provider used only by the guarded simulation routes.
 * It returns the same normalized provider-neutral shape as a real OCR adapter.
 */
export function createSimulationDocumentOcrProvider(): DocumentOcrProvider {
  return {
    name: "DEV_SIMULATION",
    capabilities: { supportsDriverLicense: true, supportsPassport: true },
    async analyze({ documentType }): Promise<DocumentOcrProviderResult> {
      if (documentType === "DRIVER_LICENSE") {
        return {
          ok: true,
          documentRecognized: true,
          providerVersion: "dev-v1",
          confidence: 0.99,
          fieldConfidence: { driverLicenseNumber: 0.99, driverLicenseExpiryDate: 0.99 },
          fields: {
            driverLicenseNumber: "DXB-DEV-482731",
            driverLicenseExpiryDate: "2099-12-31",
          },
        };
      }
      return {
        ok: true,
        documentRecognized: true,
        providerVersion: "dev-v1",
        confidence: 0.99,
        fields: {
          fullName: "DEMO CUSTOMER",
          passportNumber: "P1234567",
          nationality: "United Arab Emirates",
          dateOfBirth: "1990-01-01",
          passportIssueDate: "2020-01-01",
          passportExpiryDate: "2099-12-31",
          issuingCountry: "United Arab Emirates",
          sex: "X",
        },
      };
    },
  };
}
