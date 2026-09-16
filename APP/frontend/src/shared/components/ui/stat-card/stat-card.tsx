import type { ReactNode } from "react";
import styles from "./stat-card.module.css";

export type StatCardTone = "neutral" | "up" | "down";

export interface StatCardProps {
  /** Already-translated metric label (Demo `.kpi .kl`). */
  label: string;
  /** Optional leading icon, rendered in Diamond gold next to the label. */
  icon?: ReactNode;
  /** The metric itself (Demo `.kpi .kv`). */
  value: ReactNode;
  /** Secondary part of the value, e.g. the `/12` in `4/12`. */
  suffix?: string;
  /** Supporting line under the value (Demo `.kpi .kt`). */
  note?: string;
  /** Colors the note — `up` is the Demo green delta line. */
  noteTone?: StatCardTone;
  /** Denser KPI for operational strips (GPS). Default remains the Dashboard tile. */
  compact?: boolean;
}

/**
 * Shared KPI tile — the Demo `.kpi` surface (art-deco brackets, champagne
 * halo, serif numeral, bottom gold thread). Every page that shows counters
 * (Dashboard, Ops Center, Finance…) composes this instead of redefining it.
 *
 * It knows nothing about APIs or domains: callers pass final, translated text.
 */
export function StatCard({
  label,
  icon,
  value,
  suffix,
  note,
  noteTone = "neutral",
  compact = false,
}: StatCardProps) {
  return (
    <article className={[styles.kpi, compact ? styles.compact : ""].filter(Boolean).join(" ")}>
      <p className={styles.label}>
        {icon ? (
          <span className={styles.icon} aria-hidden="true">
            {icon}
          </span>
        ) : null}
        {label}
      </p>
      <p className={styles.value}>
        <span className={styles.number}>{value}</span>
        {suffix ? <small className={styles.suffix}>{suffix}</small> : null}
      </p>
      {note ? (
        <p className={[styles.note, styles[noteTone]].join(" ")}>{note}</p>
      ) : null}
    </article>
  );
}
