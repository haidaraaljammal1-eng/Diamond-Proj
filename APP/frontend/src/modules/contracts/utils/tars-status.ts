import type { ChipTone } from "@/shared/components/ui/chip";
import type {
  ContractTarsStateDto,
  TarsOperationKey,
  TarsOperationStatus,
} from "../types/tars.types";

/** Display order of the five approved mandatory procedures. */
export const TARS_OPERATION_ORDER: readonly TarsOperationKey[] = [
  "registerContract",
  "contractAcceptance",
  "handover",
  "returnDocumentation",
  "completeContract",
];

export interface TarsStatusPresentation {
  status: TarsOperationStatus;
  tone: ChipTone;
  /** PROCESSING only — a restrained pulse, never a spinner. */
  syncing: boolean;
}

const STATUS_PRESENTATION: Record<TarsOperationStatus, TarsStatusPresentation> = {
  NOT_STARTED: { status: "NOT_STARTED", tone: "neutral", syncing: false },
  PENDING: { status: "PENDING", tone: "warn", syncing: false },
  PROCESSING: { status: "PROCESSING", tone: "gold", syncing: true },
  SUCCEEDED: { status: "SUCCEEDED", tone: "ok", syncing: false },
  FAILED: { status: "FAILED", tone: "bad", syncing: false },
};

export function getTarsStatusPresentation(
  status: TarsOperationStatus | string | null | undefined,
): TarsStatusPresentation {
  return STATUS_PRESENTATION[status as TarsOperationStatus] ?? STATUS_PRESENTATION.NOT_STARTED;
}

export interface TarsConnectionPresentation {
  translationKey: "connected" | "notConnected";
  tone: ChipTone;
}

/**
 * An unconfigured provider is a development state, not a failure — it stays on
 * the neutral champagne tone rather than red.
 */
export function getTarsConnectionPresentation(
  configured: boolean,
): TarsConnectionPresentation {
  return configured
    ? { translationKey: "connected", tone: "ok" }
    : { translationKey: "notConnected", tone: "neutral" };
}

export interface TarsOperationRow {
  key: TarsOperationKey;
  presentation: TarsStatusPresentation;
}

export interface TarsSummary {
  connection: TarsConnectionPresentation;
  configured: boolean;
  externalContractId: string | null;
  lastSuccessfulSyncAt: string | null;
  rows: TarsOperationRow[];
}

export function buildTarsSummary(state: ContractTarsStateDto): TarsSummary {
  return {
    connection: getTarsConnectionPresentation(state.configured),
    configured: state.configured,
    externalContractId: state.externalContractId,
    lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
    rows: TARS_OPERATION_ORDER.map((key) => ({
      key,
      presentation: getTarsStatusPresentation(state.operations?.[key]),
    })),
  };
}

export type TarsSectionView =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; summary: TarsSummary };

/**
 * The TARS section owns its own loading and error surface so a failing
 * integration read can never take the Contract Drawer down with it.
 */
export function getTarsSectionView(
  status: "idle" | "loading" | "ready" | "error",
  state: ContractTarsStateDto | null,
): TarsSectionView {
  if (status === "error") return { kind: "error" };
  if (!state) return { kind: "loading" };
  return { kind: "ready", summary: buildTarsSummary(state) };
}
