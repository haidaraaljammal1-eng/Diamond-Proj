# Home Dashboard Page

The Demo `vDash()` view: KPI tiles, the latest contracts list and Quick Access,
with the Demo owner/employee split. **UI phase only** — see “Data source”.

## Route

| Locale | URL             |
| ------ | --------------- |
| ar     | `/ar/dashboard` |
| en     | `/en/dashboard` |

Navigation key: `dashboard`.

## Required permissions

| Permission       | Used for                                    |
| ---------------- | ------------------------------------------- |
| `dashboard.read` | Page access (a viewer without it sees a notice) |

The owner view (office-wide sections, the contracts shortcut, the “from all
staff” chip and the issuing employee on each row) is the Demo `adminonly`
behavior: the session must carry the `system_admin` role.

## Data source — Demo fixtures, not the Backend

The Backend has **no Diamond rental domain** yet: there is no `Contract`,
rental link, fleet status, invoice, maintenance or WhatsApp model, and the
existing `GET /dashboard/overview` aggregates the template's complaints /
call-center KPIs, none of which belong to this page.

So the page renders the Demo's own records:

- `src/modules/dashboard/data/dashboard.demo-data.ts` — the Demo `CARS`, `EMP`,
  `CONTRACTS` (after `seedOpsDemo()`) and the `CHATS` unread total, verbatim.
- `src/modules/dashboard/utils/dashboard.selectors.ts` — pure derivations, the
  same ones `vDash()` performs. Unit-tested against the Demo's numbers.
- `src/modules/dashboard/hooks/use-dashboard-overview.ts` — the single UI
  facade. **Wiring the Backend later changes this file only**: return the same
  `DashboardOverview` from the API instead of the fixtures.

`types/dashboard.types.ts` is the contract the Backend must satisfy.

Two deliberate deviations from the Demo:

- The greeting uses the session user's name (the Demo hardcodes one).
- The Demo forces “pending links” to a minimum of 1 (`|| 1`); we report the real
  count.

## Sections

| Section              | Content                                                             |
| -------------------- | ------------------------------------------------------------------- |
| KPI tiles            | Active contracts · Fleet rented/total · Pending links · Deliveries today |
| Latest contracts     | 5 newest, customer · vehicle, contract number, issuing employee, status chip |
| Quick Access         | Vehicles · Contracts (owner) · GPS · Maintenance · Office WhatsApp   |
| This week            | Revenue vs expense bars + the net line, last 7 days (Recharts)       |
| Expense structure    | 7-day spending by category as a donut with values and shares        |
| Today hand-overs     | Contracts due today: customer · vehicle, slot, number, status chip  |
| Fleet status         | Rented / available / in maintenance, with the utilization rate      |

The 4th KPI, the GPS/Maintenance shortcuts and the whole second row (today's
hand-overs + fleet status) are Diamond additions on top of the Demo view; they are derived from the same
fixtures and are expected to be re-pointed at real data with everything else.

Every action targets a page that does not exist yet, so — like the rail's own
action items — the controls render disabled with the shell's
`Shell.navigationActionNote` note. Contract rows are not clickable for the same
reason (no contract drawer yet), so they carry no hover affordance.

## Shared components introduced by this page

Built here, owned by `src/shared/components/ui`, and meant for Ops Center,
Finance, Fleet and the rest:

| Component     | Demo origin | Used for                                       |
| ------------- | ----------- | ---------------------------------------------- |
| `StatCard`    | `.kpi`      | Any KPI tile (label, value, suffix, delta note) |
| `ListRow`     | `.lrow`     | Icon + title + meta + trailing rows             |
| `ActionTile`  | `.qa`       | Shortcut tiles with icon, meta, count badge     |
| `Chip`        | `.chip`     | Status chips with the diamond dot (`ok/warn/bad/gold`) |
| `EmptyState`  | `.ops-empty`| “Nothing here yet” blocks                       |
| `Card.Title`  | `.card h3`  | Card heading with gold icon + end slot          |
| `Button` `sm` | `.btn.sm`   | 31px action inside cards and rows               |
| `TrendChart`  | Demo finance | Bars + net line on one shared value axis        |
| `DonutChart`  | Demo finance | Parts of a whole with a total in the ring       |

`Badge` stays the rounded role pill (Users); `Chip` is the Demo status chip.

## Fixed along the way

`GET /auth/me` returns roles as objects (`{id, key, name}`) while the session
type declared `string[]`, so `roles.includes("system_admin")` was always false:
the owner was shown the employee shell everywhere. The session now stores role
**keys** (`src/auth.ts`), and `AuthUser.roles` is typed `BackendRole[]`.

## Charts

`recharts@3` renders both charts; the Diamond chart tokens live in
`src/shared/components/charts/chart-theme.ts`.

- Series colors are `#B98A3E` (revenue) and `#A8433C` (expense) — validated on
  the white card surface: lightness band, chroma floor, CVD separation
  (ΔE 14.9 deutan / 16.6 tritan), normal-vision separation (ΔE 18.1) and
  ≥3:1 contrast all pass. The UI gold `#C9A15C` FAILS chroma and contrast as a
  data mark, so it is never used to fill one.
- The net is a neutral 2px line (a different mark), not a third hue, and both
  charts carry a legend plus direct values — identity never rests on color.
- One value axis only; the donut uses a single-hue gold ramp, light → dark.
- Numbers are Latin digits, LTR, formatted in `utils/money.ts`.

The app ships light-only (Pearl Ivory), so no dark-mode palette is defined; if a
dark theme lands, re-validate these colors against the dark surface.

## Tests

`src/modules/dashboard/utils/dashboard.selectors.test.ts` — asserts the Demo's
numbers (4 active / 3 ongoing, 4 of 12 rented, 2 pending links, 11 contracts,
3 unread, the 5 recent contract ids in order) and the employee scope.
