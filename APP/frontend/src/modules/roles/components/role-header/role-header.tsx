import type { RoleDto } from "../../types/role.types";
import styles from "./role-header.module.css";

export interface RoleHeaderProps {
  role: RoleDto;
  /** How many catalog permissions the role holds (derived, not invented). */
  permissionCount: number;
  /** Already-translated badge text for a Backend `isSystem` role. */
  systemLabel: string;
  /** Already-translated permission count text. */
  countLabel: string;
  /** Opens the edit dialog. Absent when the session cannot manage roles. */
  onEdit?: () => void;
  /** Already-translated accessible name of the edit control. */
  editLabel?: string;
}

/**
 * One role column header. Everything shown comes from the Backend role
 * (`name`, `key`, `isSystem`) or is derived from its permission list — no
 * description or capability is invented on the frontend.
 */
export function RoleHeader({
  role,
  permissionCount,
  systemLabel,
  countLabel,
  onEdit,
  editLabel,
}: RoleHeaderProps) {
  return (
    <th scope="col" className={styles.head} title={role.description ?? undefined}>
      <span className={styles.name}>{role.name}</span>
      <span className={styles.key}>{role.key}</span>
      <span className={styles.meta}>
        {role.isSystem ? <span className={styles.badge}>{systemLabel}</span> : null}
        <span className={styles.count} aria-label={countLabel}>
          {permissionCount}
        </span>
        {onEdit ? (
          <button
            type="button"
            className={styles.edit}
            onClick={onEdit}
            aria-label={editLabel}
            title={editLabel}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
              <path d="M14.5 7.5l2 2" />
            </svg>
          </button>
        ) : null}
      </span>
    </th>
  );
}
