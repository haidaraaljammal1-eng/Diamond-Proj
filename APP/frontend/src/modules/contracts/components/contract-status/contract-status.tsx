"use client";

import { useTranslations } from "next-intl";
import { Chip } from "@/shared/components/ui/chip";
import type { ContractStatus } from "../../types/contract.types";
import { getContractStatusPresentation } from "../../utils/contract-status";

export interface ContractStatusChipProps {
  status: ContractStatus;
}

export function ContractStatusChip({ status }: ContractStatusChipProps) {
  const t = useTranslations("Contracts.status");
  const presentation = getContractStatusPresentation(status);
  return (
    <Chip tone={presentation.tone} dot>
      {t(presentation.translationKey)}
    </Chip>
  );
}
