import { apiRequest } from "@/infrastructure/api/client";
import type {
  ManualCollectionConfirmInput,
  OffSessionCollectionInput,
  OffSessionCollectionResultDto,
  RoadLiabilityCollectionViewDto,
  RoadLiabilityPaymentLinkResultDto,
} from "../types/road-liabilities.types";

/** `GET /road-liabilities/:id/collection` (`violations.read`). */
export async function getRoadLiabilityCollection(
  roadLiabilityId: string,
): Promise<RoadLiabilityCollectionViewDto> {
  const response = await apiRequest<RoadLiabilityCollectionViewDto>(
    `/road-liabilities/${roadLiabilityId}/collection`,
  );
  return response.data;
}

/** `POST /road-liabilities/:id/collection/off-session` (`violations.charge`). */
export async function collectRoadLiabilityOffSession(
  roadLiabilityId: string,
  payload: OffSessionCollectionInput = {},
  idempotencyKey?: string,
): Promise<OffSessionCollectionResultDto> {
  const response = await apiRequest<OffSessionCollectionResultDto>(
    `/road-liabilities/${roadLiabilityId}/collection/off-session`,
    {
      method: "POST",
      body: payload,
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    },
  );
  return response.data;
}

/** `POST /road-liabilities/:id/collection/payment-link` (`violations.charge`). */
export async function createRoadLiabilityPaymentLink(
  roadLiabilityId: string,
  idempotencyKey?: string,
): Promise<RoadLiabilityPaymentLinkResultDto> {
  const response = await apiRequest<RoadLiabilityPaymentLinkResultDto>(
    `/road-liabilities/${roadLiabilityId}/collection/payment-link`,
    {
      method: "POST",
      body: {},
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    },
  );
  return response.data;
}

/** `POST /road-liabilities/:id/collection/manual` (`violations.charge`). */
export async function startRoadLiabilityManualCollection(
  roadLiabilityId: string,
): Promise<RoadLiabilityCollectionViewDto> {
  const response = await apiRequest<RoadLiabilityCollectionViewDto>(
    `/road-liabilities/${roadLiabilityId}/collection/manual`,
    { method: "POST", body: {} },
  );
  return response.data;
}

/** `POST /road-liabilities/:id/collection/manual/confirm` (`violations.charge`). */
export async function confirmRoadLiabilityManualCollection(
  roadLiabilityId: string,
  payload: ManualCollectionConfirmInput,
): Promise<RoadLiabilityCollectionViewDto> {
  const response = await apiRequest<RoadLiabilityCollectionViewDto>(
    `/road-liabilities/${roadLiabilityId}/collection/manual/confirm`,
    { method: "POST", body: payload },
  );
  return response.data;
}

/** `POST /road-liabilities/:id/collection/cash/confirm` (`violations.charge`). */
export async function confirmRoadLiabilityCashCollection(
  roadLiabilityId: string,
  idempotencyKey?: string,
): Promise<RoadLiabilityCollectionViewDto> {
  const response = await apiRequest<RoadLiabilityCollectionViewDto>(
    `/road-liabilities/${roadLiabilityId}/collection/cash/confirm`,
    {
      method: "POST",
      body: {},
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    },
  );
  return response.data;
}
