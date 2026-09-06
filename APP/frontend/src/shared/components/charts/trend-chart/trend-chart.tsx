"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS, CHART_FONT } from "../chart-theme";
import styles from "./trend-chart.module.css";

export interface TrendPoint {
  /** Already-translated category label (a day, a month…). */
  label: string;
  revenue: number;
  expense: number;
  net: number;
}

export interface TrendChartSeriesLabels {
  revenue: string;
  expense: string;
  net: string;
}

export interface TrendChartProps {
  data: TrendPoint[];
  labels: TrendChartSeriesLabels;
  /** Formats every value (axis ticks use the compact form). */
  format: (value: number) => string;
  formatCompact: (value: number) => string;
  height?: number;
}

interface TooltipEntry {
  name?: string | number;
  value?: unknown;
  color?: string;
}

/**
 * Two money series as bars plus the resulting net as a neutral line — one
 * shared value axis (never a second scale). Presentation only: callers pass
 * translated labels and their own number formatting.
 */
export function TrendChart({
  data,
  labels,
  format,
  formatCompact,
  height = 240,
}: TrendChartProps) {
  const renderTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: readonly TooltipEntry[];
    label?: string | number;
  }) => {
    if (!active || !payload?.length) return null;

    return (
      <div className={styles.tooltip}>
        <p className={styles.tooltipTitle}>{label}</p>
        {payload.map((entry) => (
          <p key={String(entry.name)} className={styles.tooltipRow}>
            <span
              className={styles.tooltipDot}
              style={{ background: entry.color }}
              aria-hidden="true"
            />
            <span className={styles.tooltipLabel}>{entry.name}</span>
            <span className={styles.tooltipValue} dir="ltr">
              {format(Number(entry.value ?? 0))}
            </span>
          </p>
        ))}
      </div>
    );
  };

  return (
    <>
      <ul className={styles.legend}>
        <li>
          <span
            className={styles.swatch}
            style={{ background: CHART_COLORS.revenue }}
            aria-hidden="true"
          />
          {labels.revenue}
        </li>
        <li>
          <span
            className={styles.swatch}
            style={{ background: CHART_COLORS.expense }}
            aria-hidden="true"
          />
          {labels.expense}
        </li>
        <li>
          <span
            className={styles.swatchLine}
            style={{ background: CHART_COLORS.net }}
            aria-hidden="true"
          />
          {labels.net}
        </li>
      </ul>

      <div className={styles.plot} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            barGap={2}
          >
            <CartesianGrid
              stroke={CHART_COLORS.grid}
              strokeDasharray="3 4"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: CHART_COLORS.axis, fontSize: CHART_FONT.size }}
              tickMargin={10}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={48}
              tick={{ fill: CHART_COLORS.axis, fontSize: CHART_FONT.size }}
              tickFormatter={formatCompact}
            />
            <Tooltip
              cursor={{ fill: "rgba(201, 161, 92, 0.08)" }}
              content={renderTooltip}
            />
            <Bar
              dataKey="revenue"
              name={labels.revenue}
              fill={CHART_COLORS.revenue}
              radius={[4, 4, 0, 0]}
              maxBarSize={26}
            />
            <Bar
              dataKey="expense"
              name={labels.expense}
              fill={CHART_COLORS.expense}
              radius={[4, 4, 0, 0]}
              maxBarSize={26}
            />
            <Line
              type="monotone"
              dataKey="net"
              name={labels.net}
              stroke={CHART_COLORS.net}
              strokeWidth={2}
              dot={{ r: 3, fill: CHART_COLORS.net, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
