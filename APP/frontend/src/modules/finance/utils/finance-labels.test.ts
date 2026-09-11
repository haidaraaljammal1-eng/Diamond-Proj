import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expenseCategoryLabel,
  ledgerMovementLabel,
  ledgerSourceFromKind,
  receivablePaymentStateLabel,
  receivableSourceLabel,
  RECEIVABLE_PAYMENT_STATES,
} from "./finance-labels.ts";

const t = (key: string) => key;

describe("finance labels", () => {
  it("maps receivable source types", () => {
    assert.equal(receivableSourceLabel("RENTAL", t), "receivableSource.RENTAL");
    assert.equal(receivableSourceLabel("POST_CLOSE_RECEIVABLE", t), "receivableSource.POST_CLOSE_RECEIVABLE");
  });

  it("maps ledger movement directions without income wording", () => {
    assert.equal(ledgerMovementLabel("EXPENSE_REVERSAL", t), "ledgerMovement.EXPENSE_REVERSAL");
    assert.notEqual(ledgerMovementLabel("EXPENSE_REVERSAL", t), "Income");
  });

  it("maps manual expense categories", () => {
    const translate = (key: string) =>
      key === "expenseCategory.VEHICLE_CLEANING" ? "Vehicle Cleaning" : key;
    assert.equal(expenseCategoryLabel("VEHICLE_CLEANING", translate), "Vehicle Cleaning");
  });

  it("keeps Expense Reversal off the Source column", () => {
    assert.equal(ledgerSourceFromKind("MANUAL_EXPENSE_REVERSAL"), "MANUAL_EXPENSE");
    assert.equal(ledgerSourceFromKind("MANUAL_EXPENSE"), "MANUAL_EXPENSE");
    assert.equal(ledgerSourceFromKind("RENTAL_PAYMENT"), "RENTAL_PAYMENT");
  });
});

describe("receivable payment state labels", () => {
  const en: Record<string, string> = {
    "receivablePaymentState.UNPAID": "Awaiting Payment",
    "receivablePaymentState.PENDING": "Pending Payment",
    "receivablePaymentState.PROCESSING": "Processing Payment",
    "receivablePaymentState.CONFIRMED": "Payment Confirmed",
    "receivablePaymentState.FAILED": "Payment Failed",
    "receivablePaymentState.CANCELLED": "Payment Cancelled",
  };
  const ar: Record<string, string> = {
    "receivablePaymentState.UNPAID": "بانتظار الدفع",
    "receivablePaymentState.PENDING": "دفع قيد الانتظار",
    "receivablePaymentState.PROCESSING": "جارٍ معالجة الدفع",
    "receivablePaymentState.CONFIRMED": "تم تأكيد الدفع",
    "receivablePaymentState.FAILED": "فشل الدفع",
    "receivablePaymentState.CANCELLED": "أُلغي الدفع",
  };
  const translate = (catalog: Record<string, string>) => (key: string) =>
    catalog[key] ?? key;

  it("maps UNPAID to Awaiting Payment in English", () => {
    assert.equal(receivablePaymentStateLabel("UNPAID", translate(en)), "Awaiting Payment");
  });

  it("maps UNPAID to بانتظار الدفع in Arabic", () => {
    assert.equal(receivablePaymentStateLabel("UNPAID", translate(ar)), "بانتظار الدفع");
  });

  it("does not return raw payment-state enums", () => {
    const raw = ["UNPAID", "PENDING", "PROCESSING", "CONFIRMED", "FAILED", "CANCELLED"];
    for (const state of raw) {
      assert.notEqual(receivablePaymentStateLabel(state, translate(en)), state);
      assert.notEqual(receivablePaymentStateLabel(state, translate(ar)), state);
    }
    assert.equal(receivablePaymentStateLabel("UNKNOWN", translate(en)), "—");
  });

  it("maps every backend-supported state in both locales", () => {
    assert.deepEqual([...RECEIVABLE_PAYMENT_STATES], [
      "UNPAID",
      "PENDING",
      "PROCESSING",
      "CONFIRMED",
      "FAILED",
      "CANCELLED",
    ]);
    for (const state of RECEIVABLE_PAYMENT_STATES) {
      const enLabel = receivablePaymentStateLabel(state, translate(en));
      const arLabel = receivablePaymentStateLabel(state, translate(ar));
      assert.equal(enLabel.startsWith("receivablePaymentState."), false);
      assert.equal(arLabel.startsWith("receivablePaymentState."), false);
      assert.notEqual(enLabel, arLabel);
      assert.notEqual(enLabel, "Outstanding");
      assert.notEqual(arLabel, "مستحق التحصيل");
    }
  });
});
