import {
  FormProvider,
  useForm,
  type DefaultValues,
  type FieldValues,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ZodType } from "zod";
import { Button } from "@/shared/components/ui/button/button";
import { FieldRenderer } from "./field-renderer";
import type { FormField } from "./form-builder.types";

interface FormBuilderProps<T extends FieldValues> {
  fields: FormField<T>[];
  schema: ZodType<T, T>;
  defaultValues: DefaultValues<T>;
  onSubmit: (values: T) => Promise<void> | void;
  submitLabel: string;
  submittingLabel?: string;
  className?: string;
}

export function FormBuilder<T extends FieldValues>({
  fields,
  schema,
  defaultValues,
  onSubmit,
  submitLabel,
  submittingLabel = "...",
  className,
}: FormBuilderProps<T>) {
  const methods = useForm<T, unknown, T>({
    resolver: zodResolver(schema),
    defaultValues,
  });
  return (
    <FormProvider {...methods}>
      <form
        className={className}
        onSubmit={(event) => {
          event.preventDefault();
          void methods.handleSubmit(onSubmit)(event);
        }}
        noValidate
      >
        {fields.map((field) => (
          <FieldRenderer key={String(field.name)} field={field} />
        ))}
        <Button type="submit" loading={methods.formState.isSubmitting}>
          {methods.formState.isSubmitting ? submittingLabel : submitLabel}
        </Button>
      </form>
    </FormProvider>
  );
}
