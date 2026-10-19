"use client";

import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Chip } from "@/shared/components/ui/chip";
import { CompanyIdentity } from "@/shared/components/company-identity";
import type { RoadLiabilityListItemDto } from "../../types/road-liabilities.types";
import { formatLiabilityAmount, toValidOccurredDate } from "../../utils/road-liability-format";
import {
  authorityFromType,
  isGpsPredictionOnly,
  isGpsThenAuthoritative,
  typeTranslationKey,
  workStateChipTone,
  workStateTranslationKey,
} from "../../utils/road-liability-status";
import { staffChargeReferenceLabelKey } from "../staff-contract-charge/staff-contract-charge-dialog.logic";
import styles from "./road-liability-row.module.css";

export interface RoadLiabilityRowProps {
  item: RoadLiabilityListItemDto;
  selected: boolean;
  onSelect: (id: string) => void;
  showCollectAction?: boolean;
  showCashCollectAction?: boolean;
  onCollect?: (item: RoadLiabilityListItemDto) => void;
  onCashCollect?: (item: RoadLiabilityListItemDto) => void;
  collectSubmitting?: boolean;
}

function AuthorityMark({ item }: { item: RoadLiabilityListItemDto }) {
  const t = useTranslations("RoadLiabilities");
  const authority = authorityFromType(item.type);
  const gpsOnly = isGpsPredictionOnly(item);
  const dual = isGpsThenAuthoritative(item);

  return (
    <div className={styles.sourceBlock}>
      <div className={styles.sourceRow}>
        <span className={styles.sourceTag}>
          <span className={styles.dot} aria-hidden="true" />
          {t(`channel.${authority}`)}
        </span>
      </div>
      <span className={styles.typeLabel}>{t(typeTranslationKey(item.type))}</span>
      {gpsOnly || dual ? (
        <span className={styles.gpsHint}>{t("prediction.detectedByGps")}</span>
      ) : null}
    </div>
  );
}

/**
 * Company identity, or the neutral unmatched treatment when the Backend resolved
 * none. An unmatched liability belongs to no company; it is never shown as one.
 */
function CompanyMark({ item }: { item: RoadLiabilityListItemDto }) {
  const tCompany = useTranslations("OperatingCompanies");
  if (!item.company) {
    return (
      <span className={styles.noCompany} data-testid="road-liability-company-unmatched" dir="auto">
        {tCompany("unmatched")}
      </span>
    );
  }
  return (
    <span className={styles.companyMark} data-testid="road-liability-company">
      <CompanyIdentity company={item.company} compact />
    </span>
  );
}

function PartyReference({ item }: { item: RoadLiabilityListItemDto }) {
  const t = useTranslations("RoadLiabilities");
  if (item.staffEntered?.referenceNumber) {
    return (
      <p className={styles.metaLine} dir="ltr" data-testid="road-liability-staff-reference">
        <span className={styles.metaLabel}>
          {t(
            `staffCharge.${staffChargeReferenceLabelKey(
              item.staffEntered.chargeCategory ?? "TRAFFIC_VIOLATION",
            )}`,
          )}
          :
        </span>{" "}
        {item.staffEntered.referenceNumber}
      </p>
    );
  }

  const externalReference = item.authoritative.externalReference?.trim();
  if (!externalReference) return null;

  return (
    <p className={styles.metaLine} dir="ltr" data-testid="road-liability-external-reference">
      <span className={styles.metaLabel}>{t("detail.reference")}:</span> {externalReference}
    </p>
  );
}

function WorkStateChip({ item }: { item: RoadLiabilityListItemDto }) {
  const t = useTranslations("RoadLiabilities");
  return (
    <span data-testid="road-liability-work-state">
      <Chip tone={workStateChipTone(item.workState)} dot>
        {t(workStateTranslationKey(item.workState, item))}
      </Chip>
    </span>
  );
}

export function RoadLiabilityRow({
  item,
  selected,
  onSelect,
  showCollectAction = false,
  showCashCollectAction = false,
  onCollect,
  onCashCollect,
  collectSubmitting = false,
}: RoadLiabilityRowProps) {
  const t = useTranslations("RoadLiabilities");
  const locale = useLocale();
  const occurred = toValidOccurredDate(item.occurredAt);
  const amount = formatLiabilityAmount(item);
  const gpsOnly = isGpsPredictionOnly(item);
  const plate = item.vehicle?.plateNumber?.trim() || t("noPlate");
  const dateLabel = occurred
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(occurred)
    : "—";
  const timeLabel = occurred
    ? new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(occurred)
    : "";

  return (
    <tr
      className={[
        styles.row,
        selected ? styles.selected : "",
        gpsOnly ? styles.prediction : "",
        showCashCollectAction ? styles.cashAttention : "",
      ]
        .filter(Boolean)
        .join(" ")}
      tabIndex={0}
      aria-selected={selected}
      data-testid="road-liability-row"
      data-liability-id={item.id}
      data-record-id={item.id}
      data-work-state={item.workState}
      data-prediction={gpsOnly ? "true" : "false"}
      onClick={() => onSelect(item.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(item.id);
        }
      }}
    >
      <td className={styles.cell}>
        <AuthorityMark item={item} />
      </td>
      <td className={styles.cell}>
        <div className={styles.vehicleStack}>
          <div className={styles.vehicleTitleRow}>
            <p className={styles.name}>{item.vehicle?.displayName ?? t("noVehicle")}</p>
            <CompanyMark item={item} />
          </div>
          <p className={styles.plate} dir="ltr">
            {plate}
          </p>
        </div>
      </td>
      <td className={styles.cell}>
        <div className={styles.partyStack}>
          <p className={styles.partyName}>{item.customer?.displayName ?? t("noCustomer")}</p>
          <p className={styles.contract} dir="ltr">
            {item.contract?.contractNumber ?? t("noContract")}
          </p>
          <PartyReference item={item} />
        </div>
      </td>
      <td className={styles.cell}>
        <p className={styles.occurred}>{dateLabel}</p>
        {timeLabel ? <p className={styles.time}>{timeLabel}</p> : null}
      </td>
      <td className={styles.cell}>
        {amount.kind === "awaiting" ? (
          <span className={styles.awaiting}>{t("amount.awaiting")}</span>
        ) : (
          <span className={styles.amount} dir="ltr">
            {amount.formatted}
          </span>
        )}
      </td>
      <td className={styles.cell}>
        <WorkStateChip item={item} />
        {showCashCollectAction ? (
          <p className={styles.cashHint}>{t("collect.cashRowHint")}</p>
        ) : null}
        {item.reconciliationAttached ? (
          <p className={styles.attachedHint}>{t("charge.addedShort")}</p>
        ) : null}
        {showCashCollectAction ? (
          <Button
            type="button"
            size="sm"
            className={styles.collectAction}
            loading={collectSubmitting}
            data-testid="road-liability-cash-collect-row"
            onClick={(event) => {
              event.stopPropagation();
              if (collectSubmitting) return;
              onCashCollect?.(item);
            }}
          >
            {t("collect.cashRowAction")}
          </Button>
        ) : null}
        {showCollectAction ? (
          <Button
            type="button"
            size="sm"
            className={styles.collectAction}
            loading={collectSubmitting}
            data-testid="road-liability-collect-row"
            onClick={(event) => {
              event.stopPropagation();
              if (collectSubmitting) return;
              onCollect?.(item);
            }}
          >
            {t("collect.rowAction")}
          </Button>
        ) : null}
      </td>
    </tr>
  );
}

export function RoadLiabilityCard({
  item,
  selected,
  onSelect,
  showCollectAction = false,
  showCashCollectAction = false,
  onCollect,
  onCashCollect,
  collectSubmitting = false,
}: RoadLiabilityRowProps) {
  const t = useTranslations("RoadLiabilities");
  const amount = formatLiabilityAmount(item);
  const gpsOnly = isGpsPredictionOnly(item);
  const plate = item.vehicle?.plateNumber?.trim() || t("noPlate");

  const cardClassName = [
    styles.card,
    selected ? styles.cardSelected : "",
    gpsOnly ? styles.cardPrediction : "",
    showCashCollectAction ? styles.cashAttention : "",
  ]
    .filter(Boolean)
    .join(" ");

  const selectCard = () => onSelect(item.id);

  return (
    <article
      className={cardClassName}
      data-testid="road-liability-card"
      data-liability-id={item.id}
      data-record-id={item.id}
      data-work-state={item.workState}
      data-prediction={gpsOnly ? "true" : "false"}
    >
      <div
        className={styles.cardSelectable}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={selectCard}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectCard();
          }
        }}
      >
        <div className={styles.cardTop}>
          <AuthorityMark item={item} />
          {amount.kind === "awaiting" ? (
            <span className={styles.awaiting}>{t("amount.awaiting")}</span>
          ) : (
            <span className={styles.amount} dir="ltr">
              {amount.formatted}
            </span>
          )}
        </div>
        <div className={styles.vehicleStack}>
          <div className={styles.vehicleTitleRow}>
            <p className={styles.name}>{item.vehicle?.displayName ?? t("noVehicle")}</p>
            <CompanyMark item={item} />
          </div>
          <p className={styles.plate} dir="ltr">
            {plate}
          </p>
        </div>
        <div className={styles.partyStack}>
          <p className={styles.partyName}>{item.customer?.displayName ?? t("noCustomer")}</p>
          <p className={styles.contract} dir="ltr">
            {item.contract?.contractNumber ?? t("noContract")}
          </p>
          <PartyReference item={item} />
        </div>
        <div className={styles.cardBottom}>
          <WorkStateChip item={item} />
          {showCashCollectAction ? (
            <p className={styles.cashHint}>{t("collect.cashRowHint")}</p>
          ) : null}
          {item.reconciliationAttached ? (
            <p className={styles.attachedHint}>{t("charge.addedShort")}</p>
          ) : null}
        </div>
      </div>
      {showCashCollectAction ? (
        <Button
          type="button"
          size="sm"
          className={styles.collectAction}
          loading={collectSubmitting}
          data-testid="road-liability-cash-collect-card"
          onClick={(event) => {
            event.stopPropagation();
            if (collectSubmitting) return;
            onCashCollect?.(item);
          }}
        >
          {t("collect.cashRowAction")}
        </Button>
      ) : null}
      {showCollectAction ? (
        <Button
          type="button"
          size="sm"
          className={styles.collectAction}
          loading={collectSubmitting}
          data-testid="road-liability-collect-card"
          onClick={(event) => {
            event.stopPropagation();
            if (collectSubmitting) return;
            onCollect?.(item);
          }}
        >
          {t("collect.rowAction")}
        </Button>
      ) : null}
    </article>
  );
}
