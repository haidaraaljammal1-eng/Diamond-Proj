"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { DataSearch } from "@/shared/components/data-search";
import { Button } from "@/shared/components/ui/button";
import { CompanyIdentity } from "@/shared/components/company-identity/company-identity";
import type { OperatingCompanyIdentity } from "@/modules/operating-companies";
import { Select } from "@/shared/components/ui/select";
import { useReturnedContracts } from "../../hooks/use-returned-contracts";
import { resolveRoadLiabilitiesErrorMessage } from "../../utils/resolve-road-liabilities-error";
import type { ReturnedContractListItemDto } from "../../types/road-liabilities.types";
import { StaffContractChargeDialog } from "../staff-contract-charge/staff-contract-charge-dialog";
import { formatReturnedContractCarInDateTime } from "./returned-contracts.format";
import styles from "./returned-contracts-panel.module.css";

const ALL_COMPANIES = "__all_companies__";

export interface ReturnedContractsPanelProps {
  companies: OperatingCompanyIdentity[];
  companiesLoading?: boolean;
}

export function ReturnedContractsPanel({
  companies,
  companiesLoading = false,
}: ReturnedContractsPanelProps) {
  const t = useTranslations("RoadLiabilities");
  const tCompany = useTranslations("OperatingCompanies");
  const tContractStatus = useTranslations("Contracts.status");
  const page = useReturnedContracts();
  const [chargeContract, setChargeContract] = useState<ReturnedContractListItemDto | null>(null);

  if (!page.isAllowed) return null;

  const errorMessage = resolveRoadLiabilitiesErrorMessage(t, page.error);

  return (
    <div className={styles.panel} data-testid="returned-contracts-panel">
      <div className={styles.header}>
        <div className={styles.toolbarRow}>
          <DataSearch
            appliedValue={page.query.search ?? ""}
            onSearch={page.applySearch}
            onClear={page.clearSearch}
            placeholder={t("returnedContracts.search.placeholder")}
            inputLabel={t("returnedContracts.search.inputLabel")}
            searchButtonLabel={t("returnedContracts.search.button")}
            clearButtonLabel={t("returnedContracts.search.clear")}
            loading={page.loading}
            inputTestId="returned-contracts-search"
            className={styles.search}
          />
          <div className={styles.companyFilter} data-testid="returned-contracts-company-filter">
            <p className={styles.filterLabel}>{tCompany("company")}</p>
            <Select
              size="sm"
              variant="ghost"
              value={page.query.companyId != null ? String(page.query.companyId) : ALL_COMPANIES}
              onChange={(v) =>
                page.setCompanyFilter(v === ALL_COMPANIES ? undefined : Number(v))
              }
              options={[
                { value: ALL_COMPANIES, label: tCompany("all") },
                ...companies.map((c) => ({ value: String(c.id), label: c.displayName })),
              ]}
              placeholder={companiesLoading ? tCompany("loading") : tCompany("all")}
              disabled={companiesLoading && companies.length === 0}
              aria-label={tCompany("company")}
            />
          </div>
        </div>
        <p className={styles.intro}>{t("returnedContracts.intro")}</p>
      </div>

      {page.loading && page.items.length === 0 ? (
        <p data-testid="returned-contracts-loading">{t("returnedContracts.loading")}</p>
      ) : null}
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}

      {!page.loading && page.items.length === 0 ? (
        <p className={styles.empty} data-testid="returned-contracts-empty">
          {t("returnedContracts.empty")}
        </p>
      ) : null}

      {page.items.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("returnedContracts.columnCustomer")}</th>
                <th>{t("returnedContracts.columnContract")}</th>
                <th>{t("columns.vehicle")}</th>
                <th>{t("returnedContracts.columnCarInDate")}</th>
                <th>{t("returnedContracts.columnContractStatus")}</th>
                <th className={styles.actionsHeader}>{t("returnedContracts.columnActions")}</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((row) => {
                const cardAvailable = row.cardAvailability === "available";
                return (
                  <tr key={row.contractId} data-testid={`returned-contract-${row.contractId}`}>
                    <td>
                      <span className={styles.cellPrimary}>{row.customerName}</span>
                      {row.company ? (
                        <div className={styles.cellSecondary}>
                          <CompanyIdentity company={row.company} compact />
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <span className={`${styles.cellPrimary} ${styles.ltrNumeric}`}>
                        {row.contractNumber}
                      </span>
                    </td>
                    <td>
                      <span className={styles.cellPrimary}>{row.vehicleDisplayName}</span>
                      <span className={`${styles.cellSecondary} ${styles.ltrNumeric}`}>
                        {row.plateNumber}
                      </span>
                    </td>
                    <td>
                      {row.carInOccurredAt ? (
                        <span className={styles.ltrNumeric}>
                          {formatReturnedContractCarInDateTime(row.carInOccurredAt)}
                        </span>
                      ) : (
                        t("returnedContracts.carInNotYet")
                      )}
                    </td>
                    <td>{tContractStatus(row.status)}</td>
                    <td className={styles.actionsCell}>
                      {page.canCharge ? (
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={!cardAvailable}
                          title={
                            cardAvailable ? undefined : t("returnedContracts.cardUnavailable")
                          }
                          onClick={() => setChargeContract(row)}
                        >
                          {t("returnedContracts.collect")}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {page.loading && page.items.length > 0 ? (
        <p className={styles.loadingInline} data-testid="returned-contracts-refreshing">
          {t("returnedContracts.loading")}
        </p>
      ) : null}

      {page.meta && page.meta.totalPages > 1 ? (
        <div className={styles.pagination}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={page.query.page <= 1}
            onClick={() => page.setPage(page.query.page - 1)}
          >
            {t("pagination.previous")}
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
