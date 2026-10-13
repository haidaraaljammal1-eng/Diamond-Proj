import { apiRequest } from "@/infrastructure/api/client";
import type {
  ReturnedContractListItemDto,
  ReturnedContractsListQuery,
  RoadLiabilityPageMeta,
  StaffManualChargeInput,
  StaffManualChargeResultDto,
} from "../types/road-liabilities.types";
import { parseRoadLiabilityPageMeta } from "./road-liabilities.api";

const BASE = "/road-liabilities/returned-contracts";

export async function listReturnedContracts(
  query: ReturnedContractsListQuery,
): Promise<{ items: ReturnedContractListItemDto[]; meta: RoadLiabilityPageMeta }> {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  if (query.companyId != null) params.set("companyId", String(query.companyId));
  if (query.search?.trim()) params.set("search", query.search.trim());
  const response = await apiRequest<ReturnedContractListItemDto[]>(`${BASE}?${params.toString()}`);
  const meta = parseRoadLiabilityPageMeta(response.meta);
  if (!meta) throw new Error("Invalid pagination meta");
  return { items: response.data, meta };
}

export async function postStaffManualCharge(
  contractId: string,
  body: StaffManualChargeInput,
  idempotencyKey: string,
): Promise<StaffManualChargeResultDto> {
  const response = await apiRequest<StaffManualChargeResultDto>(
    `${BASE}/${contractId}/manual-charge`,
    {
      method: "POST",
      body,
      headers: { "Idempotency-Key": idempotencyKey },
    },
  );
  return response.data;
}
