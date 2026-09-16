import { Chip } from "@/shared/components/ui/chip";
import type { ChipTone } from "@/shared/components/ui/chip";
import styles from "./integration-status-row.module.css";

export interface IntegrationStatusRowProps {
  /** Localized operation name. */
  label: string;
  /** Localized status text. */
  status: string;
  tone?: ChipTone;
  /**
   * A restrained pulse for an in-progress synchronization. Never a spinner —
   * this row sits inside dense operational surfaces.
   */
  syncing?: boolean;
  /** Inline variant for workflow chrome: smaller label, no row separator. */
  compact?: boolean;
  className?: string;
}

/**
 * One read-only external-integration line: operation name + state.
 *
 * Display only by design — it renders no action, so it can be dropped next to
 * an existing workflow control without changing that workflow.
 */
export function IntegrationStatusRow({
  label,
  status,
  tone = "neutral",
  syncing = false,
  compact = false,
  className,
}: IntegrationStatusRowProps) {
  return (
    <div
      className={[styles.row, compact ? styles.compact : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={styles.label}>{label}</span>
      <Chip tone={tone} dot className={syncing ? styles.syncing : undefined}>
        {status}
      </Chip>
    </div>
  );
}
