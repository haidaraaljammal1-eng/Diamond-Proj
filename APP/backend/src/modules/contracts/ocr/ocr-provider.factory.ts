import { env } from "src/config/env";
import { AzureDocumentIntelligenceProvider } from "src/modules/contracts/ocr/azure-document-intelligence.provider";
import type { DrivingLicenseOcrProvider } from "src/modules/contracts/ocr/driving-license-ocr.types";
import { UnconfiguredDrivingLicenseOcrProvider } from "src/modules/contracts/ocr/unconfigured-ocr.provider";

let override: DrivingLicenseOcrProvider | undefined;

export function setDrivingLicenseOcrProviderForTests(
  provider: DrivingLicenseOcrProvider | undefined,
): void {
  override = provider;
}

export function createDrivingLicenseOcrProvider(): DrivingLicenseOcrProvider {
  if (override) return override;
  if (env.DOCUMENT_OCR_PROVIDER === "azure") {
    return new AzureDocumentIntelligenceProvider();
  }
  return new UnconfiguredDrivingLicenseOcrProvider();
}
