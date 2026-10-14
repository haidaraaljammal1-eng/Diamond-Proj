import type { ContractPayment } from "@prisma/client";

export function sumConfirmedRentalTotal(payments: ContractPayment[]): number | null {
  const lines = payments.filter(
    (p) => p.status === "CONFIRMED" && p.purpose === "RENTAL",
  );
  if (lines.length === 0) return null;
  return lines.reduce((sum, p) => sum + p.amount, 0);
}

/** Latest CONFIRMED `RECONCILIATION` payment method (method only — not amount). */
export function reconciliationSettlementMethod(
  payments: ContractPayment[],
): "CASH" | "CARD" | null {
  const recon = payments.filter(
    (p) => p.status === "CONFIRMED" && p.purpose === "RECONCILIATION",
  );
  if (recon.length === 0) return null;

  const latest = recon.reduce((best, p) => {
    const t = p.confirmedAt?.getTime() ?? 0;
    const bt = best.confirmedAt?.getTime() ?? 0;
    return t >= bt ? p : best;
  });

  if (latest.method === "CASH" || latest.method === "CARD") {
    return latest.method;
  }
  return null;
}

export function rentalLedgerSplit(
  effectiveRentalTotal: number | null,
  payments: ContractPayment[],
): { rentalCash: number; rentalVisa: number } {
  if (effectiveRentalTotal == null || effectiveRentalTotal === 0) {
    return { rentalCash: 0, rentalVisa: 0 };
  }

  const lines = payments.filter(
    (p) => p.status === "CONFIRMED" && p.purpose === "RENTAL",
  );
  if (lines.length === 0) return { rentalCash: 0, rentalVisa: 0 };

  let paidCash = 0;
  let paidCard = 0;
  for (const p of lines) {
    if (p.method === "CASH") paidCash += p.amount;
    if (p.method === "CARD") paidCard += p.amount;
  }
  const paidTotal = paidCash + paidCard;
  if (paidTotal <= 0) return { rentalCash: 0, rentalVisa: 0 };
  if (paidCard === 0) return { rentalCash: effectiveRentalTotal, rentalVisa: 0 };
  if (paidCash === 0) return { rentalCash: 0, rentalVisa: effectiveRentalTotal };

  const scale = effectiveRentalTotal / paidTotal;
  return {
    rentalCash: Math.round(paidCash * scale),
    rentalVisa: Math.round(paidCard * scale),
  };
}

/** Deterministic cash/visa from rental method + current extras `total` + reconciliation method. */
export function computeArchiveCashVisa(
  payments: ContractPayment[],
  input: {
    effectiveRentalTotal: number | null;
    extrasTotal: number | null;
  },
): { cash: number | null; visa: number | null } {
  const { rentalCash, rentalVisa } = rentalLedgerSplit(
    input.effectiveRentalTotal,
    payments,
  );

  const reconMethod = reconciliationSettlementMethod(payments);
  const extras = input.extrasTotal ?? 0;
  let reconCash = 0;
  let reconVisa = 0;
  if (reconMethod === "CASH") reconCash = extras;
  else if (reconMethod === "CARD") reconVisa = extras;

  const cash = rentalCash + reconCash;
  const visa = rentalVisa + reconVisa;

  const hasRental = payments.some(
    (p) => p.status === "CONFIRMED" && p.purpose === "RENTAL",
  );
  if (!hasRental && reconMethod === null) {
    return { cash: null, visa: null };
  }

  return { cash, visa };
}
