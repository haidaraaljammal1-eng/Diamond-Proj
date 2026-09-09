import { apiRequest } from "@/infrastructure/api/client";
import type {
  ContractTarsResponseDto,
  ContractTarsStateDto,
} from "../types/tars.types";

const CONTRACTS_PATH = "/contracts";

/**
 * `GET /contracts/:id/tars` (`contracts.read`).
 *
 * Read-only projection. No execute, retry or resync endpoint exists.
 */
export async function getContractTarsState(
  id: string,
): Promise<ContractTarsStateDto> {
  const response = await apiRequest<ContractTarsResponseDto>(
    `${CONTRACTS_PATH}/${id}/tars`,
  );
  return response.data.tars;
}
