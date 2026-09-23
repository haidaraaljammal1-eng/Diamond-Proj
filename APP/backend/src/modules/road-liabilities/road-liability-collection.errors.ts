import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";

export const RoadLiabilityCollectionReason = {
  NOT_COLLECTIBLE: "ROAD_LIABILITY_NOT_COLLECTIBLE",
  ALREADY_SETTLED: "ROAD_LIABILITY_ALREADY_SETTLED",
  AUTHORIZATION_MISSING: "ROAD_LIABILITY_AUTHORIZATION_MISSING",
  AUTHORIZATION_REVOKED: "ROAD_LIABILITY_AUTHORIZATION_REVOKED",
  AUTHORIZATION_SCOPE_INELIGIBLE: "ROAD_LIABILITY_AUTHORIZATION_SCOPE_INELIGIBLE",
  AUTHORIZATION_CONTRACT_MISMATCH: "ROAD_LIABILITY_AUTHORIZATION_CONTRACT_MISMATCH",
  PAYMENT_METHOD_INACTIVE: "ROAD_LIABILITY_PAYMENT_METHOD_INACTIVE",
  PROVIDER_ACCOUNT_MISMATCH: "ROAD_LIABILITY_PROVIDER_ACCOUNT_MISMATCH",
  LIVEMODE_MISMATCH: "ROAD_LIABILITY_LIVEMODE_MISMATCH",
  COLLECTION_IN_PROGRESS: "ROAD_LIABILITY_COLLECTION_IN_PROGRESS",
  MANUAL_NOT_PENDING: "ROAD_LIABILITY_MANUAL_NOT_PENDING",
  CASH_COLLECTION_NOT_ALLOWED: "ROAD_LIABILITY_CASH_COLLECTION_NOT_ALLOWED",
  CASH_COLLECTION_REQUIRED: "ROAD_LIABILITY_CASH_COLLECTION_REQUIRED",
  MANUAL_COLLECTION_NOT_SUPPORTED: "ROAD_LIABILITY_MANUAL_COLLECTION_NOT_SUPPORTED",
  PROVIDER_SETTLEMENT_ANOMALY: "ROAD_LIABILITY_PROVIDER_SETTLEMENT_ANOMALY",
} as const;

function collectionError(
  code: ErrorCode,
  message: string,
  reason: string,
): AppError {
  return new AppError({ code, message, context: { reason } });
}

export const roadLiabilityCollectionError = {
  notCollectible: () =>
    collectionError(ErrorCode.VALIDATION_ERROR, "Road liability is not collectible", RoadLiabilityCollectionReason.NOT_COLLECTIBLE),
  alreadySettled: () =>
    collectionError(ErrorCode.CONFLICT, "Road liability is already settled", RoadLiabilityCollectionReason.ALREADY_SETTLED),
  authorizationMissing: () =>
    collectionError(ErrorCode.VALIDATION_ERROR, "No saved-card authorization for this contract", RoadLiabilityCollectionReason.AUTHORIZATION_MISSING),
  authorizationRevoked: () =>
    collectionError(ErrorCode.VALIDATION_ERROR, "Saved-card authorization was revoked", RoadLiabilityCollectionReason.AUTHORIZATION_REVOKED),
  authorizationScopeIneligible: () =>
    collectionError(ErrorCode.VALIDATION_ERROR, "Saved-card authorization does not permit off-session collection", RoadLiabilityCollectionReason.AUTHORIZATION_SCOPE_INELIGIBLE),
  authorizationContractMismatch: () =>
    collectionError(ErrorCode.VALIDATION_ERROR, "Authorization does not belong to the attributed contract", RoadLiabilityCollectionReason.AUTHORIZATION_CONTRACT_MISMATCH),
  paymentMethodInactive: () =>
    collectionError(ErrorCode.VALIDATION_ERROR, "Saved payment method is not active", RoadLiabilityCollectionReason.PAYMENT_METHOD_INACTIVE),
  providerAccountMismatch: () =>
    collectionError(ErrorCode.VALIDATION_ERROR, "Payment provider account mismatch", RoadLiabilityCollectionReason.PROVIDER_ACCOUNT_MISMATCH),
  livemodeMismatch: () =>
    collectionError(ErrorCode.VALIDATION_ERROR, "Stripe livemode mismatch", RoadLiabilityCollectionReason.LIVEMODE_MISMATCH),
  collectionInProgress: () =>
    collectionError(ErrorCode.CONFLICT, "Collection is already in progress", RoadLiabilityCollectionReason.COLLECTION_IN_PROGRESS),
  manualNotPending: () =>
    collectionError(ErrorCode.VALIDATION_ERROR, "Manual collection is not pending receipt", RoadLiabilityCollectionReason.MANUAL_NOT_PENDING),
  cashCollectionNotAllowed: () =>
    collectionError(ErrorCode.VALIDATION_ERROR, "Cash collection is not allowed for this contract", RoadLiabilityCollectionReason.CASH_COLLECTION_NOT_ALLOWED),
  cashCollectionRequired: () =>
    collectionError(ErrorCode.VALIDATION_ERROR, "This liability requires cash collection", RoadLiabilityCollectionReason.CASH_COLLECTION_REQUIRED),
  manualCollectionNotSupported: () =>
    collectionError(
      ErrorCode.VALIDATION_ERROR,
      "Manual road liability collection is no longer supported",
      RoadLiabilityCollectionReason.MANUAL_COLLECTION_NOT_SUPPORTED,
    ),
  providerSettlementAnomaly: () =>
    collectionError(
      ErrorCode.CONFLICT,
      "Provider collected after liability was already settled",
      RoadLiabilityCollectionReason.PROVIDER_SETTLEMENT_ANOMALY,
    ),
};
