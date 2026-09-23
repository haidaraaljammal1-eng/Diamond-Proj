import { ErrorCode } from "src/constants/error-codes";
import { AppError } from "src/lib/errors/app-error";
import type { ContractStatus } from "@prisma/client";

function err(
  code: (typeof ErrorCode)[keyof typeof ErrorCode],
  message: string,
  reason: string,
  extra?: Record<string, unknown>,
): AppError {
  return new AppError({ code, message, context: { reason, ...extra } });
}

export const contractError = {
  notFound: () => err(ErrorCode.NOT_FOUND, "Contract not found", "CONTRACT_NOT_FOUND"),
  invalidTransition: (from: ContractStatus | string, to: ContractStatus | string) =>
    err(ErrorCode.CONFLICT, "Contract status transition is not allowed", "CONTRACT_INVALID_TRANSITION", {
      from,
      to,
    }),
  vehicleNotAvailable: () =>
    err(ErrorCode.CONFLICT, "Vehicle is not available for rental", "VEHICLE_NOT_AVAILABLE"),
  vehicleAlreadyRented: () =>
    err(ErrorCode.CONFLICT, "Vehicle is already reserved or rented", "VEHICLE_ALREADY_RENTED"),
  vehicleNotRented: () =>
    err(ErrorCode.CONFLICT, "Vehicle must be marked as rented for this action", "VEHICLE_NOT_RENTED"),
  linkInvalid: () =>
    err(ErrorCode.TOKEN_INVALID, "Contract link is invalid", "CONTRACT_LINK_INVALID"),
  linkExpired: () =>
    err(ErrorCode.TOKEN_EXPIRED, "Contract link has expired", "CONTRACT_LINK_EXPIRED"),
  linkUsed: () => err(ErrorCode.TOKEN_INVALID, "Contract link has already been used", "CONTRACT_LINK_USED"),
  paymentRequired: () =>
    err(ErrorCode.CONFLICT, "A confirmed payment is required", "CONTRACT_PAYMENT_REQUIRED"),
  carOutRequired: () =>
    err(ErrorCode.CONFLICT, "Car-Out is required before this action", "CONTRACT_CAR_OUT_REQUIRED"),
  carInRequired: () =>
    err(ErrorCode.CONFLICT, "Car-In is required before this action", "CONTRACT_CAR_IN_REQUIRED"),
  reconciliationRequired: () =>
    err(
      ErrorCode.CONFLICT,
      "Reconciliation must be approved before closing",
      "CONTRACT_RECONCILIATION_REQUIRED",
    ),
  alreadyClosed: () =>
    err(ErrorCode.CONFLICT, "Contract is already closed", "CONTRACT_ALREADY_CLOSED"),
  renewalOfferRequired: () =>
    err(
      ErrorCode.CONFLICT,
      "A renewal offer must be issued before confirmation",
      "CONTRACT_RENEWAL_OFFER_REQUIRED",
    ),
  vehicleNotFound: () => AppError.notFound("Vehicle not found"),
  customerNotFound: () => AppError.notFound("Customer not found"),
  drivingLicenseRequired: () =>
    err(
      ErrorCode.CONFLICT,
      "A valid driving license is required",
      "DRIVING_LICENSE_REQUIRED",
    ),
  drivingLicenseOcrNotConfigured: () =>
    err(
      ErrorCode.CONFLICT,
      "Driving license verification is not configured",
      "DRIVING_LICENSE_OCR_NOT_CONFIGURED",
    ),
  drivingLicenseUnreadable: () =>
    err(
      ErrorCode.VALIDATION_ERROR,
      "Driving license could not be read",
      "DRIVING_LICENSE_UNREADABLE",
    ),
  drivingLicenseReviewRequired: () =>
    err(
      ErrorCode.VALIDATION_ERROR,
      "Driving license requires another photo",
      "DRIVING_LICENSE_REVIEW_REQUIRED",
    ),
  drivingLicenseExpired: (expiryDate?: string) =>
    err(
      ErrorCode.CONFLICT,
      "Driving license is expired",
      "DRIVING_LICENSE_EXPIRED",
      expiryDate ? { expiryDate } : {},
    ),
  passportLicenseRequired: () =>
    err(
      ErrorCode.CONFLICT,
      "A valid driving license is required before the passport",
      "PASSPORT_LICENSE_REQUIRED",
    ),
  officialContractReviewLocked: () =>
    err(
      ErrorCode.CONFLICT,
      "The official contract can no longer be edited",
      "OFFICIAL_CONTRACT_REVIEW_LOCKED",
    ),
  officialContractFieldLocked: (fields: string[]) =>
    err(
      ErrorCode.FORBIDDEN,
      "These official contract fields cannot be edited from the review link",
      "OFFICIAL_CONTRACT_FIELD_LOCKED",
      { fields },
    ),
  officialSignatureSlotUnavailable: () =>
    err(
      ErrorCode.CONFLICT,
      "This signature cannot be captured at this stage",
      "OFFICIAL_SIGNATURE_SLOT_UNAVAILABLE",
    ),
  officialContractIncomplete: (missing: string[]) =>
    err(
      ErrorCode.CONFLICT,
      "The official contract is not ready to be signed",
      "OFFICIAL_CONTRACT_INCOMPLETE",
      { missing },
    ),
  identityNotReady: () =>
    err(
      ErrorCode.CONFLICT,
      "Driving license and passport must be completed first",
      "CONTRACT_IDENTITY_NOT_READY",
    ),
  publicFormIncomplete: () =>
    err(
      ErrorCode.VALIDATION_ERROR,
      "Public rental form is incomplete",
      "PUBLIC_RENTAL_FORM_INCOMPLETE",
    ),
  notReadyForAcceptance: () =>
    err(
      ErrorCode.CONFLICT,
      "Rental is not ready for acceptance",
      "PUBLIC_RENTAL_NOT_READY_FOR_ACCEPTANCE",
    ),
  paymentProviderNotConfigured: () =>
    err(
      ErrorCode.CONFLICT,
      "Card payment is not configured",
      "PAYMENT_PROVIDER_NOT_CONFIGURED",
    ),
  paymentCheckoutPreparationFailed: () =>
    err(
      ErrorCode.CONFLICT,
      "Payment checkout could not be prepared",
      "PAYMENT_CHECKOUT_PREPARATION_FAILED",
    ),
  paymentAttemptRecoveryFailed: () =>
    err(
      ErrorCode.CONFLICT,
      "A previous payment attempt could not be recovered",
      "PAYMENT_ATTEMPT_RECOVERY_FAILED",
    ),
  paymentProviderTemporarilyUnavailable: () =>
    err(
      ErrorCode.CONFLICT,
      "Card payment is temporarily unavailable",
      "PAYMENT_PROVIDER_TEMPORARILY_UNAVAILABLE",
    ),
  paymentConfigurationError: () =>
    err(
      ErrorCode.CONFLICT,
      "Payment configuration is invalid",
      "PAYMENT_CONFIGURATION_ERROR",
    ),
  paymentCheckoutConfigurationError: (stripe?: Record<string, string | undefined>) =>
    err(
      ErrorCode.CONFLICT,
      "Unable to prepare the payment right now. Please try again.",
      "PAYMENT_CHECKOUT_CONFIGURATION_ERROR",
      stripe,
    ),
  paymentNotAllowed: () =>
    err(ErrorCode.CONFLICT, "Electronic payment is not allowed", "PAYMENT_NOT_ALLOWED"),
  legacyCardLinkDisabled: () =>
    err(
      ErrorCode.NOT_FOUND,
      "Legacy card setup is not available",
      "LEGACY_CARD_LINK_DISABLED",
    ),
  customerIdentityAmbiguous: () =>
    err(
      ErrorCode.CONFLICT,
      "Customer identity could not be resolved safely",
      "CUSTOMER_IDENTITY_AMBIGUOUS",
    ),
  paymentConsentInvalid: () =>
    err(
      ErrorCode.VALIDATION_ERROR,
      "Payment consent version is invalid or inactive",
      "PAYMENT_CONSENT_INVALID",
    ),
  paymentIdempotencyRequired: () =>
    err(ErrorCode.VALIDATION_ERROR, "Idempotency-Key is required", "PAYMENT_IDEMPOTENCY_REQUIRED"),
  paymentAlreadyProcessing: () =>
    err(
      ErrorCode.CONFLICT,
      "A payment attempt is already in progress",
      "PAYMENT_ALREADY_PROCESSING",
    ),
  paymentAttemptNotFound: () =>
    err(ErrorCode.NOT_FOUND, "Payment attempt was not found", "PAYMENT_ATTEMPT_NOT_FOUND"),
  paymentStatusTokenInvalid: () =>
    err(ErrorCode.TOKEN_INVALID, "Payment status token is invalid", "PAYMENT_STATUS_TOKEN_INVALID"),
  paymentStatusTokenExpired: () =>
    err(ErrorCode.TOKEN_EXPIRED, "Payment status token has expired", "PAYMENT_STATUS_TOKEN_EXPIRED"),
  paymentAlreadySettled: () =>
    err(ErrorCode.CONFLICT, "This obligation is already settled", "ALREADY_PAID"),
  reconciliationPaymentRequired: () =>
    err(
      ErrorCode.CONFLICT,
      "Reconciliation charges must be collected before closing",
      "RECONCILIATION_PAYMENT_REQUIRED",
    ),
  manualPaymentDisabled: () =>
    err(
      ErrorCode.CONFLICT,
      "Manual payment confirmation is not available in V1",
      "MANUAL_PAYMENT_DISABLED",
    ),
  invalidPaymentAmount: () =>
    err(ErrorCode.VALIDATION_ERROR, "Payment amount is invalid", "INVALID_PAYMENT_AMOUNT"),
  invalidPaymentCurrency: (currency: string) =>
    err(ErrorCode.VALIDATION_ERROR, "Payment currency is not supported", "INVALID_PAYMENT_CURRENCY", {
      currency,
    }),
  paymentAmountMismatch: () =>
    err(ErrorCode.CONFLICT, "Provider payment amount does not match", "PAYMENT_AMOUNT_MISMATCH"),
  paymentProviderReferenceMismatch: () =>
    err(
      ErrorCode.CONFLICT,
      "Provider reference does not match the payment attempt",
      "PAYMENT_PROVIDER_REFERENCE_MISMATCH",
    ),
  roadLiabilityRequired: () =>
    err(
      ErrorCode.CONFLICT,
      "Salik and traffic violation charges must originate from a confirmed Road Liability",
      "ROAD_LIABILITY_REQUIRED",
    ),
  roadLiabilityNotChargeable: () =>
    err(
      ErrorCode.CONFLICT,
      "This road liability is not eligible for customer charge review",
      "ROAD_LIABILITY_NOT_CHARGEABLE",
    ),
  roadLiabilityContractMismatch: () =>
    err(
      ErrorCode.CONFLICT,
      "This road liability is not attributed to this contract",
      "ROAD_LIABILITY_CONTRACT_MISMATCH",
    ),
  roadLiabilityAlreadyCharged: () =>
    err(
      ErrorCode.CONFLICT,
      "This road liability already has a confirmed customer charge",
      "ROAD_LIABILITY_ALREADY_CHARGED",
    ),
  customerChargeBelowOfficial: () =>
    err(
      ErrorCode.VALIDATION_ERROR,
      "Customer charge cannot be lower than the official amount",
      "CUSTOMER_CHARGE_BELOW_OFFICIAL",
    ),
  adjustmentReasonRequired: () =>
    err(
      ErrorCode.VALIDATION_ERROR,
      "An adjustment reason is required when the customer charge is higher than the official amount",
      "ADJUSTMENT_REASON_REQUIRED",
    ),
  invalidCustomerCharge: () =>
    err(
      ErrorCode.VALIDATION_ERROR,
      "Customer charge must be a positive whole AED amount",
      "INVALID_CUSTOMER_CHARGE",
    ),
};
