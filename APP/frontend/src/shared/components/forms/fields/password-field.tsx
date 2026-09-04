import type { FieldPath, FieldValues } from "react-hook-form";
import { TextField } from "./text-field";

export function PasswordField<T extends FieldValues>(props: {
  name: FieldPath<T>;
  placeholder?: string;
  autoComplete?: string;
}) {
  return <TextField {...props} type="password" />;
}
