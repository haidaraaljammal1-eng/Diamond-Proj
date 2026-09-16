"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS, CHART_FONT } from "../chart-theme";
import styles from "../trend-chart/trend-chart.module.css";

export interface GroupedBarPoint {
  label: string;
  rented: number;
  returned: number;
}

export interface GroupedBarChartProps {
  data: GroupedBarPoint[];
  labels: { rented: string; returned: string };
  height?: number;
}

interface TooltipEntry {
  name?: string | number;
  value?: unknown;
  color?: string;
}

/** Two integer series as grouped bars — presentation only. */
export function GroupedBarChart({
  data,
  labels,
  height = 240,
}: GroupedBarChartProps) {
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
              {Number(entry.value ?? 0)}
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
          {labels.rented}
        </li>
        <li>
          <span
            className={styles.swatch}
            style={{ background: CHART_COLORS.expense }}
            aria-hidden="true"
          />
          {labels.returned}
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
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={32}
              tick={{ fill: CHART_COLORS.axis, fontSize: CHART_FONT.size }}
            />
            <Tooltip
              cursor={{ fill: "rgba(201, 161, 92, 0.08)" }}
              content={renderTooltip}
            />
            <Bar
              dataKey="rented"
              name={labels.rented}
              fill={CHART_COLORS.revenue}
              radius={[4, 4, 0, 0]}
              maxBarSize={26}
            />
            <Bar
              dataKey="returned"
              name={labels.returned}
              fill={CHART_COLORS.expense}
              radius={[4, 4, 0, 0]}
              maxBarSize={26}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
