"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Chip } from "@/shared/components/ui/chip";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { ListRow } from "@/shared/components/ui/list-row";
import { ContractFileIcon } from "../../dashboard.icons";
import { contractStatusPresentation } from "../../utils/contract-status";
import type { RecentContract } from "../../types/dashboard.types";
import styles from "./recent-contracts-card.module.css";

export interface RecentContractsCardProps {
  contracts: RecentContract[];
  /** The owner view adds the "from all staff" chip and the issuing employee. */
  isOwner: boolean;
}

/** Demo Dashboard "أحدث العقود" card. */
export function RecentContractsCard({ contracts, isOwner }: RecentContractsCardProps) {
  const t = useTranslations("Dashboard");
  const shell = useTranslations("Shell");

  return (
    <Card as="section">
      <Card.Title
        trailing={
          isOwner ? (
            <Chip tone="gold" dot>
              {t("fromAllStaff")}
            </Chip>
          ) : null
        }
      >
        {t("latestContracts")}
      </Card.Title>

      {contracts.length === 0 ? (
        <EmptyState
          variant="inline"
          title={t("empty.title")}
          description={t("empty.description")}
          action={
            <Button
              type="button"
              size="sm"
              aria-disabled="true"
              title={`${t("generateLink")} — ${shell("navigationActionNote")}`}
            >
              {t("generateLink")}
            </Button>
          }
        />
      ) : (
        <div className={styles.list}>
          {contracts.map((contract) => {
            const status = contractStatusPresentation(contract.status);

            return (
              <ListRow
                key={contract.id}
                icon={<ContractFileIcon />}
                title={`${contract.customerName} · ${contract.vehicleName}`}
                meta={
                  <>
                    <span className={styles.contractId} dir="ltr">
                      {contract.id}
                    </span>
                    {isOwner && contract.employeeName
                      ? ` · ${t("issuedBy", { name: contract.employeeName })}`
                      : null}
                  </>
                }
                trailing={
                  <Chip tone={status.tone} dot>
                    {t(`status.${status.translationKey}`)}
                  </Chip>
                }
              />
            );
          })}
        </div>
      )}
    </Card>
  );
}
