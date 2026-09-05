import type { ReactNode } from "react";
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
import styles from "./form-builder.module.css";

interface FormBuilderProps<T extends FieldValues> {
  fields: FormField<T>[];
  schema: ZodType<T, T>;
  defaultValues: DefaultValues<T>;
  onSubmit: (values: T) => Promise<void> | void;
  submitLabel: string;
  submittingLabel?: string;
  className?: string;
  /** Submit button size — `md` is the Demo inline button used in dialogs. */
  submitSize?: "lg" | "md";
  /**
   * Secondary control rendered beside the submit button — the Demo modal action
   * row: a primary button that fills the row plus a ghost action (Cancel).
   * Already translated; the builder never owns copy.
   */
  secondaryAction?: ReactNode;
}

export function FormBuilder<T extends FieldValues>({
  fields,
  schema,
  defaultValues,
  onSubmit,
  submitLabel,
  submittingLabel = "...",
  className,
  submitSize = "lg",
  secondaryAction,
}: FormBuilderProps<T>) {
  const methods = useForm<T, unknown, T>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const submitButton = (
    <Button type="submit" size={submitSize} loading={methods.formState.isSubmitting}>
      {methods.formState.isSubmitting ? submittingLabel : submitLabel}
    </Button>
  );

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
        {secondaryAction ? (
          <div className={styles.actions}>
            <div className={styles.submit}>{submitButton}</div>
            {secondaryAction}
          </div>
        ) : (
          submitButton
        )}
      </form>
    </FormProvider>
  );
}
