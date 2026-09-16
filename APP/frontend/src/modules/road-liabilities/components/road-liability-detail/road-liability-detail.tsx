"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Chip } from "@/shared/components/ui/chip";
import { Drawer } from "@/shared/components/ui/drawer";
import { VehicleImage } from "@/modules/vehicles/components/vehicle-image/vehicle-image";
import { VehicleStatus } from "@/modules/vehicles/components/vehicle-status/vehicle-status";
import { ContractStatusChip } from "@/modules/contracts/components/contract-status/contract-status";
import type { RoadLiabilityDetailDto } from "../../types/road-liabilities.types";
import { formatLiabilityAmount, toValidOccurredDate } from "../../utils/road-liability-format";
import {
  attributionChipTone,
  attributionTranslationKey,
  authorityFromType,
  collectionChipTone,
  collectionTranslationKey,
  confirmationChipTone,
  confirmationTranslationKey,
  isContractStatus,
  isGpsPredictionOnly,
  isGpsThenAuthoritative,
  resolveRowSourceKey,
  sourceFallbackLabel,
  sourceTranslationKey,
  typeTranslationKey,
  workStateChipTone,
  workStateTranslationKey,
} from "../../utils/road-liability-status";
import { RoadLiabilityProvenanceTimeline } from "../road-liability-provenance/road-liability-provenance";
import { RoadLiabilityChargeReviewDialog } from "../road-liability-charge-review/road-liability-charge-review-dialog";
import { RoadLiabilityChargeReviewSection } from "../road-liability-charge-review/road-liability-charge-review-section";
import { useRoadLiabilityChargeReview } from "../../hooks/use-road-liability-charge-review";
import styles from "./road-liability-detail.module.css";

export interface RoadLiabilityDetailDrawerProps {
  open: boolean;
  detail: RoadLiabilityDetailDto | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
  onViewContract: (contractId: string) => void;
  onViewGps: (vehicleId: number) => void;
  onChargeConfirmed?: () => void;
}

function Kv({
  label,
  value,
  ltr,
}: {
  label: string;
  value?: string | null;
  ltr?: boolean;
}) {
  if (!value) return null;
  return (
    <div className={styles.kv}>
      <span>{label}</span>
      <b dir={ltr ? "ltr" : undefined}>{value}</b>
    </div>
  );
}

export function RoadLiabilityDetailDrawer({
  open,
  detail,
  loading,
  error,
  onClose,
  onRetry,
  onViewContract,
  onViewGps,
  onChargeConfirmed,
}: RoadLiabilityDetailDrawerProps) {
  const t = useTranslations("RoadLiabilities");
  const format = useFormatter();
  const charge = useRoadLiabilityChargeReview(detail, open, () => {
    onChargeConfirmed?.();
  });
  const occurred = toValidOccurredDate(detail?.occurredAt ?? null);
  const amount = detail ? formatLiabilityAmount(detail) : null;
  const gpsOnly = detail ? isGpsPredictionOnly(detail) : false;
  const dual = detail ? isGpsThenAuthoritative(detail) : false;
  const sourceKey = detail ? resolveRowSourceKey(detail) : "UNKNOWN";
  const sourceI18nKey = sourceTranslationKey(sourceKey);
  const sourceLabel = sourceI18nKey ? t(sourceI18nKey) : sourceFallbackLabel(sourceKey);
  const gateLabel =
    detail?.gate == null
      ? detail?.locationLabel
      : `${detail.gate.nameEn} / ${detail.gate.nameAr}`;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t("detail.title")}
      closeLabel={t("detail.close")}
      heading={detail?.authoritative.externalReference ?? undefined}
    >
      {loading ? <p className={styles.muted}>{t("detail.loading")}</p> : null}
      {error ? (
        <div className={styles.error} role="status">
          <p>{error}</p>
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            {t("retry")}
          </Button>
        </div>
      ) : null}

      {detail ? (
        <div className={styles.body} data-testid="road-liability-detail">
          <section>
            <p className={styles.section}>{t("detail.overview")}</p>
            <div className={styles.overview}>
              <div className={styles.chips}>
                <Chip tone="gold" dot>
                  {t(`channel.${authorityFromType(detail.type)}`)}
                </Chip>
                <Chip tone={workStateChipTone(detail.workState)} dot>
                  {t(workStateTranslationKey(detail.workState, detail))}
                </Chip>
              </div>
              {gpsOnly ? <p className={styles.note}>{t("prediction.detectedByGps")}</p> : null}
              {dual ? <p className={styles.note}>{t("prediction.confirmedAfterGps")}</p> : null}
              {amount?.kind === "awaiting" ? (
                <p className={styles.awaiting}>{t("amount.awaiting")}</p>
              ) : amount ? (
                <p className={styles.amount} dir="ltr">
                  {amount.formatted}
                </p>
              ) : null}
            </div>
            <Kv label={t("detail.type")} value={t(typeTranslationKey(detail.type))} />
            <Kv
              label={t("detail.source")}
              value={sourceLabel}
            />
            <Kv
              label={t("detail.occurred")}
              value={
                occurred
                  ? format.dateTime(occurred, { dateStyle: "medium", timeStyle: "short" })
                  : null
              }
            />
            <Kv label={t("detail.location")} value={gateLabel} />
            <Kv
              label={t("detail.reference")}
              value={detail.authoritative.externalReference}
              ltr
            />
          </section>

          <section data-testid="road-liability-event-status">
            <p className={styles.section}>{t("detail.eventStatus")}</p>
            <div className={styles.statusRow}>
              <span>{t("detail.confirmation")}</span>
              <Chip tone={confirmationChipTone(detail.confirmationStatus)} dot>
                {t(confirmationTranslationKey(detail.confirmationStatus))}
              </Chip>
            </div>
            <div className={styles.statusRow}>
              <span>{t("detail.attribution")}</span>
              <Chip tone={attributionChipTone(detail.attributionStatus)} dot>
                {t(attributionTranslationKey(detail.attributionStatus))}
              </Chip>
            </div>
            <div className={styles.statusRow}>
              <span>{t("detail.collection")}</span>
              <Chip tone={collectionChipTone(detail.collectionStatus)} dot>
                {t(collectionTranslationKey(detail.collectionStatus))}
              </Chip>
            </div>
          </section>

          <RoadLiabilityChargeReviewSection
            ui={charge.ui}
            canCharge={charge.canCharge}
            onReview={charge.openDialog}
          />

          {detail.vehicle ? (
            <section>
              <p className={styles.section}>{t("detail.vehicle")}</p>
              <div className={styles.hero}>
                <VehicleImage
                  path={detail.vehicle.primaryImageUrl}
                  alt=""
                  className={styles.photo}
                />
                <div>
                  <h3 className={styles.name}>{detail.vehicle.displayName}</h3>
                  <p className={styles.plate} dir="ltr">
                    {detail.vehicle.plateNumber || t("noPlate")}
                  </p>
                  <div className={styles.chips}>
                    <VehicleStatus status={detail.vehicle.operationalStatus} />
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <section>
            <p className={styles.section}>{t("detail.contract")}</p>
            {detail.attributionStatus === "matched" && detail.contract ? (
              <>
                <Kv
                  label={t("detail.contractNumber")}
                  value={detail.contract.contractNumber}
                  ltr
                />
                <div className={styles.statusRow}>
                  <span>{t("detail.contractStatus")}</span>
                  {isContractStatus(detail.contract.status) ? (
                    <ContractStatusChip status={detail.contract.status} />
                  ) : (
                    <b>{detail.contract.status}</b>
                  )}
                </div>
                <Kv label={t("detail.customer")} value={detail.customer?.displayName} />
                <p className={styles.note}>{t("attribution.matchedNote")}</p>
              </>
            ) : null}
            {detail.attributionStatus === "unmatched" ? (
              <p className={styles.warn}>{t("attribution.unmatchedNote")}</p>
            ) : null}
            {detail.attributionStatus === "ambiguous" ? (
              <p className={styles.warn}>{t("attribution.ambiguousNote")}</p>
            ) : null}
            {detail.attributionStatus === "unresolved" ? (
              <p className={styles.note}>{t("attribution.unresolvedNote")}</p>
            ) : null}
          </section>

          <section>
            <p className={styles.section}>{t("detail.provenance")}</p>
            <RoadLiabilityProvenanceTimeline entries={detail.provenance} />
          </section>

          <div className={styles.actions}>
            {detail.contract?.id ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                data-testid="road-liability-view-contract"
                onClick={() => onViewContract(detail.contract!.id)}
              >
                {t("detail.viewContract")}
              </Button>
            ) : null}
            {detail.vehicle?.id ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                data-testid="road-liability-view-gps"
                onClick={() => onViewGps(detail.vehicle!.id)}
              >
                {t("detail.viewGps")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {detail && charge.ui.kind === "available" && charge.ui.review ? (
        <RoadLiabilityChargeReviewDialog
          open={charge.dialogOpen}
          detail={detail}
          review={charge.ui.review}
          submitting={charge.submitting}
          submitError={charge.submitError}
          onClose={charge.closeDialog}
          onConfirm={charge.confirm}
        />
      ) : null}
    </Drawer>
  );
}
