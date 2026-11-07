"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { useRoleMutations } from "../../hooks/use-role-mutations";
import type { RoleDto } from "../../types/role.types";
import styles from "./role-delete-dialog.module.css";

export interface RoleDeleteDialogProps {
  role: RoleDto | null;
  onClose: () => void;
}

/**
 * Confirms `DELETE /roles/:id`. System roles never reach this dialog — the
 * matrix omits the delete control for `isSystem` columns.
 */
export function RoleDeleteDialog({ role, onClose }: RoleDeleteDialogProps) {
  const t = useTranslations("Roles");
  const { deleteRole, isSubmitting, error, clearError } = useRoleMutations();

  useEffect(() => {
    if (role) clearError();
  }, [role, clearError]);

  const errorMessage = error
    ? t.has(`error.${error.code}`)
      ? t(`error.${error.code}`)
      : t("error.generic")
    : null;

  async function handleConfirm() {
    if (!role) return;
    const succeeded = await deleteRole(role.id);
    if (succeeded) onClose();
  }

  return (
    <Dialog
      open={role !== null}
      onClose={onClose}
      closeLabel={t("form.close")}
      title={t("delete.title")}
      description={
        role
          ? t("delete.description", { name: role.name })
          : t("delete.descriptionGeneric")
      }
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
          loading={isSubmitting}
          onClick={() => void handleConfirm()}
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
