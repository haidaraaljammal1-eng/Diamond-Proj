import type { FieldPath, FieldValues } from "react-hook-form";

export type FormField<T extends FieldValues> =
  | {
      type: "text" | "email";
      name: FieldPath<T>;
      placeholder?: string;
      autoComplete?: string;
      colSpan?: number;
    }
  | {
      type: "password";
      name: FieldPath<T>;
      placeholder?: string;
      autoComplete?: string;
      colSpan?: number;
    };
