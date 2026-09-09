"use client";

import { useTranslations } from "next-intl";
import { IntegrationStatusRow } from "@/shared/components/integration-status-row";
import { applyTarsSimulation, useDemoSimulation } from "@/modules/demo-simulation";
import { useContractTars } from "../../hooks/use-contract-tars";
import { getTarsStatusPresentation } from "../../utils/tars-status";
import type { TarsOperationKey } from "../../types/tars.types";

export interface ContractTarsInlineStatusProps {
  contractId: string;
  operation: Extract<
    TarsOperationKey,
    "handover" | "returnDocumentation" | "completeContract"
  >;
  className?: string;
}

/**
 * One-line TARS state next to an existing workflow control.
 *
 * Display only: it adds no action and never blocks the surrounding step. While
 * loading, or if the integration read fails, it renders nothing rather than
 * pushing noise into an operational surface.
 */
export function ContractTarsInlineStatus({
  contractId,
  operation,
  className,
}: ContractTarsInlineStatusProps) {
  const t = useTranslations("Contracts.tars");
  const { tars: realTars } = useContractTars(contractId);
  const simulation = useDemoSimulation();
  const tars = applyTarsSimulation(
    realTars,
    simulation.enabled ? simulation.snapshot.tarsPreset : null,
  );
  if (!tars) return null;

  const presentation = getTarsStatusPresentation(tars.operations?.[operation]);

  return (
    <IntegrationStatusRow
      compact
      className={className}
      label={t(`inline.${operation}`)}
      status={t(`status.${presentation.status}`)}
      tone={presentation.tone}
      syncing={presentation.syncing}
    />
  );
}
