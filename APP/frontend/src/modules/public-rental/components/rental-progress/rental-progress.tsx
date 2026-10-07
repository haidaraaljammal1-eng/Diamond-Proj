"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/shared/components/ui/icon/icon";
import type { PublicRentalUiStage } from "../../types/public-rental.types";
import { canEnterStage, stageRank } from "../../utils/flow-step";
import styles from "./rental-progress.module.css";

const STEPS = ["license", "contract", "payment"] as const;

interface RentalProgressProps {
  allowed: PublicRentalUiStage;
  current: PublicRentalUiStage;
  onSelect: (stage: PublicRentalUiStage) => void;
  cashCollection?: boolean;
}

export function RentalProgress({
  allowed,
  current,
  onSelect,
  cashCollection = false,
}: RentalProgressProps) {
  const t = useTranslations("PublicRental.progress");
  const labels = {
    license: t("license"),
    contract: t("contract"),
    payment: cashCollection ? t("completion") : t("payment"),
  } as const;

  const railFill: "license" | "contract" | "payment" =
    allowed === "payment" || allowed === "handover"
      ? "payment"
      : allowed === "contract"
        ? "contract"
        : "license";

  return (
    <nav className={styles.root} aria-label={t("label")}>
      <div className={styles.rail} data-testid="rental-progress-connector">
        <span
          className={styles.railBase}
          data-testid="rental-progress-connector-base"
          data-fill={railFill}
        />
        <span className={styles.railPulse} data-testid="rental-progress-connector-pulse">
          <span className={styles.railPulseSegment} data-testid="rental-progress-connector-pulse-segment" />
        </span>
      </div>
      <ol className={styles.track} data-testid="rental-progress">
        {STEPS.map((stage, index) => {
          const reachable = canEnterStage(stage, allowed);
          const done = stageRank(stage) < stageRank(allowed);
          const active = current === stage;
          return (
            <li
              key={stage}
              className={styles.item}
              data-last={index === STEPS.length - 1 || undefined}
              data-done={done || undefined}
            >
              <button
                type="button"
                className={styles.step}
                data-testid={`rental-progress-step-${stage}`}
                data-active={active || undefined}
                data-done={done || undefined}
                disabled={!reachable}
                onClick={() => {
                  if (reachable) onSelect(stage);
                }}
              >
                <span
                  className={styles.marker}
                  data-testid={`rental-progress-marker-${stage}`}
                  aria-hidden
                >
                  {done && !active ? (
                    <Icon name="mdi:check" size={14} className={styles.checkIcon} />
                  ) : (
                    <span className={styles.markerIndex}>{index + 1}</span>
                  )}
                </span>
                <span className={styles.label}>{labels[stage]}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
