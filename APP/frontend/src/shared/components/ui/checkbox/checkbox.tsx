import type { InputHTMLAttributes } from "react";
import styles from "./checkbox.module.css";

export type CheckboxProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "size"
>;

/**
 * Shared Diamond checkbox (Demo `.consent input`): a native control tinted with
 * the brand gold. It owns no state and no labelling — callers pass `checked`,
 * `onChange` and an accessible name.
 */
export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <input
      {...props}
      type="checkbox"
      className={`${styles.checkbox} ${className ?? ""}`}
    />
  );
}
