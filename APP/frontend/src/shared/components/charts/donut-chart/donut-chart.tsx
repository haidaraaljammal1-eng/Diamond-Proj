"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Sector } from "recharts";
import { CHART_SEQUENTIAL } from "../chart-theme";
import styles from "./donut-chart.module.css";

export interface DonutSlice {
  /** Already-translated slice label. */
  label: string;
  value: number;
  /** 0–100, precomputed by the caller so the chart stays presentation-only. */
  share: number;
}

export interface DonutChartProps {
  slices: DonutSlice[];
  /** Big number in the ring. */
  centerValue: string;
  /** Small line under it. */
  centerLabel: string;
  /** Formats each legend value. */
  format: (value: number) => string;
  size?: number;
  /** Highlighted slice. `null` is the default (no hover). */
  activeIndex?: number | null;
  /** Hover, tap, and keyboard focus. Omit to keep the chart static. */
  onActiveChange?: (index: number | null) => void;
}

function pointerCanHover(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches;
}

/**
 * Parts of a whole on a single-hue gold ramp (light → dark), with the total in
 * the ring and a labelled legend — every slice carries its value and share, so
 * identity never rests on color alone.
 */
export function DonutChart({
  slices,
  centerValue,
  centerLabel,
  format,
  size = 168,
  activeIndex = null,
  onActiveChange,
}: DonutChartProps) {
  const interactive = Boolean(onActiveChange);

  const setActive = (index: number | null) => {
    onActiveChange?.(index);
  };

  return (
    <div
      className={styles.wrap}
      onMouseLeave={() => {
        if (interactive && pointerCanHover()) setActive(null);
      }}
    >
      <div className={styles.plot} style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="66%"
              outerRadius="100%"
              paddingAngle={2}
              stroke="#ffffff"
              strokeWidth={2}
              isAnimationActive={false}
              {...(activeIndex != null ? { activeIndex } : {})}
              activeShape={(props: { outerRadius?: number }) => (
                <Sector {...props} outerRadius={(props.outerRadius ?? 0) + 4} />
              )}
              onMouseEnter={(_, index) => {
                if (interactive) setActive(index);
              }}
              onClick={(_, index) => {
                if (interactive) setActive(index);
              }}
            >
              {slices.map((slice, index) => (
                <Cell
                  key={slice.label}
                  fill={CHART_SEQUENTIAL[index % CHART_SEQUENTIAL.length]}
                  opacity={
                    activeIndex == null || activeIndex === index ? 1 : 0.42
                  }
                  style={interactive ? { cursor: "pointer", outline: "none" } : undefined}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className={styles.center}>
          <b className={styles.centerValue} dir="ltr">
            {centerValue}
          </b>
          <span className={styles.centerLabel}>{centerLabel}</span>
        </div>
      </div>

      <ul className={styles.legend}>
        {slices.map((slice, index) => {
          const swatch = (
            <span
              className={styles.swatch}
              style={{
                background: CHART_SEQUENTIAL[index % CHART_SEQUENTIAL.length],
              }}
              aria-hidden="true"
            />
          );
          const body = (
            <>
              {swatch}
              <span className={styles.legendLabel}>{slice.label}</span>
              <span className={styles.legendValue} dir="ltr">
                {format(slice.value)}
              </span>
              <span className={styles.legendShare} dir="ltr">
                {slice.share}%
              </span>
            </>
          );

          if (!interactive) {
            return (
              <li key={slice.label} className={styles.legendRow}>
                {body}
              </li>
            );
          }

          return (
            <li key={slice.label}>
              <button
                type="button"
                className={[
                  styles.legendRow,
                  styles.legendButton,
                  activeIndex === index ? styles.legendRowActive : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-pressed={activeIndex === index}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onClick={() => setActive(index)}
              >
                {body}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
