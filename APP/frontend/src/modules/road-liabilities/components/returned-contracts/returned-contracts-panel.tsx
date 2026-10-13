"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { CompanyIdentity } from "@/shared/components/company-identity/company-identity";
import type { OperatingCompanyIdentity } from "@/modules/operating-companies";
import { Select } from "@/shared/components/ui/select";
import { useReturnedContracts } from "../../hooks/use-returned-contracts";
import { resolveRoadLiabilitiesErrorMessage } from "../../utils/resolve-road-liabilities-error";
import type { ReturnedContractListItemDto } from "../../types/road-liabilities.types";
import { StaffContractChargeDialog } from "../staff-contract-charge/staff-contract-charge-dialog";
import styles from "./returned-contracts-panel.module.css";

const ALL_COMPANIES = "__all_companies__";

export interface ReturnedContractsPanelProps {
  companies: OperatingCompanyIdentity[];
}

export function ReturnedContractsPanel({ companies }: ReturnedContractsPanelProps) {
  const t = useTranslations("RoadLiabilities");
  const page = useReturnedContracts();
  const [chargeContract, setChargeContract] = useState<ReturnedContractListItemDto | null>(null);

  if (!page.isAllowed) return null;

  const errorMessage = resolveRoadLiabilitiesErrorMessage(t, page.error);

  return (
    <div className={styles.panel} data-testid="returned-contracts-panel">
      <div className={styles.toolbar}>
        <Input
          value={page.searchDraft}
          onChange={(e) => page.setSearchDraft(e.target.value)}
          placeholder={t("returnedContracts.searchPlaceholder")}
          onKeyDown={(e) => {
            if (e.key === "Enter") page.applySearch();
          }}
        />
        <Button type="button" variant="secondary" size="md" onClick={() => page.applySearch()}>
          {t("returnedContracts.search")}
        </Button>
        <Select
          value={page.query.companyId != null ? String(page.query.companyId) : ALL_COMPANIES}
          onChange={(v) =>
            page.setCompanyFilter(v === ALL_COMPANIES ? undefined : Number(v))
          }
          options={[
            { value: ALL_COMPANIES, label: t("filters.all") },
            ...companies.map((c) => ({ value: String(c.id), label: c.displayName })),
          ]}
          ariaLabel={t("filters.channel")}
        />
      </div>

      {page.loading ? <p>{t("returnedContracts.loading")}</p> : null}
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}

      {!page.loading && page.items.length === 0 ? (
        <p className={styles.empty}>{t("returnedContracts.empty")}</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t("columns.party")}</th>
              <th>{t("columns.vehicle")}</th>
              <th>{t("returnedContracts.carIn")}</th>
              <th>{t("returnedContracts.status")}</th>
              <th>{t("collect.savedCard")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {page.items.map((row) => (
              <tr key={row.contractId} data-testid={`returned-contract-${row.contractId}`}>
                <td>
                  <div dir="ltr">{row.contractNumber}</div>
                  <div>{row.customerName}</div>
                  {row.company ? (
                    <CompanyIdentity company={row.company} compact />
                  ) : null}
                </td>
                <td>
                  <div>{row.vehicleDisplayName}</div>
                  <div dir="ltr">{row.plateNumber}</div>
                </td>
                <td dir="ltr">{new Date(row.carInOccurredAt).toLocaleString()}</td>
                <td>{row.status}</td>
                <td>
                  {row.cardAvailability === "available"
                    ? t("returnedContracts.cardAvailable")
                    : t("returnedContracts.cardUnavailable")}
                </td>
                <td>
                  {page.canCharge ? (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={row.cardAvailability !== "available"}
                      onClick={() => setChargeContract(row)}
                    >
                      {t("returnedContracts.collect")}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {page.meta && page.meta.totalPages > 1 ? (
        <div className={styles.toolbar}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={page.query.page <= 1}
            onClick={() => page.setPage(page.query.page - 1)}
          >
            {t("pagination.prev")}
          </Button>
          <span>
            {page.query.page} / {page.meta.totalPages}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={page.query.page >= page.meta.totalPages}
            onClick={() => page.setPage(page.query.page + 1)}
          >
            {t("pagination.next")}
          </Button>
        </div>
      ) : null}

      <StaffContractChargeDialog
        open={chargeContract != null}
        contract={chargeContract}
        onClose={() => setChargeContract(null)}
        onSuccess={() => void page.refresh()}
      />
    </div>
  );
}
