"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Dialog } from "@/shared/components/ui/dialog";
import { formatRentalDuration } from "../../utils/format-rental-duration";
import {
  RENEWAL_DATE_TIME_FORMAT,
  renewalCollectionState,
  renewalDurationUnitLabelKey,
  renewalHistoryLabelKey,
  renewalStartSourceLabelKey,
  renewalStoredDuration,
  renewalTimelineEndpoints,
} from "../../utils/renewal-history";
import type { ContractDetailDto } from "../../types/contract.types";
import { RenewalDateRange } from "./renewal-date-range";
import { contractPaymentMethodLabel } from "../../utils/contract-payment-method";
import styles from "./contract-detail-drawer.module.css";

export interface RenewalDetailDialogProps {
  detail: ContractDetailDto | null;
  renewalId: string | null;
  onClose: () => void;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.renewalDetailRow}>
      <span className={styles.renewalDetailLabel}>{label}</span>
      <span className={styles.renewalDetailValue}>{value}</span>
    </div>
  );
}

export function RenewalDetailDialog({ detail, renewalId, onClose }: RenewalDetailDialogProps) {
  const t = useTranslations("Contracts");
  const td = useTranslations("Contracts.duration");
  const format = useFormatter();
  const renewal =
    detail && renewalId ? detail.renewals.find((row) => row.id === renewalId) ?? null : null;

  const money = (value: number, currency: string) => `${format.number(value)} ${currency}`;

  const collectionState = renewal ? renewalCollectionState(renewal) : null;
  const statusLabel =
    collectionState != null ? t(renewalHistoryLabelKey(collectionState)) : "";

  return (
    <Dialog
      open={renewal != null && detail != null}
      onClose={onClose}
      title={t("detail.renewalDetailTitle")}
      closeLabel={t("detail.close")}
    >
      {renewal && detail ? (
        <div className={styles.renewalDetailBody} data-testid="renewal-detail-dialog">
          <div className={styles.renewalDetailHero}>
            <span className={styles.renewalDetailBadge} data-renewal-state={collectionState ?? undefined}>
              {statusLabel}
            </span>
            <p className={styles.renewalDetailHeroAmount}>
              {money(renewal.additionalAmount, detail.currency)}
            </p>
            <p className={styles.renewalDetailHeroDuration}>
              +{formatRentalDuration(renewalStoredDuration(renewal), td)}
              <span className={styles.renewalDetailHeroDot} aria-hidden="true">·</span>
              {t(renewalDurationUnitLabelKey(renewal))}
            </p>
          </div>

          <div className={styles.renewalDetailPanel}>
            <DetailRow
              label={t("detail.renewalDetailStatus")}
              value={statusLabel}
            />
            <DetailRow
              label={t("detail.renewalDetailAddedDuration")}
              value={formatRentalDuration(renewalStoredDuration(renewal), td)}
            />
            <DetailRow
              label={t("detail.renewalDetailDurationType")}
              value={t(renewalDurationUnitLabelKey(renewal))}
            />
            <DetailRow
              label={t("detail.renewalDetailAmount")}
              value={money(renewal.additionalAmount, detail.currency)}
            />
            <DetailRow
              label={t("detail.renewalDetailCollection")}
              value={statusLabel}
            />
            {renewal.paymentMethod ? (
              <DetailRow
                label={t("detail.method")}
                value={contractPaymentMethodLabel(renewal.paymentMethod, t as never)}
              />
            ) : null}
          </div>

          <div className={styles.renewalDetailPanel}>
            <div className={styles.renewalDetailRow}>
              <span className={styles.renewalDetailLabel}>{t("detail.renewalDetailStartAt")}</span>
              <span className={styles.renewalDetailValue}>
                <bdi>
                  {format.dateTime(
                    new Date(renewalTimelineEndpoints(renewal).startAt),
                    RENEWAL_DATE_TIME_FORMAT,
                  )}
                </bdi>
              </span>
            </div>
            <p className={styles.renewalDetailHint}>
              {t(renewalStartSourceLabelKey(detail.renewals, renewal.id))}
            </p>
            <hr className={styles.renewalDetailDivider} />
            <div className={styles.renewalDetailRow}>
              <span className={styles.renewalDetailLabel}>{t("detail.renewalDetailEndAt")}</span>
              <span className={styles.renewalDetailValue}>
                <bdi>
                  {format.dateTime(
                    new Date(renewalTimelineEndpoints(renewal).endAt),
                    RENEWAL_DATE_TIME_FORMAT,
                  )}
                </bdi>
              </span>
            </div>
          </div>

          <div className={styles.renewalDetailTimelineCard}>
            <span className={styles.renewalDetailLabel}>{t("detail.renewalDetailTimeline")}</span>
            <span className={styles.renewalDetailTimelineValue}>
              <RenewalDateRange renewal={renewal} data-testid="renewal-detail-timeline" />
            </span>
          </div>

          <p className={styles.renewalDetailFootnote}>
            {renewal.extensionApplied
              ? t("detail.renewalDatesApplied")
              : t("detail.renewalDatesPlanned")}
          </p>
        </div>
      ) : null}
    </Dialog>
  );
}
