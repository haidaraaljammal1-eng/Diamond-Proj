"use client";

import { useTranslations } from "next-intl";
import type { PublicRentalUiStage } from "../../types/public-rental.types";
import { canEnterStage, stageRank } from "../../utils/flow-step";
import styles from "./rental-progress.module.css";

const STEPS = ["license", "contract", "payment"] as const;

interface RentalProgressProps {
  allowed: PublicRentalUiStage;
  current: PublicRentalUiStage;
  onSelect: (stage: PublicRentalUiStage) => void;
}

export function RentalProgress({ allowed, current, onSelect }: RentalProgressProps) {
  const t = useTranslations("PublicRental.progress");
  const labels = {
    license: t("license"),
    contract: t("contract"),
    payment: t("payment"),
  } as const;

  return (
    <ol className={styles.list} aria-label={t("label")}>
      {STEPS.map((stage, index) => {
        const reachable = canEnterStage(stage, allowed);
        const done = stageRank(stage) < stageRank(allowed);
        return (
          <li key={stage}>
            <button
              type="button"
              className={styles.step}
              data-active={current === stage}
              data-done={done}
              disabled={!reachable}
              onClick={() => {
                if (reachable) onSelect(stage);
              }}
            >
              <span className={styles.index}>{index + 1}</span>
              <span className={styles.label}>{labels[stage]}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
