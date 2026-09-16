import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const en = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "../../../../../messages/en.json"), "utf8"),
) as { DateRangePicker: Record<string, unknown> };
const ar = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "../../../../../messages/ar.json"), "utf8"),
) as { DateRangePicker: Record<string, unknown> };

/** Keys required by `DateRangePickerLabels` / FinancePeriodControl. */
const REQUIRED_DATE_RANGE_PICKER_KEYS = [
  "fieldLabel",
  "placeholder",
  "apply",
  "clear",
  "daysSelected",
  "previousMonth",
  "nextMonth",
  "presets.today",
  "presets.last7",
  "presets.last30",
  "presets.thisMonth",
  "presets.lastMonth",
  "presets.custom",
] as const;

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
    flattenKeys(nested, prefix ? `${prefix}.${key}` : key),
  );
}

function readValue(root: Record<string, unknown>, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>((current, key) => {
    if (typeof current !== "object" || current === null) return undefined;
    return (current as Record<string, unknown>)[key];
  }, root);
}

describe("DateRangePicker i18n contract", () => {
  it("includes every label required by DateRangePickerLabels in both locales", () => {
    for (const key of REQUIRED_DATE_RANGE_PICKER_KEYS) {
      const enValue = readValue(en.DateRangePicker, key);
      const arValue = readValue(ar.DateRangePicker, key);
      assert.equal(typeof enValue, "string", `en missing DateRangePicker.${key}`);
      assert.equal(typeof arValue, "string", `ar missing DateRangePicker.${key}`);
      assert.ok(String(enValue).trim().length > 0, `en DateRangePicker.${key} empty`);
      assert.ok(String(arValue).trim().length > 0, `ar DateRangePicker.${key} empty`);
    }
  });

  it("keeps DateRangePicker namespace structure identical between ar and en", () => {
    assert.deepEqual(flattenKeys(ar.DateRangePicker).sort(), flattenKeys(en.DateRangePicker).sort());
  });
});
