import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { formatReturnedContractCarInDateTime } from "./returned-contracts.format.ts";

const messagesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../messages",
);

describe("returned contract car-in date format", () => {
  test("uses day/month/year order", () => {
    const formatted = formatReturnedContractCarInDateTime("2026-10-17T22:53:49.000Z");
    assert.match(formatted, /^\d{2}\/\d{2}\/2026,/);
    assert.ok(!formatted.includes("/2026/"));
  });
});

describe("returned contracts copy", () => {
  test("Arabic intro is formal (not colloquial فيك)", () => {
    const ar = JSON.parse(readFileSync(join(messagesDir, "ar.json"), "utf8")) as {
      RoadLiabilities: { returnedContracts: { intro: string } };
    };
    const intro = ar.RoadLiabilities.returnedContracts.intro;
    assert.ok(!intro.includes("فيك"));
    assert.match(intro, /البطاقة المحفوظة/);
  });

  test("manual collection tab label in Arabic", () => {
    const ar = JSON.parse(readFileSync(join(messagesDir, "ar.json"), "utf8")) as {
      RoadLiabilities: { pageTabs: { returnedContracts: string } };
    };
    assert.equal(ar.RoadLiabilities.pageTabs.returnedContracts, "التحصيل اليدوي");
  });
});
