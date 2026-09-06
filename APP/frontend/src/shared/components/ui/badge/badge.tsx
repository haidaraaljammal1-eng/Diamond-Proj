import type { ReactNode } from "react";
import styles from "./badge.module.css";

export type BadgeVariant = "neutral" | "success" | "warning" | "danger";

export interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

/** Small status/role pill shared across domains. */
export function Badge({ children, variant = "neutral", className }: BadgeProps) {
  return (
    <span
      className={[styles.badge, styles[variant], className].filter(Boolean).join(" ")}
    >
      {children}
    </span>
  );
}
