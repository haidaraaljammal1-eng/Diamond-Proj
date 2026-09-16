import type { ContractStatus } from "@prisma/client";
import { businessDayKey } from "src/modules/reports/periods";
import {
  ACTIVE_RENTAL_STATUSES,
  PENDING_LINK_STATUSES,
  READY_FOR_DELIVERY_STATUS,
  TODAY_DELIVERY_STATUSES,
} from "src/modules/dashboard/dashboard.constants";

export function isActiveRentalStatus(status: ContractStatus): boolean {
  return (ACTIVE_RENTAL_STATUSES as readonly string[]).includes(status);
}

export function isPendingLinkStatus(status: ContractStatus): boolean {
  return (PENDING_LINK_STATUSES as readonly string[]).includes(status);
}

export function isTodayDeliveryStatus(status: ContractStatus): boolean {
  return (TODAY_DELIVERY_STATUSES as readonly string[]).includes(status);
}

export function isReadyForDeliveryStatus(status: ContractStatus): boolean {
  return status === READY_FOR_DELIVERY_STATUS;
}

export interface DailyActivityPoint {
  date: string;
  rented: number;
  returned: number;
}

export function buildWeeklyRentalActivity(
  days: readonly string[],
  carOutAt: readonly Date[],
  carInAt: readonly Date[],
  offsetMinutes: number,
): DailyActivityPoint[] {
  const rented = new Map<string, number>();
  const returned = new Map<string, number>();
  for (const day of days) {
    rented.set(day, 0);
    returned.set(day, 0);
  }
  for (const occurredAt of carOutAt) {
    const key = businessDayKey(occurredAt, offsetMinutes);
    if (rented.has(key)) rented.set(key, (rented.get(key) ?? 0) + 1);
  }
  for (const occurredAt of carInAt) {
    const key = businessDayKey(occurredAt, offsetMinutes);
    if (returned.has(key)) returned.set(key, (returned.get(key) ?? 0) + 1);
  }
  return days.map((date) => ({
    date,
    rented: rented.get(date) ?? 0,
    returned: returned.get(date) ?? 0,
  }));
}

export function fleetTotalsReconcile(fleet: {
  available: number;
  rented: number;
  service: number;
  total: number;
}): boolean {
  return fleet.available + fleet.rented + fleet.service === fleet.total;
}
