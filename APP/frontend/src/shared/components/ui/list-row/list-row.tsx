import type { ReactNode } from "react";
import styles from "./list-row.module.css";

export interface ListRowProps {
  /** Leading icon slot (Demo `.lrow .ic`) — rendered in Diamond gold. */
  icon?: ReactNode;
  /** Primary line (Demo `.lrow .tx b`); truncates on overflow. */
  title: ReactNode;
  /** Secondary line (Demo `.lrow .tx span`). */
  meta?: ReactNode;
  /** End slot — a status chip, amount or action (Demo trailing `.chip`). */
  trailing?: ReactNode;
  /** Hover affordance. Only pass it when the row really is actionable. */
  interactive?: boolean;
  className?: string;
}

/**
 * Shared list row — the Demo `.lrow` line used by the Dashboard contracts
 * list, the Ops Center lists and the chat lists. Presentation only: it owns no
 * routing, no data and no permissions.
 */
export function ListRow({
  icon,
  title,
  meta,
  trailing,
  interactive = false,
  className,
}: ListRowProps) {
  return (
    <div
      className={[styles.row, interactive ? styles.interactive : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className={styles.text}>
        <b className={styles.title}>{title}</b>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </span>
      {trailing ? <span className={styles.trailing}>{trailing}</span> : null}
    </div>
  );
}
