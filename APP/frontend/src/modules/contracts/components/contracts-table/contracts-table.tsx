"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components/ui/button";
import { Icon } from "@/shared/components/ui/icon";
import { CompanyIdentity } from "@/shared/components/company-identity";
import type { ContractListItemDto } from "../../types/contract.types";
import { getContractRowAction } from "../../utils/contract-row-action";
import { ContractStatusChip } from "../contract-status/contract-status";
import styles from "./contracts-table.module.css";

export interface ContractsTableProps {
  contracts: ContractListItemDto[];
  onOpen: (contract: ContractListItemDto) => void;
  onRowAction?: (contract: ContractListItemDto) => void;
}

function stopOpen(event: MouseEvent | KeyboardEvent) {
  event.stopPropagation();
}

/** Statuses whose snapshot already holds the signed official contract. */
const HAS_SIGNED_CONTRACT = new Set<ContractListItemDto["status"]>(["SIGNED", "PAID", "ACTIVE", "RETOUT", "REVIEW", "CLOSED"]);

export function ContractsTable({
  contracts,
  onOpen,
  onRowAction,
}: ContractsTableProps) {
  const t = useTranslations("Contracts");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();

  return (
    <div className={styles.wrap} data-testid="contracts-table">
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{t("table.number")}</th>
            <th scope="col">{t("table.customer")}</th>
            <th scope="col">{t("table.vehicle")}</th>
            <th scope="col">{t("table.period")}</th>
            <th scope="col">{t("table.amount")}</th>
            <th scope="col">{t("table.status")}</th>
            <th scope="col" className={styles.actionCol}>{t("table.action")}</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((contract) => {
            const action = getContractRowAction(contract);
            return (
              <tr
                key={contract.id}
                tabIndex={0}
                data-record-id={contract.id}
                data-record-number={contract.contractNumber}
                onClick={() => onOpen(contract)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(contract);
                  }
                }}
              >
                <td>
                  <span className={styles.number} dir="ltr">
                    {contract.contractNumber}
                  </span>
                  <CompanyIdentity company={contract.company} compact className={styles.company} />
                  {contract.hasSalikGpsSignal ? (
                    <span className={styles.gpsDot} title={t("detail.gpsSalikTitle")} data-testid="contract-gps-salik-dot" />
                  ) : null}
                </td>
                <td>
                  {contract.customerName ? (
                    <span>{contract.customerName}</span>
                  ) : (
                    <span className={styles.empty} aria-label={t("table.customerMissing")}>—</span>
                  )}
                </td>
                <td>
                  <span className={styles.primaryLine}>{contract.vehicleName}</span>
                  {contract.plateNumber ? (
                    <span className={`${styles.muted} ${styles.plate}`}>
                      <bdi dir="ltr">{contract.plateNumber}</bdi>
                    </span>
                  ) : null}
                </td>
                <td className={styles.num}>
                  <span className={styles.primaryLine}>{t("table.days", { count: contract.rentalDays })}</span>
                  {contract.startAt ? (
                    <span className={styles.muted}>
                      {format.dateTime(new Date(contract.startAt), {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  ) : null}
                </td>
                <td className={styles.amount}>
                  {format.number(contract.agreedAmount)} {contract.currency}
                </td>
                <td>
                  <ContractStatusChip status={contract.status} />
                </td>
                <td className={styles.actionCol}>
                  {/* Next step first, then View contract in a fixed last slot so both line up row to row. */}
                  <div className={styles.actions}>
                  {action && onRowAction ? (
                    <Button
                      type="button"
                      variant="secondaryStrong"
                      size="sm"
                      className={styles.stepAction}
                      title={t(action.labelKey)}
                      onClick={(event) => {
                        stopOpen(event);
                        onRowAction(contract);
                      }}
                      onKeyDown={stopOpen}
                    >
                      <Icon name={action.icon} />
                      <span className={styles.stepLabel}>{t(action.labelKey)}</span>
                    </Button>
                  ) : null}
                  {HAS_SIGNED_CONTRACT.has(contract.status) ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className={styles.viewAction}
                      aria-label={t("actions.viewContractFor", { number: contract.contractNumber })}
                      title={t("actions.viewContract")}
                      onClick={(event) => {
                        stopOpen(event);
                        router.push(`/${locale}/contracts/${contract.id}/contract`);
                      }}
                      onKeyDown={stopOpen}
                    >
                      <Icon name="mdi:file-document-outline" size={18} />
                    </Button>
                  ) : (
                    <span className={styles.viewSlot} aria-hidden="true" />
                  )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
