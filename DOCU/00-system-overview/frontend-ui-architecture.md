# Frontend UI Architecture

## Source of Truth

The Diamond HTML Demo is the visual source of truth. Its original HTML, complete CSS cascade, and reference screenshots must be available before claiming pixel-level visual parity. The repository currently contains no original Demo HTML or reference screenshot, so values used by the current Login implementation are the documented existing Diamond values.

## Shared Foundation

- `src/styles/tokens.css` contains the extracted Diamond palette and typography tokens.
- `src/styles/reset.css` only removes browser defaults that can alter controls.
- `src/styles/globals.css` imports the tokens and reset and owns body defaults.
- Reusable controls live under `src/shared/components/ui`.
- Standard forms use `src/shared/components/forms`.
- Every dropdown uses the shared Diamond Select; native `<select>` is not used
  anywhere in the system. See [Diamond Select](./ui-select.md).
- Password fields use the shared `PasswordInput`
  (`src/shared/components/ui/password-input`). Inside a form, use `PasswordField`
  or the FormBuilder field type `password`. New-password rules live in
  `src/shared/validation/password.ts` (stable `validation.*` keys).

- `src/shared/components/ui/page-header` is the shared page title/breadcrumb
  block (Demo `.vhead`); pages do not re-implement that CSS.
- `src/shared/components/ui/card` is the shared card surface (Demo `.emp` /
  art-deco brackets). Domain cards (UserCard, VehicleCard, …) compose it
  instead of duplicating borders, radius, shadows and hover.
- `src/shared/components/ui/stat-card` is the shared KPI tile (Demo `.kpi`),
  `list-row` the icon/title/meta row (Demo `.lrow`), `action-tile` the shortcut
  row (Demo `.qa`), `chip` the status chip with the diamond dot (Demo `.chip`)
  and `empty-state` the empty block (Demo `.ops-empty`). `Card.Title` is the
  card heading (Demo `.card h3`). Pages compose these instead of re-styling
  them; see `DOCU/05-pages/dashboard.md`.
- `Badge` remains the rounded role pill; the Demo status chip is `Chip`.
- UI glyphs come from Iconify through `src/shared/components/ui/icon` (`<Icon name="mdi:…" />`).
  Feature code never inlines an SVG and never puts an emoji in a translation string.
  The Demo rail artwork in `modules/navigation/navigation.icons.tsx` is the one
  deliberate exception. Icon data is fetched from the Iconify API at runtime and
  cached in the browser; an offline bundle can replace it if the deployment forbids that.
- `Chip` takes `solid` for chips over photography — an opaque tinted surface
  instead of the translucent default.
- Charts use `recharts` through `src/shared/components/charts` (`TrendChart`,
  `DonutChart`) with the validated Diamond chart palette in `chart-theme.ts`.
  Feature code never picks chart colors itself.
- `src/shared/components/ui/switch` is the shared toggle switch (Demo
  `.switch`). Use it for every on/off control; the ON state uses the primary
  gold palette — feature modules must not recreate switch styling.

Shared UI components do not know about APIs, Zustand, routing, or business permissions. Pages use domain hooks as their UI facade.

## Tabular Data

There is no shared DataGrid, and none is planned until a second page needs one.
Genuinely tabular data uses a semantic `<table>` inside the feature (see the
Roles permission matrix, `DOCU/05-pages/roles-permissions.md`), with sticky
header/first column and scrolling contained in the table card so the page never
scrolls horizontally. When a second page needs the same behavior, extract
`Table`/`TableRow`/`TableCell` primitives instead of duplicating the CSS.

## Frontend Tests

Unit tests run on the Node test runner with native TypeScript type stripping
(`npm test` in `APP/frontend`). Tests are colocated as `*.test.ts` next to the
pure module they cover and import relative paths with the explicit `.ts` extension
(required by the Node ESM resolver; `allowImportingTsExtensions` is enabled for
that reason). React component tests are not wired yet.

Playwright visual regression for protected pages lives under `APP/frontend/e2e/`
(`npm run test:e2e`). Set `PLAYWRIGHT_LOGIN_EMAIL`, `PLAYWRIGHT_LOGIN_PASSWORD`,
and optionally `PLAYWRIGHT_BASE_URL` before running; without credentials the
Users screenshot spec is skipped.

## Form Builder

`FormBuilder<T>` is a typed developer abstraction over React Hook Form. A feature supplies a discriminated field configuration, a Zod schema, default values, translated submit labels, and an `onSubmit` callback. `FormProvider` exposes the form context to field components. Fields use `Controller` where they need to bind shared controls. Field types: `text`, `email`, `password`, `select`.

The builder owns form setup, schema resolution, field rendering, submit state, and layout order. It does not call APIs, interpret backend errors, show toasts, or perform routing. Form state is transient and is never copied into Zustand.

Zod schemas define frontend validation compatible with the backend contract. User-facing messages remain in the feature translation layer; backend/auth failures remain form-level errors.

## Request Flow

```text
Page / Screen -> Domain Hook -> Zustand Store -> Domain API -> Central API Client -> Backend
```

Authentication keeps its existing Auth.js/NextAuth credentials flow to the Fastify `/auth/login` endpoint. LoginScreen submits through `useLogin`; it does not call NextAuth or the backend directly.

Lookup fields must use a dedicated domain lookup hook and endpoint when the backend exposes one. Generic FormBuilder does not know users, vehicles, contracts, or other domains.

## CSS Organization

Tokens and browser normalization are global. Shared Button/Input styles are colocated with their components. Feature-specific visual composition, including Login decorations, remains in the feature CSS module. Raw buttons and styled inputs are not used when the shared primitive provides the needed behavior.

## Visual Regression

Reference visual tests should run with fixed viewport, loaded fonts, and stable animations. A Playwright baseline must be generated from the original Demo/reference image, not from an approximation. Until that source is added to the repository, no trustworthy baseline is checked in.
