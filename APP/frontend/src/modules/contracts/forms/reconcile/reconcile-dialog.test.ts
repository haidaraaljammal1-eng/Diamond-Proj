import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = join(import.meta.dirname, "../..");
const appRoot = join(import.meta.dirname, "../../../..");

describe("final reconciliation frontend wiring", () => {
  it("uses GET /reconciliation and dedicated reconciliation APIs", () => {
    const api = readFileSync(join(root, "api/reconciliation.api.ts"), "utf8");
    assert.ok(api.includes("/reconciliation"));
    assert.ok(api.includes("getFullReconciliation"));
    assert.ok(api.includes("finalizeReconciliation"));
    assert.ok(api.includes("settleReconciliationCash"));
    assert.ok(api.includes("generateReconciliationLink"));
  });

  it("renders wide final reconciliation dialog sections", () => {
    const dialog = readFileSync(join(root, "forms/reconcile/reconcile-dialog.tsx"), "utf8");
    assert.ok(dialog.includes('size="wide"'));
    assert.ok(dialog.includes("ReconciliationImagePairsSection"));
    assert.ok(
      dialog.includes("ReconciliationActionBar") || dialog.includes("ReconciliationCollectionSection"),
    );
    assert.ok(!dialog.includes("onRequestClose"));
    assert.ok(!dialog.includes('actions.close'));
  });

  it("maps cash collection failures to a specific domain message", () => {
    const messagesRoot = join(appRoot, "../messages");
    const en = JSON.parse(readFileSync(join(messagesRoot, "en.json"), "utf8")) as {
      Contracts: { error: Record<string, string> };
    };
    const ar = JSON.parse(readFileSync(join(messagesRoot, "ar.json"), "utf8")) as {
      Contracts: { error: Record<string, string> };
    };
    for (const reason of ["PAYMENT_ALREADY_PROCESSING", "ALREADY_PAID", "ELECTRONIC_COLLECTION_ACTIVE"]) {
      assert.equal(typeof en.Contracts.error[reason], "string");
      assert.equal(typeof ar.Contracts.error[reason], "string");
      assert.notEqual(en.Contracts.error[reason], en.Contracts.error.CONFLICT);
      assert.notEqual(ar.Contracts.error[reason], ar.Contracts.error.CONFLICT);
    }
  });

  it("exposes public reconciliation route and screen", () => {
    const page = readFileSync(
      join(appRoot, "app/[locale]/reconciliation/[token]/page.tsx"),
      "utf8",
    );
    assert.ok(page.includes("PublicReconciliationScreen"));
  });
});
