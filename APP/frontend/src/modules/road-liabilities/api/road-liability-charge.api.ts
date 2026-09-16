import { apiRequest } from "@/infrastructure/api/client";
import type { ConfirmRoadLiabilityChargePayload } from "../types/road-liability-charge-review.types";
import type { RoadLiabilityCustomerChargeReviewDto } from "../types/road-liability-charge-review.types";

/** `GET /road-liabilities/:id/customer-charge` (`violations.read`). */
export async function getRoadLiabilityCustomerCharge(
  roadLiabilityId: string,
): Promise<RoadLiabilityCustomerChargeReviewDto> {
  const response = await apiRequest<RoadLiabilityCustomerChargeReviewDto>(
    `/road-liabilities/${roadLiabilityId}/customer-charge`,
  );
  return response.data;
}

/** `POST /road-liabilities/:id/customer-charge/confirm` (`violations.charge`). */
export async function confirmRoadLiabilityCustomerCharge(
  roadLiabilityId: string,
  payload: ConfirmRoadLiabilityChargePayload,
  idempotencyKey?: string,
): Promise<RoadLiabilityCustomerChargeReviewDto> {
  const response = await apiRequest<RoadLiabilityCustomerChargeReviewDto>(
    `/road-liabilities/${roadLiabilityId}/customer-charge/confirm`,
    {
      method: "POST",
      body: payload,
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    },
  );
  return response.data;
}
