import type { ButtonProps } from "./button.types";
import styles from "./button.module.css";

export function Button({
  variant = "primary",
  size = "lg",
  loading = false,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={[
        styles.button,
        styles[variant],
        size === "md" ? styles.md : "",
        props.className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled || loading}
    >
      {loading ? "..." : children}
    </button>
  );
}
