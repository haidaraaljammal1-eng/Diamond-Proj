import type {
  ContractCarIn,
  ContractCarOut,
  ContractPayment,
  ContractReconciliationLine,
  RoadLiabilityCustomerCharge,
  RoadLiabilityType,
} from "@prisma/client";
import type { ContractSnapshot } from "src/modules/contracts/contracts-snapshot";
import {
  computeArchiveCashVisa,
  sumConfirmedRentalTotal,
} from "src/modules/archive/archive-payment-allocation";
import {
  businessDateToDbDate,
  businessWallClockFromUtc,
} from "src/modules/archive/archive-sync-time";

export type ArchiveAutoFields = {
  customerName: string | null;
  customerPhone: string | null;
  days: number | null;
  dailyRate: number | null;
  rentalTotal: number | null;
  /** Rental + reconciliation extras allocation (see `computeArchiveCashVisa`). */
  cash: number | null;
  visa: number | null;
  kmOut: number | null;
  deliveryDate: Date | null;
  deliveryTime: string | null;
  kmIn: number | null;
  returnDate: Date | null;
  returnTime: string | null;
  km: number | null;
  fuel: number | null;
  salik: number | null;
  /** Synced from reconciliation DAMAGE line amounts (DB column name kept for compatibility). */
  blackPoints: number | null;
  fines: number | null;
  total: number | null;
};

export function computeDailyRate(
  agreedAmount: number,
  rentalDays: number,
): number | null {
  if (!Number.isFinite(rentalDays) || rentalDays <= 0) return null;
  return Math.floor(agreedAmount / rentalDays);
}

export function customerContactFromContract(input: {
  snapshot: unknown;
  customer: { name: string; mobile: string | null } | null;
}): { name: string | null; phone: string | null } {
  const snap = input.snapshot as ContractSnapshot | null;
  if (snap?.customer?.name?.trim()) {
    return {
      name: snap.customer.name.trim(),
      phone: snap.customer.mobile?.trim() ?? null,
    };
  }
  if (input.customer?.name?.trim()) {
    return {
      name: input.customer.name.trim(),
      phone: input.customer.mobile?.trim() ?? null,
    };
  }
  return { name: null, phone: null };
}

function carOutFields(
  carOut: ContractCarOut | null,
  offsetMinutes: number,
): Pick<
  ArchiveAutoFields,
  "kmOut" | "deliveryDate" | "deliveryTime"
> {
  if (!carOut) {
    return { kmOut: null, deliveryDate: null, deliveryTime: null };
  }
  const wall = businessWallClockFromUtc(carOut.occurredAt, offsetMinutes);
  return {
    kmOut: carOut.mileageOut,
    deliveryDate: businessDateToDbDate(wall.dateYmd),
    deliveryTime: wall.timeHm,
  };
}

function carInFields(
  carIn: ContractCarIn | null,
  offsetMinutes: number,
): Pick<ArchiveAutoFields, "kmIn" | "returnDate" | "returnTime"> {
  if (!carIn) {
    return { kmIn: null, returnDate: null, returnTime: null };
  }
  const wall = businessWallClockFromUtc(carIn.occurredAt, offsetMinutes);
  return {
    kmIn: carIn.mileageIn,
    returnDate: businessDateToDbDate(wall.dateYmd),
    returnTime: wall.timeHm,
  };
}

function sumFuel(lines: ContractReconciliationLine[]): number | null {
  const fuelLines = lines.filter((l) => l.type === "FUEL");
  if (fuelLines.length === 0) return null;
  return fuelLines.reduce((sum, l) => sum + l.amount, 0);
}

/** Sum of manual DAMAGE reconciliation lines — final customer charge per line (`amount`). */
export function sumDamage(lines: ContractReconciliationLine[]): number | null {
  const damageLines = lines.filter((l) => l.type === "DAMAGE");
  if (damageLines.length === 0) return null;
  return damageLines.reduce((sum, l) => sum + l.amount, 0);
}

/** Extras total only — `المجموع` (fuel + salik + parking + damage + fines). Excludes `rentalTotal`. */
export function computeArchiveExtrasTotal(input: {
  fuel: number | null;
  salik: number | null;
  parking: number | null;
  blackPoints: number | null;
  fines: number | null;
}): number | null {
  const parts = [input.fuel, input.salik, input.parking, input.blackPoints, input.fines];
  if (parts.every((v) => v == null)) return null;
  return (
    (input.fuel ?? 0) +
    (input.salik ?? 0) +
    (input.parking ?? 0) +
    (input.blackPoints ?? 0) +
    (input.fines ?? 0)
  );
}

/** @alias `computeArchiveExtrasTotal` — rental is never included. */
export function computeArchiveTotal(input: {
  rentalTotal?: number | null;
  fuel: number | null;
  salik: number | null;
  parking: number | null;
  blackPoints: number | null;
  fines: number | null;
}): number | null {
  return computeArchiveExtrasTotal(input);
}

type ChargeWithType = RoadLiabilityCustomerCharge & {
  roadLiability: {
    type: RoadLiabilityType;
    attributionStatus: string;
    attributedContractId: string | null;
  };
};

export function sumRoadCharges(
  charges: ChargeWithType[],
  contractId: string,
): { fines: number | null; salik: number | null; violationsCounted: number } {
  let fines = 0;
  let salik = 0;
  let count = 0;
  let hasFines = false;
  let hasSalik = false;

  for (const charge of charges) {
    const liability = charge.roadLiability;
    if (liability.attributionStatus !== "MATCHED") continue;
    if (liability.attributedContractId !== contractId) continue;
    if (charge.contractId !== contractId) continue;

    count += 1;
    const amount = charge.customerChargeAmount;
    if (liability.type === "RTA_VIOLATION") {
      fines += amount;
      hasFines = true;
    } else if (
      liability.type === "SALIK_TOLL" ||
      liability.type === "SALIK_VIOLATION"
    ) {
      salik += amount;
      hasSalik = true;
    }
  }

  return {
    fines: hasFines ? fines : null,
    salik: hasSalik ? salik : null,
    violationsCounted: count,
  };
}

export function recomputeArchiveAutoFields(input: {
  contractId: string;
  rentalDays: number;
  agreedAmount: number;
  snapshot: unknown;
  customer: { name: string; mobile: string | null } | null;
  carOut: ContractCarOut | null;
  carIn: ContractCarIn | null;
  payments: ContractPayment[];
  reconciliationLines: ContractReconciliationLine[];
  roadCharges: ChargeWithType[];
  businessTimezoneOffsetMinutes: number;
  /** Manual parking on an existing archive row — included in total, never overwritten by sync. */
  parkingForTotal: number | null;
  /** When false, customer name/phone are omitted (preserve historical archive values). */
  includeCustomer: boolean;
}): ArchiveAutoFields & { violationsCounted: number } {
  const contact = customerContactFromContract({
    snapshot: input.snapshot,
    customer: input.customer,
  });
  const rentalTotal = sumConfirmedRentalTotal(input.payments);
  const out = carOutFields(input.carOut, input.businessTimezoneOffsetMinutes);
  const inn = carInFields(input.carIn, input.businessTimezoneOffsetMinutes);
  const kmOut = out.kmOut;
  const kmIn = inn.kmIn;
  let km: number | null = null;
  if (kmOut != null && kmIn != null && kmIn >= kmOut) {
    km = kmIn - kmOut;
  }
  const fuel = sumFuel(input.reconciliationLines);
  const blackPoints = sumDamage(input.reconciliationLines);
  const road = sumRoadCharges(input.roadCharges, input.contractId);
  const total = computeArchiveExtrasTotal({
    fuel,
    salik: road.salik,
    parking: input.parkingForTotal,
    blackPoints,
    fines: road.fines,
  });
  const { cash, visa } = computeArchiveCashVisa(input.payments, {
    effectiveRentalTotal: rentalTotal,
    extrasTotal: total,
  });

  const base: ArchiveAutoFields = {
    days: input.rentalDays,
    dailyRate: computeDailyRate(input.agreedAmount, input.rentalDays),
    rentalTotal,
    cash,
    visa,
    kmOut: out.kmOut,
    deliveryDate: out.deliveryDate,
    deliveryTime: out.deliveryTime,
    kmIn: inn.kmIn,
    returnDate: inn.returnDate,
    returnTime: inn.returnTime,
    km,
    fuel,
    salik: road.salik,
    blackPoints,
    fines: road.fines,
    total,
    customerName: input.includeCustomer ? contact.name : null,
    customerPhone: input.includeCustomer ? contact.phone : null,
  };

  return { ...base, violationsCounted: road.violationsCounted };
}

const AUTO_COMPARE_KEYS = [
  "customerName",
  "customerPhone",
  "days",
  "dailyRate",
  "rentalTotal",
  "cash",
  "visa",
  "kmOut",
  "deliveryDate",
  "deliveryTime",
  "kmIn",
  "returnDate",
  "returnTime",
  "km",
  "fuel",
  "salik",
  "blackPoints",
  "fines",
  "total",
] as const satisfies ReadonlyArray<keyof ArchiveAutoFields>;

export function archiveAutoFieldsChanged(
  existing: Record<string, unknown>,
  next: ArchiveAutoFields,
  options: { compareCustomer: boolean },
): boolean {
  for (const key of AUTO_COMPARE_KEYS) {
    if (!options.compareCustomer && (key === "customerName" || key === "customerPhone")) {
      continue;
    }
    const a = existing[key];
    const b = next[key];
    if (a instanceof Date && b instanceof Date) {
      if (a.getTime() !== b.getTime()) return true;
      continue;
    }
    if (a !== b) return true;
  }
  return false;
}
