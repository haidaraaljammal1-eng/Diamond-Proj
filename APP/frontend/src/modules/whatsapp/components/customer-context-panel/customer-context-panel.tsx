"use client";

import { useEffect, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components/ui/button";
import { Icon } from "@/shared/components/ui/icon";
import { usePermissions } from "@/modules/auth";
import { ContractStatusChip } from "@/modules/contracts/components/contract-status/contract-status";
import type { ContractStatus } from "@/modules/contracts/types/contract.types";
import { whatsappCustomerContext } from "../../utils/whatsapp-customer-context";
import type {
  WhatsAppConversationDetailDto,
  WhatsAppCustomerContextDto,
} from "../../types/whatsapp.types";
import {
  CONTRACTS_READ_PERMISSION,
  CUSTOMERS_READ_PERMISSION,
} from "../../whatsapp.permissions";
import styles from "./customer-context-panel.module.css";

export function WhatsAppCustomerContextPanel({
  conversation,
  open,
  onToggle,
}: {
  conversation: WhatsAppConversationDetailDto;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("WhatsApp");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const canReadCustomers = hasPermission(CUSTOMERS_READ_PERMISSION);
  const canReadContracts = hasPermission(CONTRACTS_READ_PERMISSION);
  const linked = conversation.customerLink.linked;
  const [context, setContext] = useState<WhatsAppCustomerContextDto | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !linked) {
      setContext(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void whatsappCustomerContext
      .load(conversation.id)
      .then((next) => {
        if (!cancelled) setContext(next);
      })
      .catch(() => {
        if (!cancelled) setContext(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, linked, conversation.id]);

  if (!linked) return null;

  const customer = context?.customer ?? conversation.customerLink.customer;
  const contracts = context?.contracts;

  function openContractsForCustomer() {
    if (!customer?.id) return;
    router.push(`/${locale}/contracts?customerId=${customer.id}`);
  }

  function openContract(contractId: string) {
    router.push(`/${locale}/contracts/${contractId}/contract`);
  }

  return (
    <div className={styles.wrap}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={styles.toggle}
        data-testid="whatsapp-customer-context-toggle"
        aria-expanded={open}
        onClick={onToggle}
      >
        <Icon name="mdi:account-card-outline" size={16} />
        <span>{t("customer.context.toggle")}</span>
      </Button>
      {open ? (
        <section className={styles.panel} data-testid="whatsapp-customer-context-panel">
          {loading ? <p className={styles.muted}>{t("customer.context.loading")}</p> : null}
          {!loading && !canReadCustomers ? (
            <p className={styles.muted}>{t("customer.context.customerHidden")}</p>
          ) : null}
          {!loading && customer ? (
            <div className={styles.block}>
              <p className={styles.name}>{customer.name}</p>
              {customer.mobile ? (
                <p className={styles.meta} dir="ltr">{customer.mobile}</p>
              ) : null}
              {customer.externalId ? (
                <p className={styles.meta}>
                  {t("customer.context.accountId")}: {customer.externalId}
                </p>
              ) : null}
              {canReadCustomers ? (
                <Button type="button" variant="secondary" size="sm" onClick={openContractsForCustomer}>
                  {t("customer.context.viewCustomerContracts")}
                </Button>
              ) : null}
            </div>
          ) : null}
          {!loading && canReadContracts && contracts?.canRead ? (
            <>
              {contracts.active ? (
                <div className={styles.block}>
                  <p className={styles.section}>{t("customer.context.activeRental")}</p>
                  <ContractRow
                    contract={contracts.active}
                    format={format}
                    onOpen={() => openContract(contracts.active!.id)}
                    t={t}
                  />
                </div>
              ) : contracts.latest ? (
                <div className={styles.block}>
                  <p className={styles.section}>{t("customer.context.latestContract")}</p>
                  <ContractRow
                    contract={contracts.latest}
                    format={format}
                    onOpen={() => openContract(contracts.latest!.id)}
                    t={t}
                  />
                </div>
              ) : (
                <p className={styles.muted}>{t("customer.context.noContracts")}</p>
              )}
            </>
          ) : !loading && linked && !canReadContracts ? (
            <p className={styles.muted}>{t("customer.context.contractsHidden")}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function ContractRow({
  contract,
  format,
  onOpen,
  t,
}: {
  contract: {
    contractNumber: string;
    status: string;
    expectedReturnAt: string;
    vehicleName: string;
    plateNumber: string;
    companyDisplayName: string;
  };
  format: ReturnType<typeof useFormatter>;
  onOpen: () => void;
  t: ReturnType<typeof useTranslations<"WhatsApp">>;
}) {
  const returnAt = new Date(contract.expectedReturnAt);
  return (
    <div className={styles.contract}>
      <div className={styles.contractHead}>
        <span className={styles.contractNumber}>{contract.contractNumber}</span>
        <ContractStatusChip status={contract.status as ContractStatus} />
      </div>
      <p className={styles.meta}>
        {contract.vehicleName} · <span dir="ltr">{contract.plateNumber}</span>
      </p>
      <p className={styles.meta}>{contract.companyDisplayName}</p>
      <p className={styles.meta}>
        {t("customer.context.expectedReturn")}:{" "}
        {format.dateTime(returnAt, { dateStyle: "medium", timeStyle: "short" })}
      </p>
      <Button type="button" variant="secondary" size="sm" onClick={onOpen}>
        {t("customer.context.viewContract")}
      </Button>
    </div>
  );
}
