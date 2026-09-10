"use client";

import { useLocale, useTranslations } from "next-intl";
import { Chip } from "@/shared/components/ui/chip";
import { VehicleImage } from "@/modules/vehicles/components/vehicle-image/vehicle-image";
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
import styles from "./road-liability-row.module.css";

export interface RoadLiabilityRowProps {
  item: RoadLiabilityListItemDto;
  selected: boolean;
  onSelect: (id: string) => void;
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

export function RoadLiabilityRow({ item, selected, onSelect }: RoadLiabilityRowProps) {
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
      ]
        .filter(Boolean)
        .join(" ")}
      tabIndex={0}
      aria-selected={selected}
      data-testid="road-liability-row"
      data-liability-id={item.id}
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
        <div className={styles.vehicle}>
          <VehicleImage path={item.vehicle?.primaryImageUrl} alt="" className={styles.photo} />
          <div>
            <p className={styles.name}>{item.vehicle?.displayName ?? t("noVehicle")}</p>
            <p className={styles.plate} dir="ltr">
              {plate}
            </p>
          </div>
        </div>
      </td>
      <td className={styles.cell}>
        <div className={styles.party}>
          <p className={styles.partyName}>{item.customer?.displayName ?? t("noCustomer")}</p>
          <p className={styles.contract} dir="ltr">
            {item.contract?.contractNumber ?? t("noContract")}
          </p>
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
        {item.reconciliationAttached ? (
          <p className={styles.attachedHint}>{t("charge.addedShort")}</p>
        ) : null}
      </td>
    </tr>
  );
}

export function RoadLiabilityCard({ item, selected, onSelect }: RoadLiabilityRowProps) {
  const t = useTranslations("RoadLiabilities");
  const amount = formatLiabilityAmount(item);
  const gpsOnly = isGpsPredictionOnly(item);
  const plate = item.vehicle?.plateNumber?.trim() || t("noPlate");

  return (
    <button
      type="button"
      className={[
        styles.card,
        selected ? styles.cardSelected : "",
        gpsOnly ? styles.cardPrediction : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-pressed={selected}
      data-testid="road-liability-card"
      data-liability-id={item.id}
      data-work-state={item.workState}
      onClick={() => onSelect(item.id)}
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
      <div className={styles.vehicle}>
        <VehicleImage path={item.vehicle?.primaryImageUrl} alt="" className={styles.photo} />
        <div>
          <p className={styles.name}>{item.vehicle?.displayName ?? t("noVehicle")}</p>
          <p className={styles.plate} dir="ltr">
            {plate}
          </p>
        </div>
      </div>
      <div className={styles.party}>
        <p className={styles.partyName}>{item.customer?.displayName ?? t("noCustomer")}</p>
        <p className={styles.contract} dir="ltr">
          {item.contract?.contractNumber ?? t("noContract")}
        </p>
      </div>
      <div className={styles.cardBottom}>
        <WorkStateChip item={item} />
        {item.reconciliationAttached ? (
          <p className={styles.attachedHint}>{t("charge.addedShort")}</p>
        ) : null}
      </div>
    </button>
  );
}
