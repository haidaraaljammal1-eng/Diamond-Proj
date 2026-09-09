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

describe("renewal i18n", () => {
  it("keeps Arabic and English labels for staff and public renewal", () => {
    const en = readMessages("en");
    const ar = readMessages("ar");

    for (const locale of [en, ar]) {
      assert.ok(nested(locale, ["Contracts", "actions", "renew"]).length > 0);
      assert.ok(nested(locale, ["Contracts", "renew", "link"]).length > 0);
      assert.ok(nested(locale, ["Contracts", "detail", "renewals"]).length > 0);
      assert.ok(nested(locale, ["PublicRenewal", "confirm"]).length > 0);
      assert.ok(nested(locale, ["PublicRenewal", "successTitle"]).length > 0);
      assert.ok(nested(locale, ["PublicRenewal", "currentRental"]).length > 0);
      assert.ok(nested(locale, ["PublicRenewal", "renewalOffer"]).length > 0);
      assert.ok(
        nested(locale, ["PublicRenewal", "link", "CONTRACT_LINK_EXPIRED", "title"]).length > 0,
      );
    }

    assert.equal(
      nested(en, ["PublicRenewal", "confirm"]),
      "Confirm Rental Extension",
    );
    assert.equal(
      nested(ar, ["PublicRenewal", "confirm"]),
      "تأكيد تمديد الإيجار",
    );
    assert.equal(
      nested(en, ["PublicRenewal", "successTitle"]),
      "Your rental extension has been confirmed",
    );
    assert.equal(
      nested(ar, ["PublicRenewal", "successTitle"]),
      "تم تأكيد تمديد الإيجار بنجاح",
    );
    assert.equal(
      nested(en, ["PublicRenewal", "link", "CONTRACT_LINK_EXPIRED", "title"]),
      "This renewal link has expired",
    );
    assert.equal(
      nested(ar, ["PublicRenewal", "link", "CONTRACT_LINK_EXPIRED", "title"]),
      "انتهت صلاحية رابط التمديد",
    );
    assert.notEqual(
      nested(en, ["PublicRenewal", "currentRental"]),
      nested(ar, ["PublicRenewal", "currentRental"]),
    );
  });
});
