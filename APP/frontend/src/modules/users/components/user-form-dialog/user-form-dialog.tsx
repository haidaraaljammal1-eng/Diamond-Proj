"use client";

import { useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { FormBuilder } from "@/shared/components/forms/form-builder";
import { useUserMutations } from "../../hooks/use-user-mutations";
import { useRoleLookup } from "../../hooks/use-role-lookup";
import { createUserFields, editUserFields } from "../../forms/user.fields";
import {
  createUserSchema,
  editUserSchema,
  type CreateUserValues,
  type EditUserValues,
} from "../../forms/user.schema";
import type { UserDto } from "../../types/user.types";
import { resolveUsersErrorMessage } from "../../utils/resolve-users-error";
import styles from "./user-form-dialog.module.css";

export type UserFormTarget = { mode: "create" } | { mode: "edit"; user: UserDto };

export interface UserFormDialogProps {
  target: UserFormTarget | null;
  onClose: () => void;
}

function toRoleIds(roleId?: string): number[] {
  return roleId ? [Number(roleId)] : [];
}

function toNameValue(name: string): string | null | undefined {
  const trimmed = name.trim();
  if (!trimmed) return null;
  return trimmed;
}

/**
 * Create / edit a user through the shared Dialog + FormBuilder.
 */
export function UserFormDialog({ target, onClose }: UserFormDialogProps) {
  const t = useTranslations("Users");
  const {
    addUser,
    editUser,
    isCreating,
    isUpdating,
    createError,
    updateError,
    clearCreateError,
    clearUpdateError,
  } = useUserMutations();
  const { roles, isAllowed: canPickRoles } = useRoleLookup(target !== null);

  useEffect(() => {
    if (target) {
      clearCreateError();
      clearUpdateError();
    }
  }, [target, clearCreateError, clearUpdateError]);

  const roleOptions = useMemo(
    () => roles.map((role) => ({ value: String(role.id), label: role.name })),
    [roles],
  );

  const fieldLabels = {
    email: t("form.emailPlaceholder"),
    name: t("form.namePlaceholder"),
    password: t("form.passwordPlaceholder"),
    confirmPassword: t("form.confirmPasswordPlaceholder"),
    role: t("form.roleLabel"),
    rolePlaceholder: t("form.rolePlaceholder"),
  };

  const cancelAction = (
    <Button type="button" variant="ghost" size="md" onClick={onClose}>
      {t("form.cancel")}
    </Button>
  );

  const writeError = target?.mode === "edit" ? updateError : createError;
  const errorMessage = resolveUsersErrorMessage(t, writeError);

  const handleCreate = async (values: CreateUserValues) => {
    const succeeded = await addUser({
      email: values.email,
      name: toNameValue(values.name) || undefined,
      roleIds: toRoleIds(values.roleId),
      password: values.password,
      confirmPassword: values.confirmPassword,
    });
    if (succeeded) onClose();
  };

  const handleEdit = async (userId: number, values: EditUserValues) => {
    const succeeded = await editUser(userId, {
      email: values.email,
      name: toNameValue(values.name),
      roleIds: canPickRoles ? toRoleIds(values.roleId) : undefined,
    });
    if (succeeded) onClose();
  };

  const isSubmitting = target?.mode === "edit" ? isUpdating : isCreating;

  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      closeLabel={t("form.close")}
      title={
        target?.mode === "edit" ? t("form.editTitle") : t("form.createTitle")
      }
      description={
        target?.mode === "edit"
          ? t("form.editDescription")
          : t("form.createDescription")
      }
    >
      {errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}

      {target?.mode === "edit" ? (
        <FormBuilder<EditUserValues>
          key={`edit-${target.user.id}`}
          className={styles.form}
          fields={editUserFields(fieldLabels, roleOptions, canPickRoles)}
          schema={editUserSchema}
          defaultValues={{
            email: target.user.email,
            name: target.user.name ?? "",
            roleId: target.user.roles[0] ? String(target.user.roles[0].id) : "",
          }}
          onSubmit={(values) => handleEdit(target.user.id, values)}
          submitLabel={t("form.save")}
          submittingLabel={t("form.saving")}
          submitSize="md"
          secondaryAction={cancelAction}
        />
      ) : (
        <FormBuilder<CreateUserValues>
          key="create"
          className={styles.form}
          fields={createUserFields(fieldLabels, roleOptions, canPickRoles)}
          schema={createUserSchema}
          defaultValues={{
            email: "",
            name: "",
            roleId: "",
            password: "",
            confirmPassword: "",
          }}
          onSubmit={handleCreate}
          submitLabel={t("form.create")}
          submittingLabel={t("form.saving")}
          submitSize="md"
          secondaryAction={cancelAction}
        />
      )}

      {isSubmitting ? (
        <p className={styles.status} role="status">
          {t("form.saving")}
        </p>
      ) : null}
    </Dialog>
  );
}
