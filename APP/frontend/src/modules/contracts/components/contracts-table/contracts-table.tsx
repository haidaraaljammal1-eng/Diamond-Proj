"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import type { ContractListItemDto } from "../../types/contract.types";
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

function rowActionKey(status: ContractListItemDto["status"]): string | null {
  if (status === "AWAITING" || status === "FORM") return "actions.rentalLink";
  if (status === "SIGNED") return "actions.confirmPayment";
  if (status === "PAID") return "actions.carOut";
  if (status === "ACTIVE") return "actions.returnLink";
  if (status === "REVIEW") return "actions.reconcile";
  return null;
}

export function ContractsTable({
  contracts,
  onOpen,
  onRowAction,
}: ContractsTableProps) {
  const t = useTranslations("Contracts");
  const format = useFormatter();

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
            <th scope="col">{t("table.action")}</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((contract) => {
            const actionKey = rowActionKey(contract.status);
            return (
              <tr
                key={contract.id}
                tabIndex={0}
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
                  {contract.hasSalikGpsSignal ? (
                    <span className={styles.gpsDot} title={t("detail.gpsSalikTitle")} data-testid="contract-gps-salik-dot" />
                  ) : null}
                </td>
                <td>
                  {contract.customerName ? (
                    <span>{contract.customerName}</span>
                  ) : null}
                </td>
                <td>
                  <span>{contract.vehicleName}</span>
                  {contract.plateNumber ? (
                    <div className={styles.muted} dir="ltr">
                      {contract.plateNumber}
                    </div>
                  ) : null}
                </td>
                <td className={styles.num}>
                  {t("table.days", { count: contract.rentalDays })}
                  {contract.startAt ? (
                    <div className={styles.muted}>
                      {format.dateTime(new Date(contract.startAt), {
                        day: "numeric",
                        month: "short",
                      })}
                    </div>
                  ) : null}
                </td>
                <td className={styles.amount}>
                  {format.number(contract.agreedAmount)} {contract.currency}
                </td>
                <td>
                  <ContractStatusChip status={contract.status} />
                </td>
                <td>
                  {actionKey && onRowAction ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(event) => {
                        stopOpen(event);
                        onRowAction(contract);
                      }}
                      onKeyDown={stopOpen}
                    >
                      {t(actionKey)}
                    </Button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
