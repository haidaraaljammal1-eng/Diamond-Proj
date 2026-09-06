import type { FormField } from "@/shared/components/forms/form-builder";
import type { SelectOption } from "@/shared/components/ui/select";
import type { CreateUserValues, EditUserValues } from "./user.schema";

export interface UserFieldLabels {
  email: string;
  name: string;
  password: string;
  confirmPassword: string;
  role: string;
  rolePlaceholder: string;
}

function userIdentityFields<T extends EditUserValues>(
  labels: UserFieldLabels,
  roleOptions: readonly SelectOption[],
  includeRoleField: boolean,
): FormField<T>[] {
  const fields: FormField<T>[] = [
    {
      type: "email",
      name: "email" as FormField<T>["name"],
      placeholder: labels.email,
      autoComplete: "off",
    },
    {
      type: "text",
      name: "name" as FormField<T>["name"],
      placeholder: labels.name,
      autoComplete: "off",
    },
  ];

  if (includeRoleField) {
    fields.push({
      type: "select",
      name: "roleId" as FormField<T>["name"],
      options: roleOptions,
      placeholder: labels.rolePlaceholder,
      clearable: true,
      searchable: true,
    });
  }

  return fields;
}

export function createUserFields(
  labels: UserFieldLabels,
  roleOptions: readonly SelectOption[],
  includeRoleField: boolean,
): FormField<CreateUserValues>[] {
  const fields = userIdentityFields<CreateUserValues>(
    labels,
    roleOptions,
    false,
  );

  fields.push(
    {
      type: "password",
      name: "password",
      placeholder: labels.password,
      autoComplete: "new-password",
    },
    {
      type: "password",
      name: "confirmPassword",
      placeholder: labels.confirmPassword,
      autoComplete: "new-password",
    },
  );

  if (includeRoleField) {
    fields.push({
      type: "select",
      name: "roleId",
      options: roleOptions,
      placeholder: labels.rolePlaceholder,
      clearable: true,
      searchable: true,
    });
  }

  return fields;
}

export function editUserFields(
  labels: UserFieldLabels,
  roleOptions: readonly SelectOption[],
  includeRoleField: boolean,
): FormField<EditUserValues>[] {
  return userIdentityFields(labels, roleOptions, includeRoleField);
}
