import type {
  FinanceAnalyticsDto,
  FinanceExpenseBreakdownDto,
  FinanceOutstandingBreakdownDto,
  FinanceSummaryDto,
  FinanceTrendPointDto,
  LedgerDirection,
  LedgerDisplaySource,
  LedgerEntryDto,
  LedgerKind,
  LedgerQuery,
  ManualExpenseCategory,
  ManualExpenseDetailDto,
  OpenReceivableDto,
  OpenReceivableSourceType,
  OpenReceivablesQuery,
} from "../types/finance.types";
import { ledgerSourceFromKind } from "./finance-labels.ts";

const SIM_LEDGER_PAGE_SIZE = 25;
const SIM_RECEIVABLES_PAGE_SIZE = 20;

type SimulationPageMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export const SIMULATED_FINANCE_PREFIX = "sim-fin-";
export const FINANCE_SIMULATION_OUTSTANDING_TOTAL = 2540;
export const FINANCE_SIMULATION_RECEIVABLE_COUNT = 4;

export function isSimulatedFinanceId(id: string | null | undefined): boolean {
  return Boolean(id && id.startsWith(SIMULATED_FINANCE_PREFIX));
}

export type BilingualText = { en: string; ar: string };

export interface SimulatedLedgerEntry extends LedgerEntryDto {
  descriptions: BilingualText;
  vendorName?: string | null;
  reference?: string | null;
}

export interface FinanceSimulationOverlay {
  generatedAt: string;
  movements: SimulatedLedgerEntry[];
  receivables: OpenReceivableDto[];
  expenses: Record<string, ManualExpenseDetailDto>;
}

const VOGUE = {
  id: 91001,
  vehicleName: "Range Rover Vogue",
  plateNumber: "D 12345",
};

const DEMO_STAFF = {
  id: 1,
  name: "Demo Simulation",
  email: "demo@diamond.test",
};

function startOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function atDaysAgo(now: Date, days: number, hours: number): Date {
  const value = startOfDay(now);
  value.setDate(value.getDate() - days);
  value.setHours(hours, 0, 0, 0);
  return value;
}

function earlierThisMonth(now: Date, hours: number): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, hours, 0, 0, 0);
  const today = startOfDay(now);
  if (start.getTime() >= today.getTime()) {
    const sameDay = new Date(now);
    sameDay.setHours(Math.min(hours, 8), 0, 0, 0);
    return sameDay;
  }
  return start;
}

function previousMonthMid(now: Date, hours: number): Date {
  return new Date(now.getFullYear(), now.getMonth() - 1, 15, hours, 0, 0, 0);
}

function iso(date: Date): string {
  return date.toISOString();
}

function pickText(value: BilingualText, locale: string): string {
  return locale.startsWith("ar") ? value.ar : value.en;
}

function movement(
  partial: Omit<SimulatedLedgerEntry, "currency" | "descriptions" | "description"> & {
    descriptions: BilingualText;
  },
): SimulatedLedgerEntry {
  return {
    currency: "AED",
    vendorName: partial.vendorName ?? null,
    reference: partial.reference ?? null,
    ...partial,
    description: partial.descriptions.en,
  };
}

function customer(id: number, name: string): { id: number; name: string } {
  return { id, name };
}

function contract(id: string, contractNumber: string): { id: string; contractNumber: string } {
  return { id, contractNumber };
}

function expenseDetail(
  id: string,
  amount: number,
  category: ManualExpenseCategory,
  recognizedAt: string,
  description: string,
  extras: Partial<ManualExpenseDetailDto> = {},
): ManualExpenseDetailDto {
  return {
    id,
    amount,
    currency: "AED",
    category,
    recognizedAt,
    description,
    vehicle: VOGUE,
    vendorName: extras.vendorName ?? null,
    receiptNumber: extras.receiptNumber ?? null,
    attachment: null,
    note: extras.note ?? null,
    status: extras.status ?? "ACTIVE",
    correctionOfExpenseId: extras.correctionOfExpenseId ?? null,
    voidedAt: extras.voidedAt ?? null,
    voidReason: extras.voidReason ?? null,
    createdBy: DEMO_STAFF,
    voidedBy: extras.voidedBy ?? null,
    createdAt: recognizedAt,
  };
}

function receivable(partial: {
  sourceType: OpenReceivableSourceType;
  sourceId: string;
  contractId: string;
  contractNumber: string;
  customerName: string;
  customerId: number;
  outstandingAmount: number;
  obligationCreatedAt: string;
  paymentPurpose: string;
}): OpenReceivableDto {
  return {
    sourceType: partial.sourceType,
    sourceId: partial.sourceId,
    contractId: partial.contractId,
    contractNumber: partial.contractNumber,
    customer: customer(partial.customerId, partial.customerName),
    vehicle: VOGUE,
    amountDue: partial.outstandingAmount,
    amountPaid: 0,
    outstandingAmount: partial.outstandingAmount,
    currency: "AED",
    obligationCreatedAt: partial.obligationCreatedAt,
    paymentState: "UNPAID",
    paymentPurpose: partial.paymentPurpose,
    latestPaymentId: null,
  };
}

/** One coherent Finance fixture. KPIs and breakdowns must be derived from these rows. */
export function buildFinanceSimulationOverlay(
  now: Date = new Date(),
): FinanceSimulationOverlay {
  const todayRental = atDaysAgo(now, 0, 11);
  const todayCleaning = atDaysAgo(now, 0, 14);
  const yesterdayRecon = atDaysAgo(now, 1, 11);
  const yesterdayMaint = atDaysAgo(now, 1, 12);
  const yesterdayOriginal = atDaysAgo(now, 1, 13);
  const yesterdayReversal = atDaysAgo(now, 1, 13);
  yesterdayReversal.setMinutes(30);
  const threeDaysRenewal = atDaysAgo(now, 3, 11);
  const threeDaysParking = atDaysAgo(now, 3, 12);
  const fiveDaysPostClose = atDaysAgo(now, 5, 11);
  const fiveDaysMarketing = atDaysAgo(now, 5, 12);
  const monthFuel = earlierThisMonth(now, 10);
  const monthOffice = earlierThisMonth(now, 11);
  const prevGov = previousMonthMid(now, 10);
  const prevOps = previousMonthMid(now, 11);
  const prevOther = previousMonthMid(now, 12);

  const originalExpenseId = `${SIMULATED_FINANCE_PREFIX}exp-clean-100`;
  const correctedExpenseId = `${SIMULATED_FINANCE_PREFIX}exp-clean-80`;
  const originalRef = "EXP-SIM-CLEAN-100";

  const movements: SimulatedLedgerEntry[] = [
    movement({
      id: `${SIMULATED_FINANCE_PREFIX}led-rental`,
      kind: "RENTAL_PAYMENT" satisfies LedgerKind,
      direction: "COLLECTION",
      sourceType: "CONTRACT_PAYMENT",
      sourceId: `${SIMULATED_FINANCE_PREFIX}pay-rental`,
      amount: 1500,
      occurredAt: iso(todayRental),
      contract: contract(`${SIMULATED_FINANCE_PREFIX}contract-paid-rental`, "DE-2026-00124"),
      customer: customer(9201, "Fatima Noor"),
      vehicle: VOGUE,
      category: null,
      descriptions: {
        en: "Rental payment — Contract DE-2026-00124",
        ar: "دفعة إيجار — العقد DE-2026-00124",
      },
      contractPaymentId: `${SIMULATED_FINANCE_PREFIX}pay-rental`,
      maintenanceOrderId: null,
      manualExpenseId: null,
      reference: "PAY-SIM-RENT-1500",
    }),
    movement({
      id: `${SIMULATED_FINANCE_PREFIX}led-clean-corrected`,
      kind: "MANUAL_EXPENSE",
      direction: "EXPENSE",
      sourceType: "MANUAL_EXPENSE",
      sourceId: correctedExpenseId,
      amount: 80,
      occurredAt: iso(todayCleaning),
      contract: null,
      customer: null,
      vehicle: VOGUE,
      category: "VEHICLE_CLEANING",
      descriptions: {
        en: "Vehicle cleaning — Range Rover Vogue",
        ar: "تنظيف المركبة — رينج روفر فوج",
      },
      contractPaymentId: null,
      maintenanceOrderId: null,
      manualExpenseId: correctedExpenseId,
      vendorName: "Pearl Valet",
      reference: "EXP-SIM-CLEAN-80",
    }),
    movement({
      id: `${SIMULATED_FINANCE_PREFIX}led-recon`,
      kind: "RECONCILIATION_PAYMENT",
      direction: "COLLECTION",
      sourceType: "CONTRACT_PAYMENT",
      sourceId: `${SIMULATED_FINANCE_PREFIX}pay-recon`,
      amount: 570,
      occurredAt: iso(yesterdayRecon),
      contract: contract(`${SIMULATED_FINANCE_PREFIX}contract-paid-recon`, "DE-2026-00119"),
      customer: customer(9202, "Omar Khalid"),
      vehicle: VOGUE,
      category: null,
      descriptions: {
        en: "Return reconciliation — Damage + Fuel",
        ar: "تسوية الإرجاع — ضرر + وقود",
      },
      contractPaymentId: `${SIMULATED_FINANCE_PREFIX}pay-recon`,
      maintenanceOrderId: null,
      manualExpenseId: null,
      reference: "PAY-SIM-RECON-570",
    }),
    movement({
      id: `${SIMULATED_FINANCE_PREFIX}led-maint`,
      kind: "MAINTENANCE_EXPENSE",
      direction: "EXPENSE",
      sourceType: "MAINTENANCE_ORDER",
      sourceId: `${SIMULATED_FINANCE_PREFIX}maint-brakes`,
      amount: 850,
      occurredAt: iso(yesterdayMaint),
      contract: null,
      customer: null,
      vehicle: VOGUE,
      category: "MAINTENANCE",
      descriptions: {
        en: "Brake service — Range Rover Vogue",
        ar: "خدمة الفرامل — رينج روفر فوج",
      },
      contractPaymentId: null,
      maintenanceOrderId: 91051,
      manualExpenseId: null,
      vendorName: "Al Tayer Motors",
      reference: "MNT-SIM-BRAKE-850",
    }),
    movement({
      id: `${SIMULATED_FINANCE_PREFIX}led-clean-original`,
      kind: "MANUAL_EXPENSE",
      direction: "EXPENSE",
      sourceType: "MANUAL_EXPENSE",
      sourceId: originalExpenseId,
      amount: 100,
      occurredAt: iso(yesterdayOriginal),
      contract: null,
      customer: null,
      vehicle: VOGUE,
      category: "VEHICLE_CLEANING",
      descriptions: {
        en: "Vehicle cleaning",
        ar: "تنظيف المركبة",
      },
      contractPaymentId: null,
      maintenanceOrderId: null,
      manualExpenseId: originalExpenseId,
      vendorName: "Pearl Valet",
      reference: originalRef,
    }),
    movement({
      id: `${SIMULATED_FINANCE_PREFIX}led-clean-reversal`,
      kind: "MANUAL_EXPENSE_REVERSAL",
      direction: "EXPENSE_REVERSAL",
      sourceType: "MANUAL_EXPENSE",
      sourceId: originalExpenseId,
      amount: 100,
      occurredAt: iso(yesterdayReversal),
      contract: null,
      customer: null,
      vehicle: VOGUE,
      category: "VEHICLE_CLEANING",
      descriptions: {
        en: `Void vehicle cleaning expense`,
        ar: "إلغاء مصروف تنظيف المركبة",
      },
      contractPaymentId: null,
      maintenanceOrderId: null,
      manualExpenseId: originalExpenseId,
      vendorName: "Pearl Valet",
      reference: originalRef,
    }),
    movement({
      id: `${SIMULATED_FINANCE_PREFIX}led-renewal`,
      kind: "RENEWAL_PAYMENT",
      direction: "COLLECTION",
      sourceType: "CONTRACT_PAYMENT",
      sourceId: `${SIMULATED_FINANCE_PREFIX}pay-renewal`,
      amount: 500,
      occurredAt: iso(threeDaysRenewal),
      contract: contract(`${SIMULATED_FINANCE_PREFIX}contract-paid-renewal`, "DE-2026-00120"),
      customer: customer(9203, "Layla Mansour"),
      vehicle: VOGUE,
      category: null,
      descriptions: {
        en: "Renewal payment — 3 additional days",
        ar: "دفعة تجديد — 3 أيام إضافية",
      },
      contractPaymentId: `${SIMULATED_FINANCE_PREFIX}pay-renewal`,
      maintenanceOrderId: null,
      manualExpenseId: null,
      reference: "PAY-SIM-REN-500",
    }),
    movement({
      id: `${SIMULATED_FINANCE_PREFIX}led-parking`,
      kind: "MANUAL_EXPENSE",
      direction: "EXPENSE",
      sourceType: "MANUAL_EXPENSE",
      sourceId: `${SIMULATED_FINANCE_PREFIX}exp-parking`,
      amount: 40,
      occurredAt: iso(threeDaysParking),
      contract: null,
      customer: null,
      vehicle: VOGUE,
      category: "PARKING",
      descriptions: {
        en: "Parking — Dubai Airport",
        ar: "موقف — مطار دبي",
      },
      contractPaymentId: null,
      maintenanceOrderId: null,
      manualExpenseId: `${SIMULATED_FINANCE_PREFIX}exp-parking`,
      vendorName: "Dubai Airports",
      reference: "EXP-SIM-PARK-40",
    }),
    movement({
      id: `${SIMULATED_FINANCE_PREFIX}led-post-close`,
      kind: "POST_CLOSE_RECEIVABLE_PAYMENT",
      direction: "COLLECTION",
      sourceType: "CONTRACT_PAYMENT",
      sourceId: `${SIMULATED_FINANCE_PREFIX}pay-post-close`,
      amount: 120,
      occurredAt: iso(fiveDaysPostClose),
      contract: contract(`${SIMULATED_FINANCE_PREFIX}contract-paid-post-close`, "DE-2026-00103"),
      customer: customer(9204, "Hassan Ali"),
      vehicle: VOGUE,
      category: null,
      descriptions: {
        en: "Late RTA charge",
        ar: "مطالبة هيئة الطرق المتأخرة",
      },
      contractPaymentId: `${SIMULATED_FINANCE_PREFIX}pay-post-close`,
      maintenanceOrderId: null,
      manualExpenseId: null,
      reference: "PAY-SIM-PC-120",
    }),
    movement({
      id: `${SIMULATED_FINANCE_PREFIX}led-marketing`,
      kind: "MANUAL_EXPENSE",
      direction: "EXPENSE",
      sourceType: "MANUAL_EXPENSE",
      sourceId: `${SIMULATED_FINANCE_PREFIX}exp-marketing`,
      amount: 300,
      occurredAt: iso(fiveDaysMarketing),
      contract: null,
      customer: null,
      vehicle: null,
      category: "MARKETING",
      descriptions: {
        en: "Digital advertising",
        ar: "إعلان رقمي",
      },
      contractPaymentId: null,
      maintenanceOrderId: null,
      manualExpenseId: `${SIMULATED_FINANCE_PREFIX}exp-marketing`,
      vendorName: "Meta Ads",
      reference: "EXP-SIM-MKT-300",
    }),
    movement({
      id: `${SIMULATED_FINANCE_PREFIX}led-fuel`,
      kind: "MANUAL_EXPENSE",
      direction: "EXPENSE",
      sourceType: "MANUAL_EXPENSE",
      sourceId: `${SIMULATED_FINANCE_PREFIX}exp-fuel`,
      amount: 160,
      occurredAt: iso(monthFuel),
      contract: null,
      customer: null,
      vehicle: VOGUE,
      category: "FUEL",
      descriptions: {
        en: "Fuel",
        ar: "وقود",
      },
      contractPaymentId: null,
      maintenanceOrderId: null,
      manualExpenseId: `${SIMULATED_FINANCE_PREFIX}exp-fuel`,
      vendorName: "ADNOC",
      reference: "EXP-SIM-FUEL-160",
    }),
    movement({
      id: `${SIMULATED_FINANCE_PREFIX}led-office`,
      kind: "MANUAL_EXPENSE",
      direction: "EXPENSE",
      sourceType: "MANUAL_EXPENSE",
      sourceId: `${SIMULATED_FINANCE_PREFIX}exp-office`,
      amount: 90,
      occurredAt: iso(monthOffice),
      contract: null,
      customer: null,
      vehicle: null,
      category: "OFFICE_ADMIN",
      descriptions: {
        en: "Office stationery",
        ar: "قرطاسية مكتبية",
      },
      contractPaymentId: null,
      maintenanceOrderId: null,
      manualExpenseId: `${SIMULATED_FINANCE_PREFIX}exp-office`,
      vendorName: "Office Hub",
      reference: "EXP-SIM-OFF-90",
    }),
    movement({
      id: `${SIMULATED_FINANCE_PREFIX}led-gov`,
      kind: "MANUAL_EXPENSE",
      direction: "EXPENSE",
      sourceType: "MANUAL_EXPENSE",
      sourceId: `${SIMULATED_FINANCE_PREFIX}exp-gov`,
      amount: 250,
      occurredAt: iso(prevGov),
      contract: null,
      customer: null,
      vehicle: VOGUE,
      category: "GOVERNMENT_FEES",
      descriptions: {
        en: "Government registration fee",
        ar: "رسوم تسجيل حكومية",
      },
      contractPaymentId: null,
      maintenanceOrderId: null,
      manualExpenseId: `${SIMULATED_FINANCE_PREFIX}exp-gov`,
      vendorName: "RTA",
      reference: "EXP-SIM-GOV-250",
    }),
    movement({
      id: `${SIMULATED_FINANCE_PREFIX}led-ops`,
      kind: "MANUAL_EXPENSE",
      direction: "EXPENSE",
      sourceType: "MANUAL_EXPENSE",
      sourceId: `${SIMULATED_FINANCE_PREFIX}exp-ops`,
      amount: 140,
      occurredAt: iso(prevOps),
      contract: null,
      customer: null,
      vehicle: VOGUE,
      category: "OPERATIONS",
      descriptions: {
        en: "Operations",
        ar: "تشغيل",
      },
      contractPaymentId: null,
      maintenanceOrderId: null,
      manualExpenseId: `${SIMULATED_FINANCE_PREFIX}exp-ops`,
      vendorName: "Fleet Ops",
      reference: "EXP-SIM-OPS-140",
    }),
    movement({
      id: `${SIMULATED_FINANCE_PREFIX}led-other`,
      kind: "MANUAL_EXPENSE",
      direction: "EXPENSE",
      sourceType: "MANUAL_EXPENSE",
      sourceId: `${SIMULATED_FINANCE_PREFIX}exp-other`,
      amount: 55,
      occurredAt: iso(prevOther),
      contract: null,
      customer: null,
      vehicle: null,
      category: "OTHER",
      descriptions: {
        en: "Courier supplies",
        ar: "مستلزمات البريد",
      },
      contractPaymentId: null,
      maintenanceOrderId: null,
      manualExpenseId: `${SIMULATED_FINANCE_PREFIX}exp-other`,
      vendorName: "Emirates Post",
      reference: "EXP-SIM-OTH-55",
    }),
  ];

  const receivables: OpenReceivableDto[] = [
    receivable({
      sourceType: "RENTAL",
      sourceId: `${SIMULATED_FINANCE_PREFIX}recv-rental`,
      contractId: `${SIMULATED_FINANCE_PREFIX}contract-open-rental`,
      contractNumber: "DE-2026-00131",
      customerName: "Ahmed Hassan",
      customerId: 9301,
      outstandingAmount: 1400,
      obligationCreatedAt: iso(atDaysAgo(now, 2, 9)),
      paymentPurpose: "RENTAL",
    }),
    receivable({
      sourceType: "RENEWAL",
      sourceId: `${SIMULATED_FINANCE_PREFIX}recv-renewal`,
      contractId: `${SIMULATED_FINANCE_PREFIX}contract-open-renewal`,
      contractNumber: "DE-2026-00125",
      customerName: "Noura Saeed",
      customerId: 9302,
      outstandingAmount: 450,
      obligationCreatedAt: iso(atDaysAgo(now, 4, 9)),
      paymentPurpose: "RENEWAL",
    }),
    receivable({
      sourceType: "RECONCILIATION",
      sourceId: `${SIMULATED_FINANCE_PREFIX}recv-recon`,
      contractId: `${SIMULATED_FINANCE_PREFIX}contract-open-recon`,
      contractNumber: "DE-2026-00118",
      customerName: "Yousef Ibrahim",
      customerId: 9303,
      outstandingAmount: 570,
      obligationCreatedAt: iso(atDaysAgo(now, 6, 9)),
      paymentPurpose: "RECONCILIATION",
    }),
    receivable({
      sourceType: "POST_CLOSE_RECEIVABLE",
      sourceId: `${SIMULATED_FINANCE_PREFIX}recv-post-close`,
      contractId: `${SIMULATED_FINANCE_PREFIX}contract-open-post-close`,
      contractNumber: "DE-2026-00102",
      customerName: "Mariam Fadel",
      customerId: 9304,
      outstandingAmount: 120,
      obligationCreatedAt: iso(atDaysAgo(now, 12, 9)),
      paymentPurpose: "POST_CLOSE_RECEIVABLE",
    }),
  ];

  const expenses: Record<string, ManualExpenseDetailDto> = {
    [correctedExpenseId]: expenseDetail(
      correctedExpenseId,
      80,
      "VEHICLE_CLEANING",
      iso(todayCleaning),
      "Vehicle cleaning — Range Rover Vogue",
      {
        vendorName: "Pearl Valet",
        receiptNumber: "EXP-SIM-CLEAN-80",
        correctionOfExpenseId: originalExpenseId,
        note: "Corrected cleaning amount",
      },
    ),
    [originalExpenseId]: expenseDetail(
      originalExpenseId,
      100,
      "VEHICLE_CLEANING",
      iso(yesterdayOriginal),
      "Vehicle cleaning",
      {
        vendorName: "Pearl Valet",
        receiptNumber: originalRef,
        status: "VOID",
        voidedAt: iso(yesterdayReversal),
        voidReason: "Amount entered incorrectly",
        voidedBy: DEMO_STAFF,
      },
    ),
    [`${SIMULATED_FINANCE_PREFIX}exp-parking`]: expenseDetail(
      `${SIMULATED_FINANCE_PREFIX}exp-parking`,
      40,
      "PARKING",
      iso(threeDaysParking),
      "Parking — Dubai Airport",
      { vendorName: "Dubai Airports", receiptNumber: "EXP-SIM-PARK-40" },
    ),
    [`${SIMULATED_FINANCE_PREFIX}exp-marketing`]: expenseDetail(
      `${SIMULATED_FINANCE_PREFIX}exp-marketing`,
      300,
      "MARKETING",
      iso(fiveDaysMarketing),
      "Digital advertising",
      { vendorName: "Meta Ads", receiptNumber: "EXP-SIM-MKT-300" },
    ),
    [`${SIMULATED_FINANCE_PREFIX}exp-fuel`]: expenseDetail(
      `${SIMULATED_FINANCE_PREFIX}exp-fuel`,
      160,
      "FUEL",
      iso(monthFuel),
      "Fuel",
      { vendorName: "ADNOC", receiptNumber: "EXP-SIM-FUEL-160" },
    ),
    [`${SIMULATED_FINANCE_PREFIX}exp-office`]: expenseDetail(
      `${SIMULATED_FINANCE_PREFIX}exp-office`,
      90,
      "OFFICE_ADMIN",
      iso(monthOffice),
      "Office stationery",
      { vendorName: "Office Hub", receiptNumber: "EXP-SIM-OFF-90" },
    ),
    [`${SIMULATED_FINANCE_PREFIX}exp-gov`]: expenseDetail(
      `${SIMULATED_FINANCE_PREFIX}exp-gov`,
      250,
      "GOVERNMENT_FEES",
      iso(prevGov),
      "Government registration fee",
      { vendorName: "RTA", receiptNumber: "EXP-SIM-GOV-250" },
    ),
    [`${SIMULATED_FINANCE_PREFIX}exp-ops`]: expenseDetail(
      `${SIMULATED_FINANCE_PREFIX}exp-ops`,
      140,
      "OPERATIONS",
      iso(prevOps),
      "Operations",
      { vendorName: "Fleet Ops", receiptNumber: "EXP-SIM-OPS-140" },
    ),
    [`${SIMULATED_FINANCE_PREFIX}exp-other`]: expenseDetail(
      `${SIMULATED_FINANCE_PREFIX}exp-other`,
      55,
      "OTHER",
      iso(prevOther),
      "Courier supplies",
      { vendorName: "Emirates Post", receiptNumber: "EXP-SIM-OTH-55" },
    ),
  };

  return {
    generatedAt: iso(now),
    movements,
    receivables,
    expenses,
  };
}

export function localizeSimulatedLedger(
  entries: SimulatedLedgerEntry[],
  locale: string,
): SimulatedLedgerEntry[] {
  return entries.map((entry) => ({
    ...entry,
    description: pickText(entry.descriptions, locale),
  }));
}

function inPeriod(occurredAt: string, from: string, to: string): boolean {
  const time = new Date(occurredAt).getTime();
  return time >= new Date(from).getTime() && time < new Date(to).getTime();
}

export function movementsInPeriod(
  overlay: FinanceSimulationOverlay,
  from: string,
  to: string,
): SimulatedLedgerEntry[] {
  return overlay.movements.filter((entry) => inPeriod(entry.occurredAt, from, to));
}

export function deriveFinanceSummary(
  overlay: FinanceSimulationOverlay,
  from: string,
  to: string,
): FinanceSummaryDto {
  const periodMovements = movementsInPeriod(overlay, from, to);
  const collected = periodMovements
    .filter((entry) => entry.direction === "COLLECTION")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const expenseGross = periodMovements
    .filter((entry) => entry.direction === "EXPENSE")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const reversals = periodMovements
    .filter((entry) => entry.direction === "EXPENSE_REVERSAL")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const expenses = expenseGross - reversals;
  const outstanding = overlay.receivables.reduce(
    (sum, row) => sum + row.outstandingAmount,
    0,
  );

  return {
    period: { from, to },
    collected,
    outstanding,
    expenses,
    netMovement: collected - expenses,
    openReceivablesCount: overlay.receivables.length,
    currency: "AED",
    outstandingAsOf: overlay.generatedAt,
  };
}

function dateKey(occurredAt: string): string {
  const date = new Date(occurredAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function deriveFinanceAnalytics(
  overlay: FinanceSimulationOverlay,
  from: string,
  to: string,
): FinanceAnalyticsDto {
  const periodMovements = movementsInPeriod(overlay, from, to);
  const trendMap = new Map<string, FinanceTrendPointDto>();

  for (const entry of periodMovements) {
    const key = dateKey(entry.occurredAt);
    const current = trendMap.get(key) ?? {
      date: key,
      collected: 0,
      expenses: 0,
      netMovement: 0,
    };
    if (entry.direction === "COLLECTION") {
      current.collected += entry.amount;
    } else if (entry.direction === "EXPENSE") {
      current.expenses += entry.amount;
    } else {
      current.expenses -= entry.amount;
    }
    current.netMovement = current.collected - current.expenses;
    trendMap.set(key, current);
  }

  const trend = [...trendMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  const outstandingGroups: OpenReceivableSourceType[] = [
    "RENTAL",
    "RENEWAL",
    "RECONCILIATION",
    "POST_CLOSE_RECEIVABLE",
  ];
  const outstandingBreakdown: FinanceOutstandingBreakdownDto[] = outstandingGroups.map(
    (sourceType) => {
      const rows = overlay.receivables.filter((row) => row.sourceType === sourceType);
      return {
        sourceType,
        count: rows.length,
        amount: rows.reduce((sum, row) => sum + row.outstandingAmount, 0),
      };
    },
  );

  const expenseMap = new Map<string, number>();
  for (const entry of periodMovements) {
    if (entry.direction !== "EXPENSE" && entry.direction !== "EXPENSE_REVERSAL") continue;
    const category = entry.category ?? "OTHER";
    const current = expenseMap.get(category) ?? 0;
    const next =
      entry.direction === "EXPENSE_REVERSAL" ? current - entry.amount : current + entry.amount;
    expenseMap.set(category, next);
  }

  const expenseBreakdown: FinanceExpenseBreakdownDto[] = [...expenseMap.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([category, amount]) => ({ category, amount }));

  return {
    period: { from, to },
    currency: "AED",
    trend,
    outstandingBreakdown,
    expenseBreakdown,
  };
}

function searchBlob(entry: SimulatedLedgerEntry): string {
  return [
    entry.descriptions.en,
    entry.descriptions.ar,
    entry.description,
    entry.reference,
    entry.vendorName,
    entry.contract?.contractNumber,
    entry.customer?.name,
    entry.vehicle?.vehicleName,
    entry.vehicle?.plateNumber,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function filterSimulatedLedger(
  overlay: FinanceSimulationOverlay,
  query: Pick<
    LedgerQuery,
    "search" | "from" | "to" | "direction" | "displaySource" | "page" | "pageSize" | "sort"
  >,
  locale: string,
): { data: SimulatedLedgerEntry[]; meta: SimulationPageMeta } {
  const needle = query.search.trim().toLowerCase();
  let rows = localizeSimulatedLedger(
    movementsInPeriod(overlay, query.from, query.to),
    locale,
  );

  if (query.direction) {
    rows = rows.filter((entry) => entry.direction === query.direction);
  }
  if (query.displaySource) {
    rows = rows.filter(
      (entry) => ledgerSourceFromKind(entry.kind) === query.displaySource,
    );
  }
  if (needle) {
    rows = rows.filter((entry) => searchBlob(entry).includes(needle));
  }

  const desc = !query.sort || query.sort.endsWith("desc");
  rows = [...rows].sort((a, b) => {
    const delta = new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
    return desc ? -delta : delta;
  });

  const pageSize = query.pageSize || SIM_LEDGER_PAGE_SIZE;
  const page = query.page || 1;
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;

  return {
    data: rows.slice(start, start + pageSize),
    meta: { page, pageSize, total, totalPages },
  };
}

function receivableSearchBlob(row: OpenReceivableDto): string {
  return [
    row.contractNumber,
    row.customer?.name,
    row.vehicle?.vehicleName,
    row.vehicle?.plateNumber,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function filterSimulatedReceivables(
  overlay: FinanceSimulationOverlay,
  query: OpenReceivablesQuery,
): { data: OpenReceivableDto[]; meta: SimulationPageMeta } {
  const needle = query.search.trim().toLowerCase();
  let rows = [...overlay.receivables];
  if (query.sourceType) {
    rows = rows.filter((row) => row.sourceType === query.sourceType);
  }
  if (needle) {
    rows = rows.filter((row) => receivableSearchBlob(row).includes(needle));
  }

  const [field, dir] = (query.sort || "obligationCreatedAt:desc").split(":");
  const desc = dir !== "asc";
  rows.sort((a, b) => {
    const left = field === "amount" ? a.outstandingAmount : new Date(a.obligationCreatedAt).getTime();
    const right = field === "amount" ? b.outstandingAmount : new Date(b.obligationCreatedAt).getTime();
    return desc ? right - left : left - right;
  });

  const pageSize = query.pageSize || SIM_RECEIVABLES_PAGE_SIZE;
  const page = query.page || 1;
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;

  return {
    data: rows.slice(start, start + pageSize),
    meta: { page, pageSize, total, totalPages },
  };
}

export function matchesMovementFilter(
  entry: Pick<LedgerEntryDto, "direction">,
  movement: LedgerDirection | null,
): boolean {
  return !movement || entry.direction === movement;
}

export function matchesSourceFilter(
  entry: Pick<LedgerEntryDto, "kind">,
  source: LedgerDisplaySource | null,
): boolean {
  return !source || ledgerSourceFromKind(entry.kind) === source;
}

export function shouldSkipFinanceMutation(simulationActive: boolean): boolean {
  return simulationActive;
}
