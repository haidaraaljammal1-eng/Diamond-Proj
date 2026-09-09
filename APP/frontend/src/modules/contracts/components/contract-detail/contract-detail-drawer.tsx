"use client";

import { useEffect } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Drawer } from "@/shared/components/ui/drawer";
import { useContract } from "../../hooks/use-contract";
import { ContractStatusChip } from "../contract-status/contract-status";
import { ContractTimeline } from "../contract-timeline/contract-timeline";
import { ContractInspectionImage } from "../contract-inspection-image/contract-inspection-image";
import { ContractTarsStatus } from "../contract-tars/contract-tars-status";
import { ContractTarsInlineStatus } from "../contract-tars/contract-tars-inline-status";
import { resolveContractsErrorMessage } from "../../utils/resolve-contracts-error";
import styles from "./contract-detail-drawer.module.css";

export interface ContractDetailDrawerProps {
  contractId: string | null;
  onClose: () => void;
  onGenerateRentalLink: (id: string) => void;
  onConfirmPayment: (id: string) => void;
  onCarOut: (id: string) => void;
  onReturnLink: (id: string) => void;
  onRenew: (id: string) => void;
  onReconcile: (id: string) => void;
  onCloseContract: (id: string) => void;
}

function Kv({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className={styles.kv}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

export function ContractDetailDrawer({
  contractId,
  onClose,
  onGenerateRentalLink,
  onConfirmPayment,
  onCarOut,
  onReturnLink,
  onRenew,
  onReconcile,
  onCloseContract,
}: ContractDetailDrawerProps) {
  const t = useTranslations("Contracts");
  const format = useFormatter();
  const {
    detail,
    detailStatus,
    detailError,
    actions,
    loadContract,
  } = useContract();

  useEffect(() => {
    if (contractId) void loadContract(contractId);
  }, [contractId, loadContract]);

  const errorMessage = resolveContractsErrorMessage(t, detailError);
  const money = (value: number, currency: string) =>
    `${format.number(value)} ${currency}`;

  return (
    <Drawer
      open={contractId != null}
      onClose={onClose}
      title={t("detail.title")}
      closeLabel={t("detail.close")}
      heading={detail?.contractNumber}
    >
      {detailStatus === "loading" || (contractId && !detail && !detailError) ? (
        <p className={styles.muted}>{t("detail.loading")}</p>
      ) : null}

      {errorMessage ? (
        <p className={styles.error} role="alert">{errorMessage}</p>
      ) : null}

      {detail ? (
        <div className={styles.root} data-testid="contract-detail">
          <div className={styles.summary}>
            <div className={styles.summaryHead}>
              <ContractStatusChip status={detail.status} />
            </div>
            <Kv label={t("table.customer")} value={detail.customer?.name} />
            {detail.customer?.mobile ? (
              <Kv label={t("detail.mobile")} value={detail.customer.mobile} />
            ) : null}
            <Kv label={t("table.vehicle")} value={detail.vehicle.displayName} />
            {detail.vehicle.plateNumber ? (
              <Kv label={t("detail.plate")} value={detail.vehicle.plateNumber} />
            ) : null}
            <Kv
              label={t("detail.days")}
              value={t("table.days", { count: detail.rentalDays })}
            />
            <Kv
              label={t("detail.amount")}
              value={money(detail.agreedAmount, detail.currency)}
            />
            {detail.depositAmount != null ? (
              <Kv
                label={t("detail.deposit")}
                value={money(detail.depositAmount, detail.currency)}
              />
            ) : null}
            {detail.startAt ? (
              <Kv
                label={t("detail.start")}
                value={format.dateTime(new Date(detail.startAt), { dateStyle: "medium" })}
              />
            ) : null}
            {detail.endAt ? (
              <Kv
                label={t("detail.end")}
                value={format.dateTime(new Date(detail.endAt), { dateStyle: "medium" })}
              />
            ) : null}
          </div>

          {detail.payment ? (
            <section className={styles.section}>
              <p className={styles.sectionTitle}>{t("detail.payment")}</p>
              <Kv
                label={t("detail.paidAmount")}
                value={money(detail.payment.amount, detail.payment.currency)}
              />
              <Kv label={t("detail.method")} value={t(`payment.method.${detail.payment.method}`)} />
            </section>
          ) : null}

          {detail.carOut ? (
            <section className={styles.section}>
              <p className={styles.sectionTitle}>{t("detail.carOut")}</p>
              <Kv label={t("carOut.mileage")} value={format.number(detail.carOut.mileageOut)} />
              <Kv label={t("carOut.fuel")} value={detail.carOut.fuelOut} />
              {detail.carOut.photos.length > 0 ? (
                <div className={styles.photos}>
                  {detail.carOut.photos.map((photo) => (
                    <ContractInspectionImage
                      key={photo.id}
                      path={photo.url}
                      alt={photo.angle}
                      className={styles.photo}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {detail.carIn ? (
            <section className={styles.section}>
              <p className={styles.sectionTitle}>{t("detail.carIn")}</p>
              <Kv label={t("carOut.mileage")} value={format.number(detail.carIn.mileageIn)} />
              <Kv label={t("carOut.fuel")} value={detail.carIn.fuelIn} />
              {detail.carIn.photos.length > 0 ? (
                <div className={styles.photos}>
                  {detail.carIn.photos.map((photo) => (
                    <ContractInspectionImage
                      key={photo.id}
                      path={photo.url}
                      alt={photo.angle}
                      className={styles.photo}
                    />
                  ))}
                </div>
              ) : null}
              <ContractTarsInlineStatus
                contractId={detail.id}
                operation="returnDocumentation"
                className={styles.inlineIntegration}
              />
            </section>
          ) : null}

          {detail.reconciliation ? (
            <section className={styles.section}>
              <p className={styles.sectionTitle}>{t("detail.reconciliation")}</p>
              <Kv
                label={t("reconcile.charges")}
                value={money(detail.reconciliation.chargesTotal, detail.currency)}
              />
              <Kv
                label={t("reconcile.final")}
                value={money(detail.reconciliation.finalAmount, detail.currency)}
              />
            </section>
          ) : null}

          {detail.renewals.length > 0 ? (
            <section className={styles.section}>
              <p className={styles.sectionTitle}>{t("detail.renewals")}</p>
              {detail.renewals.map((renewal) => (
                <p key={renewal.id} className={styles.muted}>
                  +{format.number(renewal.additionalDays)} / {money(renewal.additionalAmount, detail.currency)}
                </p>
              ))}
            </section>
          ) : null}

          <section className={styles.section}>
            <p className={styles.sectionTitle}>{t("timeline.title")}</p>
            <ContractTimeline status={detail.status} />
          </section>

          <ContractTarsStatus contractId={detail.id} />

          {actions ? (
            <div className={styles.actions}>
              {actions.showGenerateRentalLink ? (
                <Button type="button" size="sm" onClick={() => onGenerateRentalLink(detail.id)}>
                  {t("actions.rentalLink")}
                </Button>
              ) : null}
              {actions.showConfirmPayment ? (
                <Button type="button" size="sm" onClick={() => onConfirmPayment(detail.id)}>
                  {t("actions.confirmPayment")}
                </Button>
              ) : null}
              {actions.showCarOut ? (
                <Button type="button" size="sm" onClick={() => onCarOut(detail.id)}>
                  {t("actions.carOut")}
                </Button>
              ) : null}
              {actions.showGenerateReturnLink ? (
                <Button type="button" size="sm" onClick={() => onReturnLink(detail.id)}>
                  {t("actions.returnLink")}
                </Button>
              ) : null}
              {actions.showReturnWaiting ? (
                <p className={styles.muted}>{t("actions.returnWaiting")}</p>
              ) : null}
              {actions.showRenew ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => onRenew(detail.id)}>
                  {t("actions.renew")}
                </Button>
              ) : null}
              {actions.showReconcile ? (
                <Button type="button" size="sm" onClick={() => onReconcile(detail.id)}>
                  {t("actions.reconcile")}
                </Button>
              ) : null}
              {actions.showClose ? (
                <Button type="button" size="sm" onClick={() => onCloseContract(detail.id)}>
                  {t("actions.close")}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}
