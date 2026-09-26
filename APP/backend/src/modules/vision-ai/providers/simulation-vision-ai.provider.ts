import { buildLicenceStructuredResult } from "src/modules/vision-ai/extraction/licence-postprocess";
import { buildPassportStructuredResult } from "src/modules/vision-ai/extraction/passport-postprocess";
import { visionAiNotImplemented } from "src/modules/vision-ai/vision-ai-not-implemented";
import type {
  VehicleImageCompareInput,
  VisionAIConnectionTestResult,
  VisionAIProvider,
  VisionExtractionResult,
  VisionImageInput,
} from "src/modules/vision-ai/vision-ai.types";

/** Explicit development provider for guarded simulation routes only. */
export function createSimulationVisionAIProvider(): VisionAIProvider {
  return {
    name: "DEV_SIMULATION",
    configured: true,
    async runConnectionTest(): Promise<VisionAIConnectionTestResult> {
      return { ok: true, model: "dev-simulation", markerFound: true };
    },
    async extractPassport(_input: VisionImageInput): Promise<VisionExtractionResult> {
      return {
        ok: true,
        providerVersion: "dev-v1",
        extraction: buildPassportStructuredResult({
          firstName: "DEMO",
          lastName: "CUSTOMER",
          fullName: "DEMO CUSTOMER",
          passportNumber: "P1234567",
          nationality: "United Arab Emirates",
          dateOfBirth: "1990-01-01",
          expiryDate: "2099-12-31",
          sex: "X",
          issuingCountry: "United Arab Emirates",
          mrzLine1: null,
          mrzLine2: null,
        }),
      };
    },
    async extractDrivingLicence(_input: VisionImageInput): Promise<VisionExtractionResult> {
      return {
        ok: true,
        providerVersion: "dev-v1",
        extraction: buildLicenceStructuredResult({
          fullName: null,
          licenceNumber: "DXB-DEV-482731",
          nationality: null,
          dateOfBirth: null,
          issueDate: null,
          expiryDate: "2099-12-31",
          issuingCountry: null,
          issuingAuthority: null,
        }),
      };
    },
    async compareVehicleImages(_input: VehicleImageCompareInput): Promise<never> {
      return visionAiNotImplemented();
    },
  };
}
