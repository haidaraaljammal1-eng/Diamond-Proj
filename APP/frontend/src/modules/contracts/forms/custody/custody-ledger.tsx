"use client";

import { useId, useState, type ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Icon } from "@/shared/components/ui/icon";
import type { CarOutAngle } from "../../types/contract.types";
import {
  custodyLedgerModel,
  type CustodyDraftValues,
  type CustodyItemState,
  type CustodySavedValues,
} from "./custody-ledger.model";
import styles from "./custody-dialog.module.css";

export type LedgerTarget = "mileage" | "fuel" | "damage" | "signature" | CarOutAngle;

export interface CustodyLedgerProps {
  /** Message namespace of this custody side, e.g. `Contracts.carOut` or `Contracts.carIn`. */
  namespace: string;
  saved: CustodySavedValues;
  /** Local Step 1 values; compared with the saved state to flag unsaved edits. */
  draft: CustodyDraftValues;
  /** Required angles in walk-around order. */
  angles: readonly CarOutAngle[];
  photoEvidence: { required: number; completed: number; missing: CarOutAngle[] };
  step: 1 | 2;
  /** False when the photo step cannot be opened yet. */
  photosReachable: boolean;
  onSelect: (target: LedgerTarget) => void;
  footer?: ReactNode;
}

/**
 * The custody ledger: every requirement with its saved state, always visible.
 * "Done" means saved on the server; local edits read as "not saved" until the
 * draft is saved, so the staff member never mistakes typed for recorded.
 */
export function CustodyLedger({ namespace, saved, draft, angles, photoEvidence, step, photosReachable, onSelect, footer }: CustodyLedgerProps) {
  const t = useTranslations(namespace);
  const format = useFormatter();
  const titleId = useId();
  const [expanded, setExpanded] = useState(false);

  const model = custodyLedgerModel(saved, draft, photoEvidence);
  const missingAngles = new Set(photoEvidence.missing);
  const { done, total, missingCount } = model;

  const stateLabel = (state: CustodyItemState) => t(`ledger.state.${state}`);
  const dataItems: Array<{ target: LedgerTarget; label: string; state: CustodyItemState; value: string | null; ltr?: boolean }> = [
    { target: "mileage", label: t("ledger.mileage"), state: model.mileage, value: draft.mileage.trim() && Number.isFinite(Number(draft.mileage)) ? format.number(Number(draft.mileage)) : null, ltr: true },
    { target: "fuel", label: t("fuel"), state: model.fuel, value: draft.fuel, ltr: true },
    { target: "damage", label: t("ledger.damage"), state: model.damage, value: draft.damage.length ? t("ledger.damageCount", { count: draft.damage.length }) : t("ledger.noDamage") },
    { target: "signature", label: t("ledger.signature"), state: model.signature, value: model.signature === "done" ? t("ledger.signed") : null },
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
          <span className={styles.ledgerGroupCount}>{t("ledger.count", { done: photoEvidence.completed, total: photoEvidence.required })}</span>
        </p>
        <ul className={`${styles.ledgerList} ${styles.ledgerPhotos}`}>
          {angles.map((angle, index) => {
            const state: CustodyItemState = missingAngles.has(angle) ? "missing" : "done";
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
