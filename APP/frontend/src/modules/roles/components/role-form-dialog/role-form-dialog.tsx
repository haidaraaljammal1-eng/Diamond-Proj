"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { FormBuilder } from "@/shared/components/forms/form-builder";
import { useRoleMutations } from "../../hooks/use-role-mutations";
import { useRolesPermissions } from "../../hooks/use-roles-permissions";
import { buildRoleKey } from "../../utils/role-key";
import { createRoleFields, editRoleFields } from "../../forms/role.fields";
import {
  createRoleSchema,
  editRoleSchema,
  type CreateRoleValues,
  type EditRoleValues,
} from "../../forms/role.schema";
import type { RoleDto } from "../../types/role.types";
import styles from "./role-form-dialog.module.css";

export type RoleFormTarget = { mode: "create" } | { mode: "edit"; role: RoleDto };

export interface RoleFormDialogProps {
  /** `null` closes the dialog. */
  target: RoleFormTarget | null;
  onClose: () => void;
}

/**
 * Create / edit a role inside the shared Diamond dialog, through the shared
 * FormBuilder. The dialog owns no HTTP call: it submits through the domain
 * mutation hook, and the Backend remains the authority on both permission and
 * validation.
 */
export function RoleFormDialog({ target, onClose }: RoleFormDialogProps) {
  const t = useTranslations("Roles");
  const { createRole, updateRole, isSubmitting, error, clearError } =
    useRoleMutations();
  // Existing keys come from the loaded roles so a derived key stays unique.
  const { matrix } = useRolesPermissions();

  // A new dialog starts without the previous attempt's error.
  useEffect(() => {
    if (target) clearError();
  }, [target, clearError]);

  const fieldLabels = {
    name: t("form.namePlaceholder"),
    description: t("form.descriptionPlaceholder"),
  };

  const cancelAction = (
    <Button type="button" variant="ghost" size="md" onClick={onClose}>
      {t("form.cancel")}
    </Button>
  );

  const errorMessage = (() => {
    if (!error) return null;
    const codeKey = `error.${error.code}`;
    return t.has(codeKey) ? t(codeKey) : t("error.generic");
  })();

  const handleCreate = async (values: CreateRoleValues) => {
    const succeeded = await createRole({
      // The Backend key is derived from the name, never typed by the user.
      key: buildRoleKey(
        values.name,
        matrix.roles.map((role) => role.key),
      ),
      name: values.name,
      description: values.description || undefined,
    });
    if (succeeded) onClose();
  };

  const handleEdit = async (roleId: number, values: EditRoleValues) => {
    const succeeded = await updateRole(roleId, {
      name: values.name,
      description: values.description || null,
    });
    if (succeeded) onClose();
  };

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
        <FormBuilder<EditRoleValues>
          key={`edit-${target.role.id}`}
          className={styles.form}
          fields={editRoleFields(fieldLabels)}
          schema={editRoleSchema}
          defaultValues={{
            name: target.role.name,
            description: target.role.description ?? "",
          }}
          onSubmit={(values) => handleEdit(target.role.id, values)}
          submitLabel={t("form.save")}
          submittingLabel={t("form.saving")}
          submitSize="md"
          secondaryAction={cancelAction}
        />
      ) : (
        <FormBuilder<CreateRoleValues>
          key="create"
          className={styles.form}
          fields={createRoleFields(fieldLabels)}
          schema={createRoleSchema}
          defaultValues={{ name: "", description: "" }}
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
