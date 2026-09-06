import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

/** Demo contract row glyph (`.lrow .ic` — a plain document, no rule lines). */
export function ContractFileIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path d="M7 3h8l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

/** Demo Quick Access title bolt. */
export function QuickAccessIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path d="M13 2L4 12l5 2 6-6 3 3-9 9" />
      <path d="M13 2l5 2-3 3" />
    </svg>
  );
}
