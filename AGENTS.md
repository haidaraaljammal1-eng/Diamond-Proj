# Diamond Rent Car Workspace Instructions

- The project root is `DIAMOND-SYSTEM`.
- All application code lives inside `APP`.
- The approved backend exists only at `APP/backend`.
- The approved frontend exists only at `APP/frontend`.
- Central project documentation lives inside `DOCU`.
- Before implementing any feature, read the documentation related to it in `DOCU`.
- The Demo and its analysis are the source of truth for Diamond's frontend behavior.
- The Fastify backend inside `APP/backend` is the approved backend template; preserve its architecture.
- Do not create a new or independent backend outside `APP/backend`.
- Do not create another frontend outside `APP/frontend`.
- Do not invent features or workflows that are not present in the Demo unless the user explicitly requests them.
- If the Demo conflicts with the documentation, stop and report the conflict instead of guessing.
- Preserve the existing Authentication, Authorization, Roles, and Permissions in the backend template.
- Any new module must follow the architecture that already exists in the backend.
- Do not modify the backend foundation unless there is a clear need and explicit approval.
- Keep backend-specific operational documentation under `APP/backend/docs`.
- Keep documentation shared by the Diamond backend and frontend under `DOCU`.
- Every new Diamond workflow or feature must create or update concise documentation under `DOCU`. Documentation must remain proportional to the feature and no single documentation file may exceed 500 lines. Large topics must be split into smaller linked documents.
- UI must use domain hooks and must not call stores or APIs directly.
- Stores own API-backed domain state, while the API layer owns HTTP calls.
- TypeScript strict mode is required for the frontend.
- Lookup APIs, stores, and hooks remain separate when the Backend permission or API is separate.
- Do not implement behavior outside the Diamond Demo.
- Diamond Demo is the visual source of truth.
- Reusable UI uses shared components, and standard forms use the shared FormBuilder.
- Every dropdown uses the shared Diamond Select (`src/shared/components/ui/select`); a native `<select>` is never used. In forms use `SelectField` or the FormBuilder `select` field type. See `DOCU/00-system-overview/ui-select.md` and the `diamond-select` skill.
- FormBuilder is powered by React Hook Form and Zod and never performs API calls.
- Pages and components use domain hooks rather than calling APIs or Zustand stores directly.
- Roles and permissions always come from the Backend; RBAC data is never hardcoded in the frontend.
- Permission matrix rows represent backend permissions and columns represent backend roles.
- Frontend permission visibility is UX only; the Backend remains the authorization authority.
- Dialogs use the shared Dialog (`src/shared/components/ui/dialog`) with FormBuilder inside; overlays are portalled to `<body>`.
- Every checkbox uses the shared Diamond Checkbox (`src/shared/components/ui/checkbox`).
- Form values are not duplicated in Zustand; lookup fields use dedicated lookup hooks/APIs when available.
- Page-specific decorative layouts stay inside their feature.
- Reusable card surfaces must use the shared Card component (`src/shared/components/ui/card`).
- Domain cards compose Shared Card instead of recreating generic card CSS.
- Every toggle switch uses the shared Switch (`src/shared/components/ui/switch`); do not recreate switch CSS in feature modules.
- Users data must come from Backend APIs; never from Demo mock EMP data.
- Current authenticated user comes from Auth infrastructure, not Users Store.
- User forms must use the shared FormBuilder.
- Do not invent User fields that are absent from Backend contracts.
- No documentation file may exceed 500 lines.

## Frontend i18n Rules

- `next-intl` is the single source of truth for all user-facing text.
- No raw translation key may be rendered to the user.
- Navigation config stores namespace-local keys (e.g. `dashboard`), not already-prefixed keys (e.g. `navigation.dashboard`), when `useTranslations("navigation")` is used.
- `useNavigation()` is responsible for translating labels; the Sidebar receives final text.
- Zod schemas must use stable validation message keys, never raw Zod defaults.
- Shared `FormError` translates validation keys through the `validation` namespace.
- Stores must not contain translated UI strings or translator functions.
- Backend errors should be translated from stable error codes, not raw backend messages.
- `ar.json` and `en.json` must remain structurally aligned.

## AppShell / Protected Shell Rules

- All protected Diamond pages must use the shared AppShell (`src/shared/layouts/app-shell`).
- Pages must not recreate the Sidebar or the App Header.
- Navigation definitions must be centralized and typed (`src/modules/navigation`).
- Active navigation state must come from routing, not duplicated Zustand state.
- AppShell Zustand state is UI-only (mobile drawer).
- Authentication and permissions must not be duplicated in AppShell state.
- Diamond Demo is the visual source of truth for AppShell.
- Do not implement page content while working on the Shell unless explicitly requested.
