"use client";

import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/shared/components/ui/card";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { ContractStatusChip } from "@/modules/contracts/components/contract-status/contract-status";
import { ContractFileIcon } from "../../dashboard.icons";
import type { TodayContractDto } from "../../types/dashboard.types";
import { formatDashboardBusinessTime } from "../../utils/format-dashboard-time";
import styles from "./today-contracts-card.module.css";

export interface TodayContractsCardProps {
  contracts: TodayContractDto[] | null;
  onOpenContract: (id: string) => void;
}

export function TodayContractsCard({ contracts, onOpenContract }: TodayContractsCardProps) {
  const t = useTranslations("Dashboard");
  const locale = useLocale();

  if (contracts == null) return null;

  return (
    <Card as="section" className={styles.card}>
      <Card.Title icon={<ContractFileIcon />}>{t("todayContracts.title")}</Card.Title>

      {contracts.length === 0 ? (
        <EmptyState variant="inline" title={t("todayContracts.empty")} />
      ) : (
        <div className={styles.list}>
          {contracts.map((contract) => (
            <button
              key={contract.id}
              type="button"
              className={styles.row}
              onClick={() => onOpenContract(contract.id)}
            >
              <span className={styles.statusSlot}>
                <ContractStatusChip status={contract.status} />
              </span>
              <span className={styles.body} dir={locale === "ar" ? "rtl" : "ltr"}>
                <span className={styles.vehicle}>{contract.vehicleName}</span>
                <span className={styles.meta}>
                  <span className={styles.companyCode}>{contract.company.code}</span>
                  <span aria-hidden="true"> · </span>
                  <time dateTime={contract.createdAt}>
                    {formatDashboardBusinessTime(contract.createdAt, locale)}
                  </time>
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
