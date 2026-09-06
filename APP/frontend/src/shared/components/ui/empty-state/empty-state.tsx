import type { ReactNode } from "react";
import styles from "./empty-state.module.css";

export type EmptyStateVariant = "dashed" | "inline";

export interface EmptyStateProps {
  /** Already-translated headline (Demo champagne line). */
  title: string;
  /** Already-translated supporting line. */
  description?: string;
  /** Optional call to action rendered under the text. */
  action?: ReactNode;
  /**
   * `dashed` — the standalone Demo `.ops-empty` block.
   * `inline` — the softer champagne panel used inside a card list.
   */
  variant?: EmptyStateVariant;
}

/** Shared "nothing here yet" block — Demo `.ops-empty`. */
export function EmptyState({
  title,
  description,
  action,
  variant = "dashed",
}: EmptyStateProps) {
  return (
    <div className={[styles.empty, styles[variant]].join(" ")} role="status">
      <p className={styles.title}>{title}</p>
      {description ? <p className={styles.description}>{description}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
