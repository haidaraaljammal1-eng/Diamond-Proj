import { gpsProviderInvalidResponseError } from "src/modules/gps/gps.errors";
import type {
  ProviderMileageSummary,
  ProviderOverspeedEvent,
} from "src/modules/gps/gps-provider.types";
import { asFiniteNumber, asString, isRecord } from "./live-gps.parse";
import { parseLiveGpsReportDateTime } from "./live-gps.time";

function parseKilometers(value: unknown): number | null {
  const raw = asString(value);
  if (!raw) return null;
  const match = /^(-?(?:\d+(?:\.\d+)?|\.\d+))\s*KM$/i.exec(raw);
  const parsed = Number(match?.[1] ?? raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function mapLiveGpsMileageSummary(rows: unknown[]): ProviderMileageSummary {
  const row = rows[0];
  if (!isRecord(row)) throw gpsProviderInvalidResponseError();
  const values = {
    todayKm: parseKilometers(row.today_driven),
    yesterdayKm: parseKilometers(row.yesterday),
    thisMonthKm: parseKilometers(row.this_month),
    lastMonthKm: parseKilometers(row.last_month),
  };
  if (Object.values(values).some((value) => value == null)) {
    throw gpsProviderInvalidResponseError();
  }
  return values as ProviderMileageSummary;
}

export function mapLiveGpsOverspeedRows(
  rows: unknown[],
  date: string,
  timezoneOffset: string,
): { events: ProviderOverspeedEvent[]; invalidRowCount: number } {
  const events: ProviderOverspeedEvent[] = [];
  let invalidRowCount = 0;
  for (const row of rows) {
    if (!isRecord(row)) {
      invalidRowCount += 1;
      continue;
    }
    const startedAt = parseLiveGpsReportDateTime(date, asString(row.from_time) ?? "", timezoneOffset);
    const endedAt = parseLiveGpsReportDateTime(date, asString(row.to_time) ?? "", timezoneOffset);
    const averageSpeedKph = asFiniteNumber(row.average_speed);
    const maxSpeedKph = asFiniteNumber(row.top_speed);
    const durationMinutes = asFiniteNumber(row.totalmin);
    if (
      !startedAt ||
      !endedAt ||
      averageSpeedKph == null ||
      maxSpeedKph == null ||
      durationMinutes == null ||
      averageSpeedKph < 0 ||
      maxSpeedKph < 0 ||
      durationMinutes < 0
    ) {
      invalidRowCount += 1;
      continue;
    }
    const startAddress = asString(row.start_address);
    const endAddress = asString(row.end_address);
    events.push({
      startedAt,
      endedAt,
      averageSpeedKph,
      maxSpeedKph,
      durationMinutes,
      addressLine: endAddress ?? startAddress,
    });
  }
  return { events, invalidRowCount };
}
