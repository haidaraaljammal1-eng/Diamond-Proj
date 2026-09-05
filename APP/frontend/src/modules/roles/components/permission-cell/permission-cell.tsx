"use client";

import { Checkbox } from "@/shared/components/ui/checkbox";
import styles from "./permission-cell.module.css";

export interface PermissionCellProps {
  /** Whether the role in this column holds the permission in this row. */
  allowed: boolean;
  /** Already-translated accessible name ("View vehicles — Branch manager"). */
  label: string;
  /**
   * Grants or revokes the permission. Absent when the session may not manage
   * roles — the cell then shows the state as a disabled control.
   */
  onToggle?: (next: boolean) => void;
  /** The Backend forbids the change (a system role) or a write is in flight. */
  disabled?: boolean;
  /** This cell's write is in flight. */
  pending?: boolean;
}

/**
 * One matrix cell: the grant itself, as a checkbox. Toggling saves immediately
 * through the caller — there is no separate save step and no local draft state.
 */
export function PermissionCell({
  allowed,
  label,
  onToggle,
  disabled = false,
  pending = false,
}: PermissionCellProps) {
  return (
    <td className={`${styles.cell} ${pending ? styles.pending : ""}`}>
      <Checkbox
        checked={allowed}
        // A cell with no handler still shows the Backend state, read-only.
        disabled={disabled || pending || !onToggle}
        onChange={(event) => onToggle?.(event.target.checked)}
        aria-label={label}
      />
    </td>
  );
}
