import type {
  DrivingLicenseOcrInput,
  DrivingLicenseOcrProvider,
  DrivingLicenseOcrResult,
} from "src/modules/contracts/ocr/driving-license-ocr.types";

/** Runtime default: extraction is unavailable. Never invents license facts. */
export class UnconfiguredDrivingLicenseOcrProvider implements DrivingLicenseOcrProvider {
  readonly name = "none";

  async analyzeDrivingLicense(_input: DrivingLicenseOcrInput): Promise<DrivingLicenseOcrResult> {
    return { ok: false, reason: "NOT_CONFIGURED", provider: this.name };
  }
}
