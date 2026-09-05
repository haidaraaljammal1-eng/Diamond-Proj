import type { ReactNode } from "react";

/** One row inside the Diamond Select listbox. */
export interface SelectOption<T extends string = string> {
  value: T;
  /** Already-translated label. Components never receive raw i18n keys. */
  label: string;
  /** Optional secondary line rendered under the label. */
  hint?: string;
  /** Optional leading glyph (flag, brand mark, status dot). */
  icon?: ReactNode;
  disabled?: boolean;
}

/**
 * `field` — form control: gold hairline underline, matches the shared Input.
 * `ghost` — chrome control: champagne capsule, matches the shell topbar chips.
 */
export type SelectVariant = "field" | "ghost";

/** `sm` = 36px chrome control, `md` = 46px form control. */
export type SelectSize = "sm" | "md";

export interface SelectProps<T extends string = string> {
  options: readonly SelectOption<T>[];
  value?: T | null;
  onChange?: (value: T) => void;
  /** Fires when the trigger loses focus — wire it to React Hook Form. */
  onBlur?: () => void;
  placeholder?: string;
  variant?: SelectVariant;
  size?: SelectSize;
  /** Leading glyph on the trigger itself (globe, user, calendar…). */
  icon?: ReactNode;
  /** Filters options with an in-panel search box. Use for lookups. */
  searchable?: boolean;
  /** Adds a reset control once a value is picked. */
  clearable?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  /** Renders a hidden input so the control still posts inside a plain form. */
  name?: string;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}
