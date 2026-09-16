import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";

export const RoadLiabilityErrorReason = {
  NOT_FOUND: "ROAD_LIABILITY_NOT_FOUND",
} as const;

export function roadLiabilityNotFoundError(): AppError {
  return new AppError({
    code: ErrorCode.NOT_FOUND,
    message: "Road liability not found",
    context: { reason: RoadLiabilityErrorReason.NOT_FOUND },
  });
}
