"use client";

import { useId, useState, type ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Icon } from "@/shared/components/ui/icon";
import type { DamageMark } from "@/modules/public-rental/types/official-contract.types";
import type { useContract } from "../../hooks/use-contract";
import type { CarOutAngle, FuelLevel } from "../../types/contract.types";
import styles from "./car-out-dialog.module.css";

type Handover = NonNullable<ReturnType<typeof useContract>["carOutHandover"]>;
type ItemState = "done" | "missing" | "unsaved" | "optional";
export type LedgerTarget = "mileage" | "fuel" | "damage" | "signature" | CarOutAngle;

export interface CarOutLedgerProps {
  handover: Handover;
  /** Required angles in walk-around order. */
  angles: readonly CarOutAngle[];
  /** Local Step 1 values; compared with the saved handover to flag unsaved edits. */
  draft: { mileage: string; fuel: FuelLevel | null; damage: DamageMark[]; signatureDrawn: boolean };
  step: 1 | 2;
  /** False when the photo step cannot be opened (no signed contract). */
  photosReachable: boolean;
  onSelect: (target: LedgerTarget) => void;
  footer?: ReactNode;
}

/**
 * The handover ledger: every requirement with its saved state, always visible.
 * "Done" means saved on the server; local edits read as "not saved" until the
 * draft is saved, so the staff member never mistakes typed for recorded.
 */
export function CarOutLedger({ handover, angles, draft, step, photosReachable, onSelect, footer }: CarOutLedgerProps) {
  const t = useTranslations("Contracts.carOut");
  const format = useFormatter();
  const titleId = useId();
  const [expanded, setExpanded] = useState(false);

  const savedMileage = handover.mileageOut == null ? "" : String(handover.mileageOut);
  const savedFuel = (handover.fuelOut as FuelLevel | null) ?? null;
  const savedDamage = handover.damageOut ?? [];
  const mileageState: ItemState = draft.mileage.trim() !== savedMileage ? "unsaved" : savedMileage ? "done" : "missing";
  const fuelState: ItemState = draft.fuel !== savedFuel ? "unsaved" : savedFuel ? "done" : "missing";
  const damageState: ItemState = JSON.stringify(draft.damage) !== JSON.stringify(savedDamage) ? "unsaved" : savedDamage.length ? "done" : "optional";
  const signatureState: ItemState = draft.signatureDrawn ? "unsaved" : handover.signature.present ? "done" : "missing";
  const missingAngles = new Set(handover.photoEvidence.missing);

  const dataDone = [mileageState, fuelState, signatureState].filter((state) => state === "done").length;
  const photosDone = handover.photoEvidence.completed;
  const total = 3 + handover.photoEvidence.required;
  const done = dataDone + photosDone;
  const missingCount = total - done;

  const stateLabel = (state: ItemState) => t(`ledger.state.${state}`);
  const dataItems: Array<{ target: LedgerTarget; label: string; state: ItemState; value: string | null; ltr?: boolean }> = [
    { target: "mileage", label: t("ledger.mileage"), state: mileageState, value: draft.mileage.trim() && Number.isFinite(Number(draft.mileage)) ? format.number(Number(draft.mileage)) : null, ltr: true },
    { target: "fuel", label: t("fuel"), state: fuelState, value: draft.fuel, ltr: true },
    { target: "damage", label: t("ledger.damage"), state: damageState, value: draft.damage.length ? t("ledger.damageCount", { count: draft.damage.length }) : t("ledger.noDamage") },
    { target: "signature", label: t("ledger.signature"), state: signatureState, value: signatureState === "done" ? t("ledger.signed") : null },
  ];

  return (
    <aside className={styles.ledger} aria-labelledby={titleId} data-expanded={expanded || undefined}>
      <div className={styles.ledgerHead}>
        <h4 id={titleId}>{t("ledger.title")}</h4>
        <span className={styles.ledgerCount}>
          <span className={styles.ledgerCountFull}>{t("ledger.count", { done, total })}</span>
          <span className={styles.ledgerCountShort}>{missingCount ? t("ledger.missingCount", { count: missingCount }) : t("ledger.allDone")}</span>
        </span>
        <button type="button" className={styles.ledgerToggle} aria-expanded={expanded} onClick={() => setExpanded((open) => !open)}>
          {expanded ? t("ledger.hide") : t("ledger.show")}
          <Icon name="mdi:chevron-down" size={16} className={styles.ledgerToggleIcon} />
        </button>
      </div>
      <div className={styles.meter} role="progressbar" aria-label={t("ledger.progressLabel")} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-valuetext={t("ledger.count", { done, total })}>
        <span style={{ transform: `scaleX(${total ? done / total : 0})` }} />
      </div>
      <nav className={styles.ledgerBody} aria-labelledby={titleId}>
        <p className={styles.ledgerGroup} data-current={step === 1}>{t("ledger.details")}</p>
        <ul className={styles.ledgerList}>
          {dataItems.map((item) => (
            <li key={item.target}>
              <button type="button" className={styles.ledgerItem} data-state={item.state} onClick={() => onSelect(item.target)}>
                <span className={styles.ledgerMark} aria-hidden="true" />
                <span className={styles.ledgerLabel}>{item.label}</span>
                <span className={styles.ledgerValue}>
                  {item.state === "missing" || item.state === "unsaved" || !item.value ? stateLabel(item.state) : item.ltr ? <bdi dir="ltr">{item.value}</bdi> : item.value}
                </span>
                {item.state === "done" && item.value ? <span className={styles.srOnly}>{stateLabel(item.state)}</span> : null}
              </button>
            </li>
          ))}
        </ul>
        <p className={styles.ledgerGroup} data-current={step === 2}>
          {t("ledger.photos")}
          <span className={styles.ledgerGroupCount}>{t("ledger.count", { done: photosDone, total: handover.photoEvidence.required })}</span>
        </p>
        <ul className={`${styles.ledgerList} ${styles.ledgerPhotos}`}>
          {angles.map((angle, index) => {
            const state: ItemState = missingAngles.has(angle) ? "missing" : "done";
            return (
              <li key={angle}>
                <button type="button" className={styles.ledgerItem} data-state={state} disabled={!photosReachable} onClick={() => onSelect(angle)}>
                  <span className={styles.ledgerMark} aria-hidden="true" />
                  <span className={styles.ledgerIndex}>{format.number(index + 1)}</span>
                  <span className={styles.ledgerLabel}>{t(`angle.${angle}`)}</span>
                  <span className={styles.srOnly}>{stateLabel(state)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      {footer ? <div className={styles.ledgerFoot}>{footer}</div> : null}
    </aside>
  );
}
