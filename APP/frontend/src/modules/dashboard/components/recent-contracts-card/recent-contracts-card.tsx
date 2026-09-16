"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { ListRow } from "@/shared/components/ui/list-row";
import { ContractStatusChip } from "@/modules/contracts/components/contract-status/contract-status";
import { ContractFileIcon } from "../../dashboard.icons";
import type { RecentContractDto } from "../../types/dashboard.types";
import styles from "./recent-contracts-card.module.css";

export interface RecentContractsCardProps {
  contracts: RecentContractDto[] | null;
  onOpenContract: (id: string) => void;
  onGenerateLink?: () => void;
}

export function RecentContractsCard({
  contracts,
  onOpenContract,
  onGenerateLink,
}: RecentContractsCardProps) {
  const t = useTranslations("Dashboard");

  if (contracts == null) return null;

  return (
    <Card as="section">
      <Card.Title>{t("latestContracts")}</Card.Title>

      {contracts.length === 0 ? (
        <EmptyState
          variant="inline"
          title={t("empty.title")}
          description={t("empty.description")}
          action={
            onGenerateLink ? (
              <Button type="button" size="sm" onClick={onGenerateLink}>
                {t("generateLink")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={styles.list}>
          {contracts.map((contract) => {
            const customer = contract.customerName ?? t("customerPending");
            return (
              <ListRow
                key={contract.id}
                icon={<ContractFileIcon />}
                title={`${customer} · ${contract.vehicleName}`}
                meta={
                  <>
                    <span className={styles.contractId} dir="ltr">
                      {contract.contractNumber}
                    </span>
                    {contract.employeeName
                      ? ` · ${t("issuedBy", { name: contract.employeeName })}`
                      : null}
                  </>
                }
                trailing={<ContractStatusChip status={contract.status} />}
                onClick={() => onOpenContract(contract.id)}
              />
            );
          })}
        </div>
      )}
    </Card>
  );
}
