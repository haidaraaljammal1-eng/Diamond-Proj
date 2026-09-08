import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canApplyDraft } from "./date-range-picker.utils.ts";
import {
  buildMonthDayNumbers,
  countDaysInMonth,
  countStructuralWeekCells,
  DATE_RANGE_PICKER_CALENDAR_CONFIG,
  getGridColumnForDay,
  getLeadingEmptyCellCount,
  getVisibleMonthDayNumbers,
  getWeekdayIndex,
  getWeekdayName,
  isCrossMonthRangeComplete,
  isWeekdayAlignmentDirectionSafe,
  monthContainsOnlyOwnDayNumbers,
  shouldHideOutsideDays,
} from "./date-range-picker.calendar.utils.ts";

describe("DateRangePicker calendar layout config", () => {
  it("renders two bounded desktop months with outer-edge navigation", () => {
    assert.equal(DATE_RANGE_PICKER_CALENDAR_CONFIG.desktopMonthCount, 2);
    assert.equal(DATE_RANGE_PICKER_CALENDAR_CONFIG.weekColumnCount, 7);
    assert.equal(DATE_RANGE_PICKER_CALENDAR_CONFIG.hideBuiltInNavigation, true);
  });

  it("disables outside-day numbers without removing structural cells", () => {
    assert.equal(DATE_RANGE_PICKER_CALENDAR_CONFIG.showOutsideDays, false);
    assert.equal(shouldHideOutsideDays(false), true);
  });
});

describe("DateRangePicker weekday math — September/October 2026", () => {
  it("September 1, 2026 is Tuesday", () => {
    assert.equal(getWeekdayIndex(2026, 8, 1), 2);
    assert.equal(getWeekdayName(2026, 8, 1), "Tuesday");
  });

  it("September 30, 2026 is Wednesday", () => {
    assert.equal(getWeekdayIndex(2026, 8, 30), 3);
    assert.equal(getWeekdayName(2026, 8, 30), "Wednesday");
    assert.equal(getGridColumnForDay(2026, 8, 30), 4);
  });

  it("October 1, 2026 is Thursday", () => {
    assert.equal(getWeekdayIndex(2026, 9, 1), 4);
    assert.equal(getWeekdayName(2026, 9, 1), "Thursday");
    assert.equal(getGridColumnForDay(2026, 9, 1), 5);
  });

  it("October 31, 2026 is Saturday", () => {
    assert.equal(getWeekdayIndex(2026, 9, 31), 6);
    assert.equal(getWeekdayName(2026, 9, 31), "Saturday");
  });
});

describe("DateRangePicker month day grids", () => {
  it("September 2026 shows only days 1 through 30", () => {
    const days = buildMonthDayNumbers(2026, 8);
    assert.deepEqual(days, Array.from({ length: 30 }, (_, i) => i + 1));
    assert.equal(monthContainsOnlyOwnDayNumbers(2026, 8), true);
  });

  it("September 2026 has two leading empty cells before day 1", () => {
    const { leadingEmptyCells, days } = getVisibleMonthDayNumbers(2026, 8);
    assert.equal(leadingEmptyCells, 2);
    assert.equal(days[0], 1);
    assert.deepEqual(days, Array.from({ length: 30 }, (_, index) => index + 1));
  });

  it("October 2026 shows only days 1 through 31", () => {
    const days = buildMonthDayNumbers(2026, 9);
    assert.deepEqual(days, Array.from({ length: 31 }, (_, i) => i + 1));
    assert.equal(monthContainsOnlyOwnDayNumbers(2026, 9), true);
  });

  it("October 2026 starts under Thursday with four leading empty cells", () => {
    const { leadingEmptyCells } = getVisibleMonthDayNumbers(2026, 9);
    assert.equal(leadingEmptyCells, 4);
    assert.equal(getGridColumnForDay(2026, 9, 1), 5);
  });

  it("February 2024 leap year has 29 days", () => {
    assert.equal(countDaysInMonth(2024, 1), 29);
    assert.deepEqual(
      buildMonthDayNumbers(2024, 1),
      Array.from({ length: 29 }, (_, i) => i + 1),
    );
  });

  it("preserves seven structural positions per week row", () => {
    const september = getVisibleMonthDayNumbers(2026, 8);
    assert.equal(countStructuralWeekCells(2026, 8) % 7, 0);
    assert.equal(
      september.leadingEmptyCells + september.days.length + september.trailingEmptyCells,
      countStructuralWeekCells(2026, 8),
    );
  });
});

describe("DateRangePicker month shapes", () => {
  it("supports a 28-day month", () => {
    assert.equal(countDaysInMonth(2026, 1), 28);
    assert.equal(countStructuralWeekCells(2026, 1) % 7, 0);
  });

  it("supports a 30-day month", () => {
    assert.equal(countDaysInMonth(2026, 3), 30);
    assert.equal(countStructuralWeekCells(2026, 3) % 7, 0);
  });

  it("supports a 31-day month", () => {
    assert.equal(countDaysInMonth(2026, 0), 31);
    assert.equal(countStructuralWeekCells(2026, 0) % 7, 0);
  });

  it("supports a month starting on Sunday", () => {
    assert.equal(getLeadingEmptyCellCount(2026, 1), 0);
    assert.equal(getWeekdayIndex(2026, 1, 1), 0);
  });

  it("supports a month starting on Saturday", () => {
    assert.equal(getWeekdayIndex(2026, 7, 1), 6);
    assert.equal(getLeadingEmptyCellCount(2026, 7), 6);
  });
});

describe("DateRangePicker cross-month range", () => {
  it("Sep 28 to Oct 4 remains a valid applyable range", () => {
    const from = new Date(2026, 8, 28);
    const to = new Date(2026, 9, 4);
    assert.equal(
      isCrossMonthRangeComplete(
        { year: 2026, monthIndex: 8, day: 28 },
        { year: 2026, monthIndex: 9, day: 4 },
      ),
      true,
    );
    assert.equal(canApplyDraft({ from, to }), true);
  });
});

describe("DateRangePicker RTL weekday safety", () => {
  it("keeps weekday math independent of UI direction", () => {
    assert.equal(isWeekdayAlignmentDirectionSafe(2026, 8, 1), true);
    assert.equal(isWeekdayAlignmentDirectionSafe(2026, 8, 30), true);
    assert.equal(isWeekdayAlignmentDirectionSafe(2026, 9, 1), true);
    assert.equal(isWeekdayAlignmentDirectionSafe(2026, 9, 31), true);
  });

  it("keeps a seven-column week grid for Arabic months", () => {
    assert.equal(countStructuralWeekCells(2026, 8) % 7, 0);
    assert.equal(countStructuralWeekCells(2026, 9) % 7, 0);
  });
});
