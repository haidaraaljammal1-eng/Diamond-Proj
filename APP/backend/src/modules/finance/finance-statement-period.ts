import { z } from "zod";
import { env } from "src/config/env";
import {
  financePeriodTooLongError,
  financeStatementPeriodInvalidError,
} from "src/modules/finance/finance.errors";
import { MAX_FINANCE_PERIOD_DAYS } from "src/modules/finance/finance.constants";
import {
  localYmd,
  resolveBusinessDay,
  utcFromLocalMidnight,
  type Period,
} from "src/modules/reports/periods";

export const FinanceStatementPeriodTypeSchema = z.enum([
  "TODAY",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "CUSTOM",
]);

export const FinanceStatementExportQuerySchema = z.object({
  periodType: FinanceStatementPeriodTypeSchema,
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  weekStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  locale: z.enum(["ar", "en"]).optional().default("ar"),
});

export type FinanceStatementExportQuery = z.infer<typeof FinanceStatementExportQuerySchema>;

function parseYmd(value: string): { y: number; m: number; d: number } {
  const parts = value.split("-");
  if (parts.length !== 3) throw financeStatementPeriodInvalidError();
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw financeStatementPeriodInvalidError();
  }
  return { y, m: m - 1, d };
}

export function resolveFinanceStatementPeriod(
  query: FinanceStatementExportQuery,
): Period & { offsetMinutes: number } {
  const offsetMinutes = env.BUSINESS_TIMEZONE_OFFSET_MINUTES;
  let period: Period;

  switch (query.periodType) {
    case "TODAY": {
      period = resolveBusinessDay(new Date(), offsetMinutes);
      break;
    }
    case "DAILY": {
      const key = query.date ?? query.weekStart;
      if (!key) throw financeStatementPeriodInvalidError();
      const { y, m, d } = parseYmd(key);
      period = {
        from: utcFromLocalMidnight(y, m, d, offsetMinutes),
        to: utcFromLocalMidnight(y, m, d + 1, offsetMinutes),
      };
      break;
    }
    case "WEEKLY": {
      const key = query.weekStart ?? query.date;
      if (!key) throw financeStatementPeriodInvalidError();
      const { y, m, d } = parseYmd(key);
      period = {
        from: utcFromLocalMidnight(y, m, d, offsetMinutes),
        to: utcFromLocalMidnight(y, m, d + 7, offsetMinutes),
      };
      break;
    }
    case "MONTHLY": {
      if (query.year == null || query.month == null) throw financeStatementPeriodInvalidError();
      const y = query.year;
      const m = query.month - 1;
      period = {
        from: utcFromLocalMidnight(y, m, 1, offsetMinutes),
        to: utcFromLocalMidnight(m === 11 ? y + 1 : y, (m + 1) % 12, 1, offsetMinutes),
      };
      break;
    }
    case "CUSTOM": {
      if (!query.from || !query.to) throw financeStatementPeriodInvalidError();
      const fromParts = localYmd(query.from, offsetMinutes);
      const toParts = localYmd(query.to, offsetMinutes);
      period = {
        from: utcFromLocalMidnight(fromParts.y, fromParts.m, fromParts.d, offsetMinutes),
        to: utcFromLocalMidnight(toParts.y, toParts.m, toParts.d + 1, offsetMinutes),
      };
      break;
    }
    default:
      throw financeStatementPeriodInvalidError();
  }

  const days = (period.to.getTime() - period.from.getTime()) / (24 * 60 * 60 * 1000);
  if (days > MAX_FINANCE_PERIOD_DAYS) throw financePeriodTooLongError();
  if (days <= 0) throw financeStatementPeriodInvalidError();
  return { ...period, offsetMinutes };
}

/** Chronological start → end for PDF/UI (plain text; PDF bidi handles mixed Arabic + dates). */
export function formatStatementPeriodDisplayRange(from: string, to: string): string {
  return `${from} → ${to}`;
}

/** Inclusive business dates for filename labels (YYYY-MM-DD). */
export function statementPeriodFilenameRange(
  period: Period,
  offsetMinutes: number,
): { from: string; to: string } {
  const from = localYmd(period.from, offsetMinutes);
  const lastInclusive = new Date(period.to.getTime() - 1);
  const to = localYmd(lastInclusive, offsetMinutes);
  const fmt = (p: { y: number; m: number; d: number }) =>
    `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  return { from: fmt(from), to: fmt(to) };
}

/** Current business calendar day for statement UI labels (filtering uses `TODAY` at request time). */
export function resolveFinanceStatementBusinessToday(now: Date = new Date()) {
  const offsetMinutes = env.BUSINESS_TIMEZONE_OFFSET_MINUTES;
  const period = resolveBusinessDay(now, offsetMinutes);
  const { y, m, d } = localYmd(now, offsetMinutes);
  const businessDate = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const displayAr = `${String(d).padStart(2, "0")}/${String(m + 1).padStart(2, "0")}/${y}`;
  const displayEn = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m, d)));
  return { businessDate, displayAr, displayEn, offsetMinutes };
}
