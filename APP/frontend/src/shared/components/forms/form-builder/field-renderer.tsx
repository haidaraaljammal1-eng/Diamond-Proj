import type { FieldValues } from "react-hook-form";
import { PasswordField } from "../fields/password-field";
import { SelectField } from "../fields/select-field";
import { TextField } from "../fields/text-field";
import type { FormField } from "./form-builder.types";

export function FieldRenderer<T extends FieldValues>({
  field,
}: {
  field: FormField<T>;
}) {
  if (field.type === "password")
    return (
      <PasswordField
        name={field.name}
        placeholder={field.placeholder}
        autoComplete={field.autoComplete}
      />
    );

  if (field.type === "select")
    return (
      <SelectField
        name={field.name}
        options={field.options}
        placeholder={field.placeholder}
        searchable={field.searchable}
        clearable={field.clearable}
        disabled={field.disabled}
      />
    );

  return (
    <TextField
      name={field.name}
      type={field.type}
      placeholder={field.placeholder}
      autoComplete={field.autoComplete}
    />
  );
}
