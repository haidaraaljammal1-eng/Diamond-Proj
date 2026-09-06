"use client";

import { Icon as IconifyIcon } from "@iconify/react";
import styles from "./icon.module.css";

export interface IconProps {
  /** Iconify icon name, e.g. `mdi:map-marker`. */
  name: string;
  /** Square size in px (defaults to the 16px inline UI glyph). */
  size?: number;
  /** Accessible label. Omit for decorative icons — they are hidden instead. */
  label?: string;
  className?: string;
}

/**
 * Shared icon — the single entry point for UI glyphs (Iconify).
 *
 * Feature code never inlines its own SVG and never puts emoji in a translation
 * string: sizing, color (`currentColor`) and accessibility live here. The Demo
 * rail artwork in `modules/navigation/navigation.icons.tsx` is the deliberate
 * exception — it is traced Demo-parity artwork, not a generic UI icon.
 */
export function Icon({ name, size = 16, label, className }: IconProps) {
  return (
    <IconifyIcon
      icon={name}
      width={size}
      height={size}
      className={[styles.icon, className].filter(Boolean).join(" ")}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}
