import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

function readMessages(locale: "ar" | "en"): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      path.join(import.meta.dirname, `../../../../messages/${locale}.json`),
      "utf8",
    ),
  ) as Record<string, unknown>;
}

function nested(root: Record<string, unknown>, keys: string[]): string {
  let current: unknown = root;
  for (const key of keys) {
    assert.ok(current && typeof current === "object", keys.join("."));
    current = (current as Record<string, unknown>)[key];
  }
  assert.equal(typeof current, "string", keys.join("."));
  return current as string;
}

describe("return / car-in i18n", () => {
  it("keeps Arabic and English labels for Car-In, Salik, Violation and public return", () => {
    const en = readMessages("en");
    const ar = readMessages("ar");

    for (const locale of [en, ar]) {
      assert.ok(nested(locale, ["Contracts", "actions", "carIn"]).length > 0);
      assert.ok(nested(locale, ["Contracts", "carIn", "title"]).length > 0);
      assert.ok(nested(locale, ["Contracts", "carIn", "description"]).length > 0);
      assert.ok(nested(locale, ["Contracts", "reconcile", "categoriesLabel"]).length > 0);
      assert.ok(nested(locale, ["Contracts", "reconcile", "type", "VIOLATION"]).length > 0);
      assert.ok(nested(locale, ["PublicReturn", "title"]).length > 0);
      assert.ok(nested(locale, ["PublicReturn", "office"]).length > 0);
      assert.ok(nested(locale, ["PublicReturn", "instructions"]).length > 0);
    }

    assert.notEqual(
      nested(en, ["Contracts", "actions", "carIn"]),
      nested(ar, ["Contracts", "actions", "carIn"]),
    );
    assert.equal(nested(ar, ["Contracts", "carIn", "title"]), "استلام المركبة");
    assert.equal(
      nested(ar, ["Contracts", "carIn", "description"]),
      "سجّل حالة المركبة وبياناتها عند الإرجاع وأرفق صور الفحص المطلوبة.",
    );
    assert.equal(nested(en, ["Contracts", "carIn", "title"]), "Car-In — return inspection");
    assert.equal(
      nested(en, ["Contracts", "carIn", "description"]),
      "Record incoming mileage, fuel and the eight inspection photos. This does not close the contract.",
    );
    assert.notEqual(
      nested(en, ["PublicReturn", "instructions"]),
      nested(ar, ["PublicReturn", "instructions"]),
    );
  });
});
