/** Calendar date strings in `YYYY-MM-DD` form — never timestamps. */
export interface DateRangeValue {
  from: string;
  to: string;
}

export type DateRangePresetId =
  | "today"
  | "last7"
  | "last30"
  | "thisMonth"
  | "lastMonth"
  | "custom";

export interface DateRangeDraft {
  from?: Date;
  to?: Date;
}

export interface DateRangePickerLabels {
  fieldLabel: string;
  placeholder: string;
  apply: string;
  clear: string;
  daysSelected: (count: number) => string;
  previousMonth: string;
  nextMonth: string;
  presets: Record<DateRangePresetId, string>;
}

export interface DateRangePickerProps {
  value: DateRangeValue;
  locale: string;
  labels: DateRangePickerLabels;
  onApply: (range: DateRangeValue) => void;
  onClear: () => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}
