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

Shared UI components do not know about APIs, Zustand, routing, or business permissions. Pages use domain hooks as their UI facade.

## Form Builder

`FormBuilder<T>` is a typed developer abstraction over React Hook Form. A feature supplies a discriminated field configuration, a Zod schema, default values, translated submit labels, and an `onSubmit` callback. `FormProvider` exposes the form context to field components. Fields use `Controller` where they need to bind shared controls.

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
