# Frontend i18n Architecture

## Source of Truth

`next-intl` is the single source of truth for all user-facing translations in the Diamond Rent Car frontend.

## Locales

- `ar` — Arabic (default locale)
- `en` — English

The locale layout sets `lang` and `dir` on `<html>`:
- `ar` → `dir="rtl"`
- `en` → `dir="ltr"`

## Message Files

- `messages/ar.json`
- `messages/en.json`

Both files must remain structurally aligned. Every key present in one must exist in the other.

## Namespaces

Current namespaces:

| Namespace | Purpose |
| --- | --- |
| `Foundation` | Foundation page copy |
| `Login` | Login screen labels, hints, auth errors |
| `Navigation` | Sidebar rail labels |
| `Shell` | AppShell header/footer/controls |
| `Dashboard` | Dashboard placeholder |
| `validation` | Stable Zod validation message keys |
| `Password` | Password input reveal/hide labels |
| `Select` | Shared Select placeholders and empty state |
| `Users` | Staff page copy and user form labels |

## Navigation Translation Rule

Navigation config stores **namespace-local** keys, not already-prefixed keys.

```ts
// navigation.config.ts
{
  key: "dashboard",
  labelKey: "dashboard", // not "navigation.dashboard"
  href: "/dashboard",
}
```

`useNavigation()` translates labels inside the hook using `useTranslations("navigation")`. The Sidebar receives final text and never calls `useTranslations` for item labels.

```ts
// use-navigation.ts
const t = useTranslations("navigation");
// ...
label: t(item.labelKey)
```

`SidebarItem` receives `label: string` and is render-only.

## Validation Error Flow

Zod schemas must return **stable message keys**, never raw Zod defaults.

```ts
// login.schema.ts
email: z.string().trim().min(1, { message: "required" }),
password: z.string().min(1, { message: "required" }),
```

`validation` namespace in messages:

```json
{
  "validation": {
    "required": "This field is required"
  }
}
```

`FormError` is the central translator for validation errors:

```ts
const t = useTranslations("validation");
return <p role="alert">{t(message)}</p>;
```

No raw Zod messages like `Too small: expected string to have >=1 characters` are rendered to the user.

## Backend Error Translation

Backend/auth errors are **not** translated through the `validation` namespace.

`useLogin` stores stable error codes (e.g. `UNAUTHORIZED`, `ACCOUNT_SUSPENDED`, `NETWORK_ERROR`). The Login screen maps these codes to `Login.error.*` translation keys.

Unknown backend codes fall back to `Login.error.generic`.

## Language Switch

The AppHeader language toggle preserves the current route when switching locales:

```
/ar/dashboard → /en/dashboard
```

It does not redirect to `/` or lose the authenticated session.

## RTL / LTR

Direction is set once at the locale layout level:

```tsx
<html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
```

No page or component hardcodes `dir="rtl"`.

## Type Safety

- `NavigationTranslationKey` — union of all navigation label keys.
- `ValidationMessageKey` — union of all validation message keys.
- No `any`, `as any`, or `@ts-ignore` is used for i18n typing.

## No Raw Keys Rule

No translation key may be rendered directly to the user. If a key is missing in development, next-intl surfaces the issue; in production, the UI must not show raw keys like `navigation.dashboard`.

## Stores

Zustand stores must not contain translated strings or translator functions. i18n belongs to the UI/hook layer only.

## Key File Paths

- `messages/ar.json`, `messages/en.json`
- `src/infrastructure/i18n/routing.ts`
- `src/infrastructure/i18n/request.ts`
- `src/modules/navigation/navigation.config.ts`
- `src/modules/navigation/navigation.types.ts`
- `src/modules/navigation/hooks/use-navigation.ts`
- `src/shared/layouts/app-shell/sidebar/sidebar.tsx`
- `src/shared/layouts/app-shell/sidebar/sidebar-item.tsx`
- `src/shared/components/ui/form-error/form-error.tsx`
- `src/modules/auth/forms/login/login.schema.ts`
