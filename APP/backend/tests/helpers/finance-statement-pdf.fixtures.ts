import type { FinanceStatementLine, FinanceStatementSnapshot } from "src/modules/finance/finance-statement.service";

const LONG_REF = "aa521c94-e0eb-4f2a-9c3d-8b7e6f5a4b3c-2d1e0f9a8b7c-6d5e4f3a2b1c";

function line(partial: Partial<FinanceStatementLine> & Pick<FinanceStatementLine, "id" | "occurredAt" | "cumulativeNet">): FinanceStatementLine {
  return {
    businessDay: "2026-10-13",
    kind: "RENTAL_PAYMENT",
    direction: "COLLECTION",
    categoryLabel: "تحصيل إيجار",
    referenceId: partial.referenceId ?? `ref-${partial.id}`,
    contractNumber: partial.contractNumber ?? "DE-2026-000201",
    vehicleName: partial.vehicleName ?? "BMW X2",
    plateNumber: partial.plateNumber ?? "7180",
    description: partial.description ?? "RENTAL",
    vendorName: partial.vendorName ?? null,
    paymentMethodLabel: partial.paymentMethodLabel ?? "كاش / ماكينة",
    moneyIn: partial.moneyIn ?? 0,
    moneyOut: partial.moneyOut ?? 0,
    adjustment: partial.adjustment ?? 0,
    ...partial,
  };
}

function snapshotFromLines(
  lines: FinanceStatementLine[],
  overrides: Partial<FinanceStatementSnapshot> = {},
): FinanceStatementSnapshot {
  const dayMap = new Map<string, FinanceStatementLine[]>();
  for (const l of lines) {
    const bucket = dayMap.get(l.businessDay) ?? [];
    bucket.push(l);
    dayMap.set(l.businessDay, bucket);
  }
  const dayGroups = [...dayMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, groupLines]) => {
    const moneyIn = groupLines.reduce((s, x) => s + x.moneyIn, 0);
    const moneyOut = groupLines.reduce((s, x) => s + x.moneyOut, 0);
    const adjustment = groupLines.reduce((s, x) => s + x.adjustment, 0);
    return {
      day,
      moneyIn,
      moneyOut,
      adjustment,
      net: moneyIn - moneyOut + adjustment,
      lines: groupLines,
    };
  });
  let totalCollections = 0;
  let grossExpenses = 0;
  let expenseReversals = 0;
  for (const l of lines) {
    totalCollections += l.moneyIn;
    grossExpenses += l.moneyOut;
    expenseReversals += l.adjustment;
  }
  const netExpenses = grossExpenses - expenseReversals;
  return {
    locale: "ar",
    companyCode: "ELITE",
    brandKey: "ELITE",
    companyDisplayName: "DIAMOND ELITE RENT CAR",
    companyLegalName: "Diamond Elite Car Rental LLC",
    currency: "AED",
    period: { from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-11-01T00:00:00Z") },
    periodLabel: { from: "2026-10-01", to: "2026-10-31" },
    offsetMinutes: 240,
    timezoneLabel: "UTC+4",
    generatedAt: new Date("2026-10-14T00:00:00Z"),
    summary: {
      totalCollections,
      grossExpenses,
      expenseReversals,
      netExpenses,
      netMovement: totalCollections - netExpenses,
    },
    lines,
    dayGroups,
    ...overrides,
  };
}

export const fixtureTwoOrdinary = (): FinanceStatementSnapshot =>
  snapshotFromLines([
    line({
      id: "a1",
      occurredAt: new Date("2026-10-13T09:29:18.000Z"),
      moneyIn: 2755,
      cumulativeNet: 2755,
      contractNumber: "DE-2026-000192",
      paymentMethodLabel: "بطاقة",
    }),
    line({
      id: "a2",
      occurredAt: new Date("2026-10-13T19:43:57.000Z"),
      moneyIn: 1050,
      cumulativeNet: 3805,
      contractNumber: "DE-2026-000201",
      vehicleName: "QA-RENEWAL-VISUAL-20261013",
      plateNumber: "QA-RN13-A09880",
    }),
  ]);

export const fixtureLongRefs = (): FinanceStatementSnapshot =>
  snapshotFromLines([
    line({
      id: "long-1",
      occurredAt: new Date("2026-10-12T10:00:00.000Z"),
      businessDay: "2026-10-12",
      referenceId: LONG_REF,
      contractNumber: "DE-2026-000192-GA-RENEWAL-EXTENDED-ID",
      moneyIn: 500,
      cumulativeNet: 500,
      vehicleName: "مركبة فاخرة Land Rover Defender 2024 العربية",
    }),
  ]);

export const fixtureMixedDays = (): FinanceStatementSnapshot =>
  snapshotFromLines([
    line({
      id: "d1",
      occurredAt: new Date("2026-10-11T08:00:00.000Z"),
      businessDay: "2026-10-11",
      moneyIn: 200,
      cumulativeNet: 200,
    }),
    line({
      id: "d2",
      occurredAt: new Date("2026-10-11T14:00:00.000Z"),
      businessDay: "2026-10-11",
      kind: "MANUAL_EXPENSE",
      direction: "EXPENSE",
      categoryLabel: "مصروف يدوي",
      moneyOut: 80,
      cumulativeNet: 120,
      vendorName: "Workshop UAE",
    }),
    line({
      id: "d3",
      occurredAt: new Date("2026-10-12T09:00:00.000Z"),
      businessDay: "2026-10-12",
      kind: "MANUAL_EXPENSE_REVERSAL",
      adjustment: 20,
      direction: "EXPENSE_REVERSAL",
      categoryLabel: "عكس مصروف يدوي",
      cumulativeNet: 140,
      moneyIn: 0,
    }),
  ]);

export const fixtureEmpty = (): FinanceStatementSnapshot =>
  snapshotFromLines([], { summary: { totalCollections: 0, grossExpenses: 0, expenseReversals: 0, netExpenses: 0, netMovement: 0 } });

export const fixtureDense = (count: number): FinanceStatementSnapshot => {
  const lines: FinanceStatementLine[] = [];
  let cumulative = 0;
  for (let i = 0; i < count; i += 1) {
    const day = i % 3 === 0 ? "2026-10-11" : i % 3 === 1 ? "2026-10-12" : "2026-10-13";
    const amt = 100 + (i % 7) * 50;
    cumulative += amt;
    lines.push(
      line({
        id: `dense-${i}`,
        occurredAt: new Date(`2026-10-${day.slice(8, 10)}T${String(8 + (i % 10)).padStart(2, "0")}:00:00.000Z`),
        businessDay: day,
        referenceId: `${LONG_REF}-${i}`,
        moneyIn: amt,
        cumulativeNet: cumulative,
      }),
    );
  }
  return snapshotFromLines(lines);
};

export const fixtureUniqueEn = (): FinanceStatementSnapshot =>
  snapshotFromLines(
    [
      line({
        id: "u1",
        occurredAt: new Date("2026-10-10T12:00:00.000Z"),
        businessDay: "2026-10-10",
        moneyIn: 900,
        cumulativeNet: 900,
        categoryLabel: "Rental collection",
        paymentMethodLabel: "Card",
      }),
    ],
    {
      locale: "en",
      companyCode: "UNIQUE",
      brandKey: "UNIQUE",
      companyDisplayName: "DIAMOND UNIQUE RENT CAR",
      companyLegalName: "Diamond Unique Car Rental CO.L.L.C.S.O.C",
    },
  );

export { LONG_REF };
