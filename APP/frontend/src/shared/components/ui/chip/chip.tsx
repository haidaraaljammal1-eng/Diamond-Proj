import type { ReactNode } from "react";
import styles from "./chip.module.css";

export type ChipTone = "neutral" | "ok" | "warn" | "bad" | "gold";

export interface ChipProps {
  children: ReactNode;
  /** Demo `.chip` tones — `gold` is the champagne accent chip. */
  tone?: ChipTone;
  /** The Demo diamond dot (`.chip .d`). */
  dot?: boolean;
  /**
   * Opaque tinted surface instead of the translucent one. Use whenever the
   * chip sits on imagery or a photo, where a see-through chip is unreadable.
   */
  solid?: boolean;
  className?: string;
}

/**
 * Shared status chip — the Demo `.chip` (square-cut, diamond dot, champagne
 * palette). It is the status/state marker used across contracts, fleet, ops
 * and maintenance. The rounded role pill stays `Badge`.
 */
export function Chip({
  children,
  tone = "neutral",
  dot = false,
  solid = false,
  className,
}: ChipProps) {
  return (
    <span
      className={[styles.chip, styles[tone], solid ? styles.solid : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      {dot ? <span className={styles.dot} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
