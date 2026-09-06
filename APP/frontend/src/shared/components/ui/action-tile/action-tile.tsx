import type { ReactNode } from "react";
import styles from "./action-tile.module.css";

export interface ActionTileProps {
  /** Leading icon (Demo `.qa .qai`). */
  icon: ReactNode;
  /** Already-translated title (Demo `.qa b`). */
  title: string;
  /** Already-translated supporting line (Demo `.qa .qt span`). */
  meta: string;
  /** Red count pill (Demo `.qbadge`); hidden when absent or zero. */
  badge?: number;
  /** Native title attribute — used for the "coming later" placeholder note. */
  hint?: string;
  /** Renders the tile as a non-actionable placeholder. */
  disabled?: boolean;
  onClick?: () => void;
}

/**
 * Shared shortcut tile — the Demo `.qa` row used by Dashboard Quick Access and
 * every other "jump to a page" list. Presentation only: no routing, no data.
 */
export function ActionTile({
  icon,
  title,
  meta,
  badge,
  hint,
  disabled = false,
  onClick,
}: ActionTileProps) {
  return (
    <button
      type="button"
      className={styles.tile}
      aria-disabled={disabled ? "true" : undefined}
      title={hint ? `${title} — ${hint}` : undefined}
      onClick={disabled ? undefined : onClick}
    >
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.text}>
        <b className={styles.title}>{title}</b>
        <span className={styles.meta}>{meta}</span>
      </span>
      {badge ? <em className={styles.badge}>{badge}</em> : null}
      <span className={styles.chevron} aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </span>
    </button>
  );
}
