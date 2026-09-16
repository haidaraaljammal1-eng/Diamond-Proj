/** Calendar grid helpers — pure logic for month layout and outside-day rules. */

export const DATE_RANGE_PICKER_CALENDAR_CONFIG = {
  showOutsideDays: false,
  fixedWeeks: false,
  desktopMonthCount: 2,
  weekColumnCount: 7,
  hideBuiltInNavigation: true,
} as const;

export const WEEKDAY_NAMES_EN = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type WeekdayName = (typeof WEEKDAY_NAMES_EN)[number];

export function countDaysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Leading blank cells before day 1 for a Sunday-based week row. */
export function getLeadingEmptyCellCount(
  year: number,
  monthIndex: number,
  weekStartsOn = 0,
): number {
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  return (firstWeekday - weekStartsOn + 7) % 7;
}

export function getWeekdayIndex(
  year: number,
  monthIndex: number,
  day: number,
): number {
  return new Date(year, monthIndex, day).getDay();
}

export function getWeekdayName(
  year: number,
  monthIndex: number,
  day: number,
): WeekdayName {
  return WEEKDAY_NAMES_EN[getWeekdayIndex(year, monthIndex, day)];
}

/** 1-based column index under a Sunday-start weekday header row. */
export function getGridColumnForDay(
  year: number,
  monthIndex: number,
  day: number,
  weekStartsOn = 0,
): number {
  const leading = getLeadingEmptyCellCount(year, monthIndex, weekStartsOn);
  return ((leading + day - 1) % 7) + 1;
}

export function buildMonthDayNumbers(year: number, monthIndex: number): number[] {
  const total = countDaysInMonth(year, monthIndex);
  return Array.from({ length: total }, (_, index) => index + 1);
}

export function isDateInMonth(
  year: number,
  monthIndex: number,
  day: number,
): boolean {
  return day >= 1 && day <= countDaysInMonth(year, monthIndex);
}

/** Outside-day numbers are hidden; DayPicker keeps structural cells via the hidden modifier. */
export function shouldHideOutsideDays(showOutsideDays: boolean): boolean {
  return !showOutsideDays;
}

export function getVisibleMonthDayNumbers(
  year: number,
  monthIndex: number,
  weekStartsOn = 0,
): { leadingEmptyCells: number; days: number[]; trailingEmptyCells: number } {
  const days = buildMonthDayNumbers(year, monthIndex);
  const leadingEmptyCells = getLeadingEmptyCellCount(year, monthIndex, weekStartsOn);
  const totalCells = leadingEmptyCells + days.length;
  const trailingEmptyCells = (7 - (totalCells % 7)) % 7;
  return { leadingEmptyCells, days, trailingEmptyCells };
}

export function countStructuralWeekCells(
  year: number,
  monthIndex: number,
  weekStartsOn = 0,
): number {
  const { leadingEmptyCells, days, trailingEmptyCells } = getVisibleMonthDayNumbers(
    year,
    monthIndex,
    weekStartsOn,
  );
  return leadingEmptyCells + days.length + trailingEmptyCells;
}

export function monthContainsOnlyOwnDayNumbers(
  year: number,
  monthIndex: number,
): boolean {
  const days = buildMonthDayNumbers(year, monthIndex);
  const expectedLast = countDaysInMonth(year, monthIndex);
  return days[0] === 1 && days.at(-1) === expectedLast;
}

export function isCrossMonthRangeComplete(
  from: { year: number; monthIndex: number; day: number },
  to: { year: number; monthIndex: number; day: number },
): boolean {
  const fromDate = new Date(from.year, from.monthIndex, from.day);
  const toDate = new Date(to.year, to.monthIndex, to.day);
  return fromDate.getTime() <= toDate.getTime();
}

/** Weekday math is direction-independent — RTL must not change these values. */
export function isWeekdayAlignmentDirectionSafe(
  year: number,
  monthIndex: number,
  day: number,
): boolean {
  const weekday = getWeekdayIndex(year, monthIndex, day);
  const column = getGridColumnForDay(year, monthIndex, day);
  return weekday === (column - 1 + 0) % 7;
}
