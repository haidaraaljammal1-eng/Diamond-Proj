/**
 * Diamond chart tokens.
 *
 * The two categorical series colors are validated (light surface #FFFFFF):
 * lightness band, chroma floor, CVD separation (ΔE 14.9 deutan / 16.6 tritan),
 * normal-vision separation (ΔE 18.1) and ≥3:1 contrast all pass. Do not swap
 * them for the softer UI gold (#C9A15C) — it fails the chroma and contrast
 * checks as a data mark. Identity is never color-alone: every chart ships a
 * legend and direct value labels.
 */
export const CHART_COLORS = {
  /** Series 1 — money in. */
  revenue: "#b98a3e",
  /** Series 2 — money out. */
  expense: "#a8433c",
  /** Neutral overlay line (a different mark, not a third hue). */
  net: "#3a2e1b",
  grid: "rgba(133, 100, 45, 0.16)",
  axis: "#9a8f78",
  surface: "#ffffff",
} as const;

/** Sequential gold ramp, light → dark, for parts-of-a-whole (donut) slices. */
export const CHART_SEQUENTIAL = [
  "#6f5126",
  "#8a6630",
  "#a77834",
  "#b98a3e",
  "#d8b678",
  "#ebd4a6",
] as const;

export const CHART_FONT = {
  family: "var(--diamond-font-body)",
  size: 11,
} as const;
