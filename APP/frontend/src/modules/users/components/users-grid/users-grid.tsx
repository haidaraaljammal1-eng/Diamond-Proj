import type { UserDto } from "../../types/user.types";
import { UserCard } from "../user-card/user-card";
import styles from "./users-grid.module.css";

export interface UsersGridProps {
  users: UserDto[];
  canUpdate: boolean;
  canDelete: boolean;
  isStatusUpdating: (id: number) => boolean;
  isDeletingUser: (id: number) => boolean;
  onToggleStatus?: (user: UserDto, nextActive: boolean) => void;
  onEdit?: (user: UserDto) => void;
  onDelete?: (user: UserDto) => void;
}

export function UsersGrid({
  users,
  canUpdate,
  canDelete,
  isStatusUpdating,
  isDeletingUser,
  onToggleStatus,
  onEdit,
  onDelete,
}: UsersGridProps) {
  return (
    <div className={styles.grid} data-testid="users-grid">
      {users.map((user) => (
        <UserCard
          key={user.id}
          user={user}
          canUpdate={canUpdate}
          canDelete={canDelete}
          isStatusUpdating={isStatusUpdating(user.id)}
          isDeleting={isDeletingUser(user.id)}
          onToggleStatus={onToggleStatus}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
