import type { FormField } from "@/shared/components/forms/form-builder";
import type { CreateRoleValues, EditRoleValues } from "./role.schema";

/** Placeholders arrive already translated from the dialog. */
export interface RoleFieldLabels {
  name: string;
  description: string;
}

export function createRoleFields(
  labels: RoleFieldLabels,
): FormField<CreateRoleValues>[] {
  return [
    { type: "text", name: "name", placeholder: labels.name, autoComplete: "off" },
    {
      type: "text",
      name: "description",
      placeholder: labels.description,
      autoComplete: "off",
    },
  ];
}

export function editRoleFields(
  labels: RoleFieldLabels,
): FormField<EditRoleValues>[] {
  return [
    { type: "text", name: "name", placeholder: labels.name, autoComplete: "off" },
    {
      type: "text",
      name: "description",
      placeholder: labels.description,
      autoComplete: "off",
    },
  ];
}
