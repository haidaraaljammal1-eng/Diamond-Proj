import {
  Controller,
  useFormContext,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { Input } from "@/shared/components/ui/input/input";
import { FormError } from "@/shared/components/ui/form-error/form-error";

interface TextFieldProps<T extends FieldValues> {
  name: FieldPath<T>;
  type?: "text" | "email" | "number" | "password";
  placeholder?: string;
  autoComplete?: string;
  appearance?: "default" | "login";
}

export function TextField<T extends FieldValues>({
  name,
  type = "text",
  placeholder,
  autoComplete,
}: TextFieldProps<T>) {
  const { control } = useFormContext<T>();
  const errorId = `${String(name)}-error`;
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <div>
          <Input
            {...field}
            id={String(name)}
            type={type}
            placeholder={placeholder}
            autoComplete={autoComplete}
            aria-invalid={fieldState.invalid}
            aria-describedby={fieldState.error ? errorId : undefined}
          />
          <FormError id={errorId} message={fieldState.error?.message} />
        </div>
      )}
    />
  );
}
