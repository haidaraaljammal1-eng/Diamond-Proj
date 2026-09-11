import { CONTRACT_CURRENCY } from "src/modules/contracts/contracts.constants";
import { contractError } from "src/modules/contracts/contracts.errors";

const AED_MINOR_FACTOR = 100;

/** Whole AED integers → Stripe minor units (fils). Server-side only. */
export function aedToStripeMinorUnits(amountAed: number): number {
  if (!Number.isInteger(amountAed) || amountAed <= 0) {
    throw contractError.invalidPaymentAmount();
  }
  return amountAed * AED_MINOR_FACTOR;
}

export function assertAedCurrency(currency: string): void {
  if (currency !== CONTRACT_CURRENCY) {
    throw contractError.invalidPaymentCurrency(currency);
  }
}

export function assertPositiveAedAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw contractError.invalidPaymentAmount();
  }
}
