import {
  formatCalendarDate,
  storedUtcToCalendarDate,
} from "src/modules/contracts/license-calendar";

/**
 * Archive `@db.Date` fields are calendar dates. Read Y-M-D from UTC (Prisma DATE /
 * sync UTC-noon storage) without `toISOString()` day extraction or local timezone.
 */
export function archiveDateOnlyYmd(value: Date): string {
  return formatCalendarDate(storedUtcToCalendarDate(value));
}

/**
 * ExcelJS date cell value: UTC noon of the calendar day so `dd/mm/yyyy` display
 * matches DB/UI in any server or developer timezone.
 */
export function archiveDateOnlyToExcelValue(value: Date): Date {
  const cal = storedUtcToCalendarDate(value);
  return new Date(Date.UTC(cal.y, cal.m - 1, cal.d, 12, 0, 0));
}
