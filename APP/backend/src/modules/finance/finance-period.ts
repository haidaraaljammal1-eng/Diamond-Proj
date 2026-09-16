import { env } from "src/config/env";
import { resolvePeriod, type Period } from "src/modules/reports/periods";
import { financePeriodTooLongError } from "src/modules/finance/finance.errors";
import { MAX_FINANCE_PERIOD_DAYS } from "src/modules/finance/finance.constants";

export interface FinancePeriodQuery {
  from?: Date;
  to?: Date;
  periodType?: "MONTH" | "QUARTER" | "YEAR" | "CUSTOM";
}

export function resolveFinancePeriod(query: FinancePeriodQuery, now = new Date()): Period {
  const offsetMinutes = env.BUSINESS_TIMEZONE_OFFSET_MINUTES;
  let period: Period;
  if (query.from && query.to) {
    period = { from: query.from, to: query.to };
  } else {
    const type = query.periodType ?? "MONTH";
    period = resolvePeriod(type, now, offsetMinutes, query.from, query.to).current;
  }
  const days = (period.to.getTime() - period.from.getTime()) / (24 * 60 * 60 * 1000);
  if (days > MAX_FINANCE_PERIOD_DAYS) throw financePeriodTooLongError();
  return period;
}
