import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  expenseCategoryLabel,
  isHiddenTechnicalReversalRow,
  isVoidedOriginalExpenseRow,
  ledgerMovementLabel,
  ledgerRowMovementKey,
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
    assert.equal(ledgerMovementLabel("VOIDED", t), "ledgerMovement.VOIDED");
    assert.notEqual(ledgerMovementLabel("VOIDED", t), "Income");
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

  it("does not treat a voided original Manual Expense as an active Expense movement", () => {
    const voided = {
      kind: "MANUAL_EXPENSE",
      direction: "EXPENSE" as const,
      manualExpenseStatus: "VOID" as const,
    };
    assert.equal(isVoidedOriginalExpenseRow(voided), true);
    assert.equal(ledgerRowMovementKey(voided), "VOIDED");
    assert.equal(
      isVoidedOriginalExpenseRow({ kind: "MANUAL_EXPENSE", manualExpenseStatus: "ACTIVE" }),
      false,
    );
    assert.equal(
      isVoidedOriginalExpenseRow({ kind: "MANUAL_EXPENSE_REVERSAL", manualExpenseStatus: "VOID" }),
      false,
    );
    assert.equal(isHiddenTechnicalReversalRow({ kind: "MANUAL_EXPENSE_REVERSAL" }), true);
    assert.equal(isHiddenTechnicalReversalRow({ kind: "MANUAL_EXPENSE" }), false);
  });
});

describe("voided amount styling", () => {
  it("uses strikethrough and muted color, not collection green", () => {
    const css = readFileSync(new URL("../components/finance-ledger/finance-ledger.module.css", import.meta.url), "utf8");
    assert.match(css, /\.amountVoided[\s\S]*?text-decoration:\s*line-through/);
    const voidedBlock = css.split(".amountVoided")[1]?.split("}")[0] ?? "";
    assert.equal(voidedBlock.includes("#2f6b3f"), false);
  });

  it("shares one column definition for ledger header and body", () => {
    const css = readFileSync(new URL("../components/finance-ledger/finance-ledger.module.css", import.meta.url), "utf8");
    const tsx = readFileSync(new URL("../components/finance-ledger/finance-ledger.tsx", import.meta.url), "utf8");
    assert.match(css, /table-layout:\s*fixed/);
    assert.match(css, /--ledger-col-date/);
    assert.match(css, /--ledger-col-movement/);
    assert.match(css, /--ledger-col-source/);
    assert.match(css, /--ledger-col-reference/);
    assert.match(css, /--ledger-col-contract/);
    assert.match(css, /--ledger-col-amount/);
    assert.match(css, /--ledger-col-action/);
    assert.match(tsx, /<colgroup>/);
    assert.match(tsx, /styles\.colAmount/);
    assert.match(tsx, /styles\.colAction/);
    assert.equal((tsx.match(/styles\.colAmount/g) ?? []).length >= 3, true);
    assert.equal((tsx.match(/styles\.colAction/g) ?? []).length >= 3, true);
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
