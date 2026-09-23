import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ARCHIVE_COLUMNS, ARCHIVE_EDITABLE_FIELDS } from "./archive-columns.ts";

describe("archive columns", () => {
  it("defines exactly 24 columns in business order", () => {
    assert.equal(ARCHIVE_COLUMNS.length, 24);
    assert.deepEqual(ARCHIVE_EDITABLE_FIELDS, [
      "kmOut",
      "kmIn",
      "km",
      "deliveryDate",
      "deliveryTime",
      "returnDate",
      "returnTime",
      "customerName",
      "customerPhone",
      "description",
      "days",
      "dailyRate",
      "rentalTotal",
      "salik",
      "parking",
      "fuel",
      "blackPoints",
      "fines",
      "total",
      "dollar",
      "cash",
      "visa",
      "transfer",
      "remaining",
    ]);
  });
});
