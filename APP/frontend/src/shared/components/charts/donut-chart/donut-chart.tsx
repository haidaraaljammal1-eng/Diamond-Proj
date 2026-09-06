"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
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
}: DonutChartProps) {
  return (
    <div className={styles.wrap}>
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
            >
              {slices.map((slice, index) => (
                <Cell
                  key={slice.label}
                  fill={CHART_SEQUENTIAL[index % CHART_SEQUENTIAL.length]}
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
        {slices.map((slice, index) => (
          <li key={slice.label} className={styles.legendRow}>
            <span
              className={styles.swatch}
              style={{
                background: CHART_SEQUENTIAL[index % CHART_SEQUENTIAL.length],
              }}
              aria-hidden="true"
            />
            <span className={styles.legendLabel}>{slice.label}</span>
            <span className={styles.legendValue} dir="ltr">
              {format(slice.value)}
            </span>
            <span className={styles.legendShare} dir="ltr">
              {slice.share}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
