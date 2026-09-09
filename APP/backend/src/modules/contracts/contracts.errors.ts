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
  paymentNotAllowed: () =>
    err(ErrorCode.CONFLICT, "Electronic payment is not allowed", "PAYMENT_NOT_ALLOWED"),
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
};
