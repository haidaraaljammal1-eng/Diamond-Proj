import { env } from "src/config/env";
import type {
  DrivingLicenseOcrInput,
  DrivingLicenseOcrProvider,
  DrivingLicenseOcrResult,
} from "src/modules/contracts/ocr/driving-license-ocr.types";

/**
 * Future Azure Document Intelligence adapter.
 *
 * HTTP/SDK integration is intentionally not implemented yet. Missing (or
 * present-but-unused) credentials never invent extraction results.
 */
export class AzureDocumentIntelligenceProvider implements DrivingLicenseOcrProvider {
  readonly name = "azure";

  constructor(
    private readonly endpoint = env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT,
    private readonly key = env.AZURE_DOCUMENT_INTELLIGENCE_KEY,
  ) {}

  async analyzeDrivingLicense(_input: DrivingLicenseOcrInput): Promise<DrivingLicenseOcrResult> {
    if (!this.endpoint || !this.key) {
      return { ok: false, reason: "NOT_CONFIGURED", provider: this.name };
    }
    return { ok: false, reason: "NOT_CONFIGURED", provider: this.name, providerVersion: "pending" };
  }
}
