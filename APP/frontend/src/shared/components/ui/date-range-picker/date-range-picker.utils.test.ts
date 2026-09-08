import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canApplyDraft,
  countDaysInclusive,
  detectPreset,
  draftToValue,
  formatCalendarDate,
  formatDaysSelected,
  formatDisplayDate,
  formatDisplayRange,
  isCompleteRange,
  openDraftFromValue,
  parseCalendarDate,
  resolvePresetRange,
  valueToDraft,
} from "./date-range-picker.utils.ts";

const TODAY = new Date(2026, 8, 8); // Sep 8, 2026 local

describe("date-only serialization", () => {
  it("formats Sep 1, 2026 as 2026-09-01 without timezone shift", () => {
    const date = new Date(2026, 8, 1);
    assert.equal(formatCalendarDate(date), "2026-09-01");
  });

  it("parses 2026-09-01 back to the same local calendar day", () => {
    const parsed = parseCalendarDate("2026-09-01");
    assert.ok(parsed);
    assert.equal(parsed.getFullYear(), 2026);
    assert.equal(parsed.getMonth(), 8);
    assert.equal(parsed.getDate(), 1);
  });

  it("serializes via formatCalendarDate instead of toISOString", () => {
    const parsed = parseCalendarDate("2026-09-01");
    assert.ok(parsed);
    assert.equal(formatCalendarDate(parsed), "2026-09-01");
  });

  it("round-trips value strings through draft helpers", () => {
    const value = { from: "2026-09-01", to: "2026-09-30" };
    assert.deepEqual(draftToValue(valueToDraft(value)), value);
  });
});

describe("DateRangePicker display", () => {
  it("formats an English range", () => {
    const text = formatDisplayRange(
      { from: "2026-09-01", to: "2026-09-30" },
      "en",
    );
    assert.match(text, /Sep/);
    assert.match(text, /2026/);
    assert.match(text, /—/);
  });

  it("formats an Arabic range", () => {
    const text = formatDisplayRange(
      { from: "2026-09-01", to: "2026-09-30" },
      "ar",
    );
    assert.match(text, /2026/);
    assert.match(text, /—/);
  });
});

describe("DateRangePicker apply rules", () => {
  it("disables apply for an incomplete range", () => {
    assert.equal(canApplyDraft({ from: TODAY }), false);
    assert.equal(canApplyDraft({ to: TODAY }), false);
    assert.equal(canApplyDraft({}), false);
  });

  it("allows apply when from and to are set in order", () => {
    assert.equal(
      canApplyDraft({ from: new Date(2026, 8, 1), to: new Date(2026, 8, 30) }),
      true,
    );
  });

  it("rejects inverted ranges", () => {
    assert.equal(
      canApplyDraft({ from: new Date(2026, 8, 30), to: new Date(2026, 8, 1) }),
      false,
    );
  });

  it("apply payload returns correct YYYY-MM-DD strings", () => {
    const applied = draftToValue({
      from: new Date(2026, 8, 1),
      to: new Date(2026, 8, 30),
    });
    assert.deepEqual(applied, { from: "2026-09-01", to: "2026-09-30" });
  });
});

describe("DateRangePicker quick presets", () => {
  it("Today selects a single day", () => {
    const range = resolvePresetRange("today", TODAY);
    assert.ok(range?.from && range.to);
    assert.equal(formatCalendarDate(range.from), formatCalendarDate(range.to));
  });

  it("Last 7 Days spans seven inclusive days", () => {
    const range = resolvePresetRange("last7", TODAY);
    assert.ok(range?.from && range.to);
    assert.equal(countDaysInclusive(range.from, range.to), 7);
  });

  it("Last 30 Days spans thirty inclusive days", () => {
    const range = resolvePresetRange("last30", TODAY);
    assert.ok(range?.from && range.to);
    assert.equal(countDaysInclusive(range.from, range.to), 30);
  });

  it("This Month covers the full current month", () => {
    const range = resolvePresetRange("thisMonth", TODAY);
    assert.deepEqual(draftToValue(range ?? {}), {
      from: "2026-09-01",
      to: "2026-09-30",
    });
    assert.equal(detectPreset(range ?? {}, TODAY), "thisMonth");
  });

  it("Last Month covers the previous calendar month", () => {
    const range = resolvePresetRange("lastMonth", TODAY);
    assert.deepEqual(draftToValue(range ?? {}), {
      from: "2026-08-01",
      to: "2026-08-31",
    });
    assert.equal(detectPreset(range ?? {}, TODAY), "lastMonth");
  });
});

describe("DateRangePicker draft lifecycle", () => {
  it("opens with the applied value as draft", () => {
    const draft = openDraftFromValue({ from: "2026-09-01", to: "2026-09-15" });
    assert.equal(isCompleteRange(draft), true);
    assert.deepEqual(draftToValue(draft), {
      from: "2026-09-01",
      to: "2026-09-15",
    });
  });

  it("clearing resets to an empty draft", () => {
    const cleared = openDraftFromValue({ from: "", to: "" });
    assert.deepEqual(cleared, {});
    assert.equal(isCompleteRange(cleared), false);
  });
});

describe("DateRangePicker daysSelected formatting", () => {
  const enDaysSelected = (count: number) => `${count} days selected`;
  const arDaysSelected = (count: number) => `تم تحديد ${count} يومًا`;

  it("formats a single selected day in English", () => {
    const text = formatDaysSelected(1, enDaysSelected);
    assert.equal(text, "1 days selected");
    assert.match(text, /1/);
  });

  it("formats thirty selected days in English", () => {
    const text = formatDaysSelected(30, enDaysSelected);
    assert.equal(text, "30 days selected");
    assert.match(text, /30/);
  });

  it("formats a single selected day in Arabic", () => {
    const text = formatDaysSelected(1, arDaysSelected);
    assert.equal(text, "تم تحديد 1 يومًا");
    assert.match(text, /1/);
  });

  it("formats thirty selected days in Arabic", () => {
    const text = formatDaysSelected(30, arDaysSelected);
    assert.equal(text, "تم تحديد 30 يومًا");
    assert.match(text, /30/);
  });

  it("builds selected-days summary from an inclusive range without placeholder tokens", () => {
    const from = new Date(2026, 8, 1);
    const to = new Date(2026, 8, 30);
    const summary = formatDaysSelected(countDaysInclusive(from, to), enDaysSelected);
    assert.equal(summary, "30 days selected");
    assert.doesNotMatch(summary, /\{count\}/);
  });
});

describe("DateRangePicker RTL structure", () => {
  it("uses locale-aware month names for Arabic display", () => {
    const label = formatDisplayDate(new Date(2026, 8, 1), "ar");
    assert.match(label, /2026/);
    assert.doesNotMatch(label, /\d{2}\/\d{2}\/\d{4}/);
  });
});
