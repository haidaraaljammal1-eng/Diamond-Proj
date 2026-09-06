"use client";

import {
  Controller,
  useFormContext,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { PasswordInput } from "@/shared/components/ui/password-input";
import { FormError } from "@/shared/components/ui/form-error/form-error";

export function PasswordField<T extends FieldValues>(props: {
  name: FieldPath<T>;
  placeholder?: string;
  autoComplete?: string;
}) {
  const { control } = useFormContext<T>();
  const errorId = `${String(props.name)}-error`;

  return (
    <Controller
      name={props.name}
      control={control}
      render={({ field, fieldState }) => (
        <div>
          <PasswordInput
            {...field}
            id={String(props.name)}
            placeholder={props.placeholder}
            autoComplete={props.autoComplete}
            aria-invalid={fieldState.invalid}
            aria-describedby={fieldState.error ? errorId : undefined}
          />
          <FormError id={errorId} message={fieldState.error?.message} />
        </div>
      )}
    />
  );
}
