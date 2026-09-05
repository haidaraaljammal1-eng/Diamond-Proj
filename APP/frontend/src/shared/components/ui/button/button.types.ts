import type { ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost";
  /**
   * `lg` — the full-width form submit (login).
   * `md` — the Demo inline button (`.btn`, 38px), used in toolbars and dialogs.
   */
  size?: "lg" | "md";
  loading?: boolean;
}
