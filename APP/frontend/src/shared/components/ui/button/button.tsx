import type { ButtonProps } from "./button.types";
import styles from "./button.module.css";

export function Button({
  variant = "primary",
  loading = false,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`${styles.button} ${styles[variant]} ${props.className ?? ""}`}
      disabled={disabled || loading}
    >
      {loading ? "..." : children}
    </button>
  );
}
