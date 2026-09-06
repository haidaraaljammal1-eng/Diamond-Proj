"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Avatar, getDisplayName } from "@/shared/components/ui/avatar";
import { Badge } from "@/shared/components/ui/badge";
import { Switch } from "@/shared/components/ui/switch";
import type { UserDto } from "../../types/user.types";
import { isUserStatusToggleable } from "../../utils/user-status";
import { UserStatusBadge } from "../user-status/user-status";
import styles from "./user-card.module.css";

export interface UserCardProps {
  user: UserDto;
  canUpdate: boolean;
  canDelete: boolean;
  isStatusUpdating: boolean;
  isDeleting: boolean;
  onToggleStatus?: (user: UserDto, nextActive: boolean) => void;
  onEdit?: (user: UserDto) => void;
  onDelete?: (user: UserDto) => void;
}

export function UserCard({
  user,
  canUpdate,
  canDelete,
  isStatusUpdating,
  isDeleting,
  onToggleStatus,
  onEdit,
  onDelete,
}: UserCardProps) {
  const t = useTranslations("Users");
  const format = useFormatter();
  const displayName = getDisplayName(user.name, user.email);
  const toggleable = isUserStatusToggleable(user.status);
  const showSwitch = canUpdate && toggleable && onToggleStatus;
  const showActions = (canUpdate && onEdit) || (canDelete && onDelete);

  const lastActivity =
    user.lastSeenAt
      ? format.dateTime(new Date(user.lastSeenAt), {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : t("lastActivityNever");

  return (
    <Card interactive data-testid="user-card">
      <div className={styles.top}>
        <Avatar name={displayName} />
        <div className={styles.identity}>
          <h4 className={styles.name}>{displayName}</h4>
          <p className={styles.subtitle} dir="ltr">{user.email}</p>
        </div>
        {showSwitch ? (
          <Switch
            className={styles.statusSwitch}
            checked={user.status === "ACTIVE"}
            disabled={isStatusUpdating || isDeleting}
            label={t("statusToggleLabel", { name: displayName })}
            onChange={(next) => onToggleStatus(user, next)}
          />
        ) : (
          <UserStatusBadge status={user.status} />
        )}
      </div>

      {user.roles.length > 0 ? (
        <div className={styles.roles}>
          {user.roles.map((role) => (
            <Badge key={role.id}>{role.name}</Badge>
          ))}
        </div>
      ) : null}

      <p className={styles.meta}>
        <span className={styles.metaLabel}>{t("lastActivity")}: </span>
        {lastActivity}
      </p>

      {showActions ? (
        <div className={styles.actions}>
          {canUpdate && onEdit ? (
            <Button
              type="button"
              variant="ghost"
              size="md"
              className={styles.actionButton}
              disabled={isDeleting || isStatusUpdating}
              onClick={() => onEdit(user)}
            >
              {t("actions.edit")}
            </Button>
          ) : null}
          {canDelete && onDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="md"
              className={`${styles.actionButton} ${styles.deleteButton}`}
              disabled={isDeleting || isStatusUpdating}
              loading={isDeleting}
              onClick={() => onDelete(user)}
            >
              {t("actions.delete")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
