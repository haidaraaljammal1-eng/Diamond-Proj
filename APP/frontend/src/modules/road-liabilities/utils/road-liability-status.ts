import type { ChipTone } from "@/shared/components/ui/chip";
import type { ContractStatus } from "@/modules/contracts/types/contract.types";
import type {
  RoadLiabilityAttributionStatus,
  RoadLiabilityAuthority,
  RoadLiabilityCollectionStatus,
  RoadLiabilityConfirmationStatus,
  RoadLiabilityListItemDto,
  RoadLiabilityType,
  RoadLiabilityWorkState,
} from "../types/road-liabilities.types.ts";

export const SIMULATED_ROAD_LIABILITY_PREFIX = "sim-rl-";

const CONTRACT_STATUSES: ReadonlySet<string> = new Set([
  "AWAITING",
  "FORM",
  "SIGNED",
  "PAID",
  "ACTIVE",
  "RETOUT",
  "REVIEW",
  "CLOSED",
]);

export function isSimulatedRoadLiabilityId(id: string): boolean {
  return id.startsWith(SIMULATED_ROAD_LIABILITY_PREFIX);
}

export function isGpsPredictionOnly(item: Pick<RoadLiabilityListItemDto, "prediction" | "authoritative">): boolean {
  return item.prediction.predictedByGps && !item.authoritative.confirmed;
}

export function isGpsThenAuthoritative(item: Pick<RoadLiabilityListItemDto, "prediction" | "authoritative">): boolean {
  return item.prediction.predictedByGps && item.authoritative.confirmed;
}

export function authorityFromType(type: RoadLiabilityType): RoadLiabilityAuthority {
  return type === "rta_violation" ? "RTA" : "SALIK";
}

export function isContractStatus(value: string): value is ContractStatus {
  return CONTRACT_STATUSES.has(value);
}

export function confirmationChipTone(status: RoadLiabilityConfirmationStatus): ChipTone {
  if (status === "pending_confirmation") return "warn";
  if (status === "confirmed") return "ok";
  return "neutral";
}

export function attributionChipTone(status: RoadLiabilityAttributionStatus): ChipTone {
  if (status === "matched") return "gold";
  if (status === "unmatched" || status === "ambiguous") return "warn";
  return "neutral";
}

export function collectionChipTone(status: RoadLiabilityCollectionStatus): ChipTone {
  if (status === "open") return "gold";
  if (status === "settled") return "ok";
  if (status === "disputed") return "bad";
  return "neutral";
}

export function workStateChipTone(state: RoadLiabilityWorkState): ChipTone {
  if (state === "collectible") return "gold";
  if (state === "awaiting_confirmation") return "warn";
  if (state === "needs_contract" || state === "ambiguous_match" || state === "attribution_pending") {
    return "warn";
  }
  if (state === "settled") return "ok";
  if (state === "disputed") return "bad";
  return "neutral";
}

export function typeTranslationKey(type: RoadLiabilityType): `type.${RoadLiabilityType}` {
  return `type.${type}`;
}

export function confirmationTranslationKey(
  status: RoadLiabilityConfirmationStatus,
): `confirmation.${RoadLiabilityConfirmationStatus}` {
  return `confirmation.${status}`;
}

export function attributionTranslationKey(
  status: RoadLiabilityAttributionStatus,
): `attribution.${RoadLiabilityAttributionStatus}` {
  return `attribution.${status}`;
}

export function collectionTranslationKey(
  status: RoadLiabilityCollectionStatus,
): `collection.${RoadLiabilityCollectionStatus}` {
  return `collection.${status}`;
}

export function workStateTranslationKey(
  state: RoadLiabilityWorkState,
  item?: Pick<RoadLiabilityListItemDto, "type" | "prediction">,
): "workState.awaiting_confirmation" | "workState.awaiting_confirmation_salik" | `workState.${Exclude<RoadLiabilityWorkState, "awaiting_confirmation">}` {
  if (state === "awaiting_confirmation") {
    const salikContext =
      item == null ||
      item.type === "salik_toll" ||
      item.type === "salik_violation" ||
      item.prediction.predictedByGps;
    return salikContext
      ? "workState.awaiting_confirmation_salik"
      : "workState.awaiting_confirmation";
  }
  return `workState.${state}`;
}

/** Known source keys. Unknown keys keep a readable fallback, never a blank chip. */
export function sourceTranslationKey(sourceKey: string): string | null {
  if (sourceKey === "RTA") return "source.RTA";
  if (sourceKey === "SALIK") return "source.SALIK";
  if (sourceKey === "GPS_INFERENCE") return "source.GPS_INFERENCE";
  if (sourceKey === "TARS") return "source.TARS";
  return null;
}

export function sourceFallbackLabel(sourceKey: string): string {
  return sourceKey.replaceAll("_", " ");
}

export function resolveRowSourceKey(item: RoadLiabilityListItemDto): string {
  if (isGpsPredictionOnly(item)) return "GPS_INFERENCE";
  if (item.source?.trim()) return item.source.trim();
  if (item.prediction.predictedByGps) return "GPS_INFERENCE";
  return "UNKNOWN";
}
