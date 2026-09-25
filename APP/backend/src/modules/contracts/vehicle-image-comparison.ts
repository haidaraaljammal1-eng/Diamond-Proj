import type { ContractInspectionAngle } from "@prisma/client";

/** Evidence pair for future AI comparison — no provider is wired in V1. */
export type VehicleImageComparisonPair = {
  angle: ContractInspectionAngle;
  outPhoto: { id: string; url: string } | null;
  inPhoto: { id: string; url: string } | null;
};

/**
 * Optional AI provider hook. Unconfigured implementations must fail closed;
 * Diamond V1 does not register a default provider.
 */
export interface VehicleImageComparisonProvider {
  configured: boolean;
  comparePair(_pair: VehicleImageComparisonPair): Promise<never>;
}
