import type { FieldPath, FieldValues } from "react-hook-form";
import type { SelectOption } from "@/shared/components/ui/select";

export type FormField<T extends FieldValues> =
  | {
      type: "text" | "email";
      name: FieldPath<T>;
      placeholder?: string;
      autoComplete?: string;
      /** `1` = half row on wide containers; omitted (default) = full row. */
      colSpan?: 1 | 2;
    }
  | {
      type: "password";
      name: FieldPath<T>;
      placeholder?: string;
      autoComplete?: string;
      /** `1` = half row on wide containers; omitted (default) = full row. */
      colSpan?: 1 | 2;
    }
  | {
      type: "select";
      name: FieldPath<T>;
      /** Already-translated options; lookup hooks supply them. */
      options: readonly SelectOption[];
      placeholder?: string;
      searchable?: boolean;
      clearable?: boolean;
      disabled?: boolean;
      /** `1` = half row on wide containers; omitted (default) = full row. */
      colSpan?: 1 | 2;
    };
