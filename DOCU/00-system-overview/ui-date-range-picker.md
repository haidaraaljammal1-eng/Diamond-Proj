# Diamond Date Range Picker

Shared explicit-apply date range control for Diamond filter toolbars and future Finance / Reports pages.

## Location

`APP/frontend/src/shared/components/ui/date-range-picker/`

- `date-range-picker.tsx` — UI (trigger, popover, calendar, footer)
- `date-range-picker.utils.ts` — calendar-date parse/format, presets, apply rules
- `date-range-picker.module.css` — Diamond styling (no default DayPicker theme)
- Composes Shared `Popover` and Shared `Button`

## Engine

**React DayPicker v9** (`react-day-picker@^9`) is the calendar engine only. All visual identity comes from Diamond CSS modules and design tokens (`--diamond-gold`, `--diamond-hair`, ivory surfaces, etc.).

Do **not** import `react-day-picker/style.css`.

## API boundary

Controlled, domain-agnostic props:

```tsx
<DateRangePicker
  value={{ from: "2026-09-01", to: "2026-09-30" }}
  locale="en"
  labels={…} // translated strings from the page
  onApply={(range) => …}
  onClear={() => …}
/>
```

- `value.from` / `value.to` are `YYYY-MM-DD` strings or `""`.
- The component does not call APIs or read Zustand.
- Draft selection lives inside the popover until **Apply**.
- **Clear** resets draft + calls `onClear`.
- Apply is disabled until both ends of the range are selected and `from <= to`.

## Localization

User-facing strings use the `DateRangePicker` next-intl namespace (`apply`, `clear`, `presets.*`, `daysSelected`, etc.). Field label stays in the feature namespace (e.g. `Contracts.filters.dateRange`). `daysSelected` is a formatter function receiving `count` (pass `{ count }` to next-intl at the call site).

Display formatting uses `Intl.DateTimeFormat` (`Sep 1, 2026` / `1 سبتمبر 2026`). API serialization stays `YYYY-MM-DD`.

## Date-only rule

Calendar dates must not shift across timezones:

- `parseCalendarDate("2026-09-01")` → local `Date` via year/month/day fields
- `formatCalendarDate(date)` → `YYYY-MM-DD` from local fields
- Never use `toISOString().slice(0, 10)` for filter serialization

`buildContractsQuery` in Contracts converts `YYYY-MM-DD` to Backend ISO instants.

## Layout

| Viewport | Months shown |
| -------- | ------------- |
| `≥ 769px` | 2 (side by side, max 2) |
| `< 769px` | 1 |

Desktop layout is a bounded CSS grid: **Quick Select | Month 1 | Month 2**. Each month is `minmax(0, 1fr)` inside the calendar area; the month table uses `table-layout: fixed` and seven equal columns so neither month can overflow horizontally. RTL/LTR follows document `dir`; layout uses logical properties only.

### Outside days

- `showOutsideDays={false}` and `fixedWeeks={false}`.
- Month grids show **only that month's dates** (e.g. September `1–30`, October `1–31`).
- Outside-day **numbers are hidden** via DayPicker's `hidden` modifier — never `display: none` on day cells (that collapses the 7-column grid).
- Leading/trailing cells before day 1 and after the last day stay **empty placeholders** to preserve weekday alignment.
- Cross-month ranges (e.g. Sep 28 → Oct 4) still highlight correctly in each month grid.

### Calendar grid integrity

- DayPicker owns weekday/date mathematics; CSS must never manually shift dates (`margin`, `translate`, `nth-child`, etc.).
- Every week row preserves **seven structural column positions**.
- RTL/LTR affects component direction and navigation presentation only — not the internal weekday column math.

### Navigation

- Built-in DayPicker month navigation is hidden (`hideNavigation`).
- One **Previous / Next** pair sits on the **outer edges** of the calendar area (not between months).
- Chevron icons mirror for RTL; semantics remain month − 1 / month + 1.
- Month titles stay centered inside each month block.

Quick presets: Today, Last 7/30 Days, This Month, Last Month, Custom.

## Reuse

First consumer: Contracts filters (`contract-filters.tsx`). Future Invoices, Finance, Violations, Operations, and Reports should reuse this component — no page-specific calendar CSS.

## Tests

`date-range-picker.utils.test.ts` — serialization, presets, apply rules, RTL display helpers.

`date-range-picker.calendar.utils.test.ts` — month grid day counts, outside-day config, cross-month range.

Contracts integration: `contract-date-range.integration.test.ts`.
