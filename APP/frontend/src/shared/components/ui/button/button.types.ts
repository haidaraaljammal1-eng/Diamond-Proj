import type { ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost";
  /**
   * `lg` — the full-width form submit (login).
   * `md` — the Demo inline button (`.btn`, 38px), used in toolbars and dialogs.
   * `sm` — the Demo `.btn.sm` (31px), used inside cards and list rows.
   */
  size?: "lg" | "md" | "sm";
  loading?: boolean;
}
