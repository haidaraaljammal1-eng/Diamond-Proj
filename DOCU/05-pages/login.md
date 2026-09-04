# Login Page

## Purpose

The Login page is the entry point for Diamond Rent Car office users to authenticate and access the system. It accepts email and password credentials and handles two-factor authentication when enabled.

## Route

- Arabic: `/ar/login`
- English: `/en/login`

## Visual Design

The Login page is implemented against the available Diamond visual values. Pixel-level parity requires the original Demo HTML/CSS and reference screenshot, which are not currently present in the repository.

- Diamond gradient color scheme (#d4a76a gold primary)
- Decorative SVG swash element
- Responsive layout for desktop, tablet, and mobile
- Fonts: Marcellus (title), IBM Plex Sans Arabic (body)
- Exit animation on successful login

## Architecture

```
LoginPage
  ↓
LoginScreen Component
  ↓
FormBuilder (React Hook Form + Zod)
  ↓
useLogin Hook
  ↓
Auth Zustand Store
  ↓
Auth API Layer
  ↓
Central API Client
  ↓
POST /auth/login (Backend)
```

## Backend Endpoint

**POST** `/auth/login`

Request body:

```typescript
{
  email: string;
  password: string;
}
```

Response (no 2FA):

```typescript
{
  data: {
    requiresTwoFactor: false;
    accessToken: string;
    refreshToken: string;
    tokenType: "Bearer";
    expiresIn: number;
    refreshExpiresAt: Date;
  }
}
```

Response (with 2FA):

```typescript
{
  data: {
    requiresTwoFactor: true;
    challengeToken: string;
    expiresIn: number;
  }
}
```

## Features

### Successful Login Flow

1. User enters email and password
2. Frontend validates and submits to `/auth/login`
3. Backend validates credentials
4. If successful (no 2FA required):
   - Store access token and refresh token in state
   - Apply exit animation (opacity fade)
   - Redirect to `/dashboard` after 600ms animation

### 2FA Challenge

When backend responds with `requiresTwoFactor: true`:

- Store `challengeToken` in auth state
- Flag that 2FA is required
- 2FA completion flow not yet implemented (future work)

### Error Handling

The page displays normalized error messages for:

- `UNAUTHORIZED`: "Invalid credentials"
- `ACCOUNT_SUSPENDED`: "Account is suspended"
- `NETWORK_ERROR`: "Network connection error"

All other errors show generic message.

### Accessibility

- Form inputs have proper `autocomplete` attributes
- Email field: `autocomplete="email"`
- Password field: `autocomplete="current-password"`
- Keyboard navigation fully supported
- Proper label semantics for screen readers

## Form State

- Email and password are owned by React Hook Form through FormProvider.
- Login field definitions live in `src/modules/auth/forms/login/login.fields.ts`.
- Login validation lives in `src/modules/auth/forms/login/login.schema.ts`.
- Values are submitted to `useLogin` and are not stored in Zustand.

## Shared UI

Login uses the shared Button, Input, FormError, and typed FormBuilder. Its diamond, corner decorations, logo placement, swash, and fullscreen composition remain in `login-screen.module.css`.

The shared Input preserves transparent fields with underline styling and handles `:-webkit-autofill` without disabling `autocomplete`. The username field uses `autocomplete="username"`; the password field uses `autocomplete="current-password"`.

## Files

- `src/modules/auth/components/login-screen/login-screen.tsx` - Main component
- `src/modules/auth/components/login-screen/login-screen.module.css` - Styles
- `src/app/[locale]/login/page.tsx` - Page route
- `src/modules/auth/hooks/use-login.ts` - Login hook
- `src/modules/auth/stores/auth.store.ts` - Auth state (updated)
- `src/modules/auth/api/auth.api.ts` - API layer (updated)
- `messages/ar.json` and `messages/en.json` - i18n messages
- `public/diamond-logo.svg` - Diamond logo asset

## Known Limitations / Future Work

- 2FA login completion page not yet implemented
- Dashboard placeholder may not exist yet (redirect target)
- Password reset flow not implemented
- Remember me / session persistence not implemented
- Forgot password link not included (per design requirement)

## Testing

Current checks:

- TypeScript strict mode: `npm run typecheck`
- ESLint: `npm run lint`
- Production build: `npm run build`

No Playwright visual baseline is checked in yet because the original Demo/reference screenshot is absent. Once supplied, `/ar/login` should be captured at its fixed reference viewport after fonts load and animations settle.

## Backend Compatibility

Preserves existing Backend authentication, authorization, roles, and permissions unchanged. Frontend acts as HTTP client to Backend auth endpoints only.
