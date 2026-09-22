import { TARS_ERROR_REASONS } from "src/modules/integrations/tars/tars.errors";
import type {
  TarsAuthReadinessResult,
  TarsCompleteContractInput,
  TarsContractAcceptanceInput,
  TarsCreateRentalInput,
  TarsDigitalAcceptanceInput,
  TarsDrivingLicenseInquiryInput,
  TarsDrivingLicenseInquiryResult,
  TarsHandoverEvidenceInput,
  TarsHandoverInput,
  TarsOtpRequestInput,
  TarsOtpRequestResult,
  TarsOtpVerifyInput,
  TarsOtpVerifyResult,
  TarsProvider,
  TarsProviderResult,
  TarsRegisterContractInput,
  TarsReturnEvidenceInput,
  TarsReturnInput,
  TarsReturnRentalInput,
  TarsSettleRentalInput,
  TarsUpdateRentalInput,
  TarsUploadAttachmentInput,
  TarsUploadAttachmentResult,
  TarsVehicleIdentityResult,
  TarsVehicleLookupInput,
  TarsAsyncStatusResult,
} from "src/modules/integrations/tars/tars.types";

/**
 * Fail-closed TARS provider — the only provider that exists today.
 * Fabricates nothing: no external ids, no async acceptance, no OTP success.
 */
export class TarsUnconfiguredProvider implements TarsProvider {
  readonly name = "none";
  readonly configured = false;

  constructor(readonly companyCode: string) {}

  private notConfigured(): TarsProviderResult {
    return { success: false, errorCode: TARS_ERROR_REASONS.NOT_CONFIGURED };
  }

  private otpNotConfigured(): TarsOtpRequestResult {
    return { success: false, errorCode: TARS_ERROR_REASONS.NOT_CONFIGURED };
  }

  private identityNotConfigured(): TarsVehicleIdentityResult {
    return { success: false, errorCode: TARS_ERROR_REASONS.NOT_CONFIGURED };
  }

  async checkAuthReadiness(): Promise<TarsAuthReadinessResult> {
    return { ready: false, errorCode: TARS_ERROR_REASONS.NOT_CONFIGURED };
  }

  async createRental(_input: TarsCreateRentalInput): Promise<TarsProviderResult> {
    return this.notConfigured();
  }

  async updateRental(_input: TarsUpdateRentalInput): Promise<TarsProviderResult> {
    return this.notConfigured();
  }

  async returnRental(_input: TarsReturnRentalInput): Promise<TarsProviderResult> {
    return this.notConfigured();
  }

  async settleRental(_input: TarsSettleRentalInput): Promise<TarsProviderResult> {
    return this.notConfigured();
  }

  async getAsyncRequestStatus(_providerRequestId: string): Promise<TarsAsyncStatusResult> {
    return { status: "FAILED", errorCode: TARS_ERROR_REASONS.NOT_CONFIGURED };
  }

  async requestContractOtp(_input: TarsOtpRequestInput): Promise<TarsOtpRequestResult> {
    return this.otpNotConfigured();
  }

  async verifyContractOtp(_input: TarsOtpVerifyInput): Promise<TarsOtpVerifyResult> {
    return { success: false, errorCode: TARS_ERROR_REASONS.NOT_CONFIGURED };
  }

  async lookupVehicle(_input: TarsVehicleLookupInput): Promise<TarsVehicleIdentityResult> {
    return this.identityNotConfigured();
  }

  async registerVehicleIfRequired(_input: TarsVehicleLookupInput): Promise<TarsVehicleIdentityResult> {
    return this.identityNotConfigured();
  }

  async inquireDrivingLicense(
    _input: TarsDrivingLicenseInquiryInput,
  ): Promise<TarsDrivingLicenseInquiryResult> {
    return { success: false, errorCode: TARS_ERROR_REASONS.NOT_CONFIGURED };
  }

  async uploadAttachment(_input: TarsUploadAttachmentInput): Promise<TarsUploadAttachmentResult> {
    return { success: false, errorCode: TARS_ERROR_REASONS.NOT_CONFIGURED };
  }

  async submitHandoverEvidence(_input: TarsHandoverEvidenceInput): Promise<TarsProviderResult> {
    return this.notConfigured();
  }

  async submitReturnEvidence(_input: TarsReturnEvidenceInput): Promise<TarsProviderResult> {
    return this.notConfigured();
  }

  async linkDigitalAcceptance(_input: TarsDigitalAcceptanceInput): Promise<TarsProviderResult> {
    return this.notConfigured();
  }

  async registerContract(_input: TarsRegisterContractInput): Promise<TarsProviderResult> {
    return this.notConfigured();
  }

  async submitContractAcceptance(
    _input: TarsContractAcceptanceInput,
  ): Promise<TarsProviderResult> {
    return this.notConfigured();
  }

  async submitHandover(_input: TarsHandoverInput): Promise<TarsProviderResult> {
    return this.notConfigured();
  }

  async submitReturn(_input: TarsReturnInput): Promise<TarsProviderResult> {
    return this.notConfigured();
  }

  async completeContract(_input: TarsCompleteContractInput): Promise<TarsProviderResult> {
    return this.notConfigured();
  }
}
