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
};
