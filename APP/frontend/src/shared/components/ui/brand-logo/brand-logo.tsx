import type { SVGProps } from "react";
import styles from "./brand-logo.module.css";

/**
 * Shared BrandLogo — the single Diamond crystal mark.
 *
 * Geometry intentionally matches `public/diamond-logo.svg` so page and shell
 * presentations always use the same asset, never a second logo.
 */
export function BrandLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={`${styles.mark} ${className ?? ""}`}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient
          id="diamondBrandGradient"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#d4a76a" />
          <stop offset="100%" stopColor="#e8c88e" />
        </linearGradient>
      </defs>
      <path
        d="M 50 10 L 90 50 L 50 90 L 10 50 Z"
        fill="url(#diamondBrandGradient)"
        stroke="#b8926e"
        strokeWidth="1"
      />
      <path
        d="M 50 10 L 70 50 L 50 90 M 30 50 L 50 30 L 70 50 L 50 70"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.4"
        strokeWidth="0.5"
      />
    </svg>
  );
}