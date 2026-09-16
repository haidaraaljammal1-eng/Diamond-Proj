"use client";

import { formatFinanceAed } from "../../utils/format-finance-money";
import styles from "./finance-breakdown-list.module.css";

export interface FinanceBreakdownItem {
  key: string;
  label: string;
  amount: number;
  count?: number;
}

export interface FinanceBreakdownListProps {
  items: FinanceBreakdownItem[];
  emptyLabel: string;
  countLabel?: (count: number) => string;
  testIdPrefix?: string;
}

export function FinanceBreakdownList({
  items,
  emptyLabel,
  countLabel,
  testIdPrefix,
}: FinanceBreakdownListProps) {
  if (items.length === 0) {
    return <p className={styles.empty}>{emptyLabel}</p>;
  }

  const max = Math.max(...items.map((item) => item.amount), 1);

  return (
    <div className={styles.list}>
      {items.map((item) => (
        <div
          key={item.key}
          className={styles.row}
          data-testid={testIdPrefix ? `${testIdPrefix}-${item.key}` : undefined}
        >
          <div className={styles.meta}>
            <span className={styles.label}>{item.label}</span>
            <span className={styles.amount} dir="ltr">{formatFinanceAed(item.amount)}</span>
          </div>
          {item.count != null && countLabel ? (
            <span className={styles.count}>{countLabel(item.count)}</span>
          ) : null}
          <div className={styles.barTrack} aria-hidden="true">
            <div
              className={styles.barFill}
              style={{ width: `${Math.max(6, (item.amount / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
