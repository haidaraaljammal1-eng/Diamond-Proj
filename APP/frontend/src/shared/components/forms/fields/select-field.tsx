"use client";

import {
  Controller,
  useFormContext,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { Select } from "@/shared/components/ui/select";
import type { SelectOption } from "@/shared/components/ui/select";
import { FormError } from "@/shared/components/ui/form-error/form-error";

interface SelectFieldProps<T extends FieldValues> {
  name: FieldPath<T>;
  /** Already-translated options — lookup hooks translate before passing them. */
  options: readonly SelectOption[];
  placeholder?: string;
  searchable?: boolean;
  clearable?: boolean;
  disabled?: boolean;
}

/**
 * SelectField — the Diamond Select bound to React Hook Form.
 *
 * Mirrors TextField: the Controller owns the value, and validation messages
 * flow through the shared FormError (which translates `validation.*` keys).
 */
export function SelectField<T extends FieldValues>({
  name,
  options,
  placeholder,
  searchable = false,
  clearable = false,
  disabled = false,
}: SelectFieldProps<T>) {
  const { control } = useFormContext<T>();
  const errorId = `${String(name)}-error`;

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <div>
          <Select
            id={String(name)}
            options={options}
            value={(field.value as string | null) ?? null}
            onChange={field.onChange}
            onBlur={field.onBlur}
            placeholder={placeholder}
            searchable={searchable}
            clearable={clearable}
            disabled={disabled}
            invalid={fieldState.invalid}
            aria-describedby={fieldState.error ? errorId : undefined}
          />
          <FormError id={errorId} message={fieldState.error?.message} />
        </div>
      )}
    />
  );
}
