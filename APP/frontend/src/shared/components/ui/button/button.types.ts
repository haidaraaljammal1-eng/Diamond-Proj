import type { ButtonHTMLAttributes } from "react";

export const BUTTON_VARIANTS = ["primary", "secondary", "ghost"] as const;

export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `primary` — dark gold filled CTA. `secondary` — ivory + gold border/text. */
  variant?: ButtonVariant;
  /**
   * `lg` — the full-width form submit (login).
   * `md` — inline toolbar/dialog actions (38px).
   * `sm` — compact toolbar/card actions (36px, matches Select ghost).
   */
  size?: "lg" | "md" | "sm";
  loading?: boolean;
}
