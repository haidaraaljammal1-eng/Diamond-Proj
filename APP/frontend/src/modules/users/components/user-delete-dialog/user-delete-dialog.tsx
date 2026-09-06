"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { getDisplayName } from "@/shared/components/ui/avatar";
import { useUserMutations } from "../../hooks/use-user-mutations";
import type { UserDto } from "../../types/user.types";
import { resolveUsersErrorMessage } from "../../utils/resolve-users-error";
import styles from "./user-delete-dialog.module.css";

export interface UserDeleteDialogProps {
  user: UserDto | null;
  onClose: () => void;
}

export function UserDeleteDialog({ user, onClose }: UserDeleteDialogProps) {
  const t = useTranslations("Users");
  const { removeUser, isDeleting, deleteError, clearDeleteError } =
    useUserMutations();

  useEffect(() => {
    if (user) clearDeleteError();
  }, [user, clearDeleteError]);

  const displayName = user ? getDisplayName(user.name, user.email) : "";

  const errorMessage = resolveUsersErrorMessage(t, deleteError, "delete");

  const handleDelete = async () => {
    if (!user) return;
    const succeeded = await removeUser(user.id);
    if (succeeded) onClose();
  };

  return (
    <Dialog
      open={user !== null}
      onClose={onClose}
      closeLabel={t("form.close")}
      title={t("delete.title")}
      description={t("delete.description", { name: displayName })}
    >
      {errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className={styles.buttons}>
        <Button
          type="button"
          variant="ghost"
          size="md"
          className={styles.confirmDelete}
          loading={isDeleting}
          onClick={() => void handleDelete()}
        >
          {t("delete.confirm")}
        </Button>
        <Button type="button" variant="ghost" size="md" onClick={onClose}>
          {t("form.cancel")}
        </Button>
      </div>
    </Dialog>
  );
}
