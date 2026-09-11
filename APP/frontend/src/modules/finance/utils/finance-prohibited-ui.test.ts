import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const financeDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function readFinanceSources(): string {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(tsx|css)$/.test(entry) && !entry.endsWith(".test.tsx")) {
        files.push(readFileSync(full, "utf8"));
      } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
        files.push(readFileSync(full, "utf8"));
      }
    }
  };
  walk(financeDir);
  return files.join("\n");
}

describe("Finance prohibited UI", () => {
  it("does not expose manual income or mark-paid flows in Finance module", () => {
    const source = readFinanceSources();
    const banned = [
      "Add Income",
      "Manual Income",
      "Mark Paid",
      "Mark Collected",
      "Confirm Payment",
      "Receive Cash",
      "Bank Transfer",
      "Tamara",
      "Tabby",
      "Deposit",
      "Payment Method",
      "Delete Expense",
    ];
    for (const phrase of banned) {
      assert.equal(source.includes(phrase), false, `found banned phrase: ${phrase}`);
    }
  });

  it("does not add invoice or delete routes in Finance API", () => {
    const source = readFileSync(join(financeDir, "api/finance.api.ts"), "utf8");
    assert.equal(source.includes("/finance/income"), false);
    assert.equal(source.includes('method: "DELETE"'), false);
  });
});
