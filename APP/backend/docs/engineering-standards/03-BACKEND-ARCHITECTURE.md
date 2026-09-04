# Backend Architecture

## Boot chain

`src/server.ts` → `buildApp()` in `src/app.ts` → `registerPlugins` in `src/plugins/index.ts` → `autoloadPlugin` mounts routes.

`app.ts` builds the Fastify instance, installs the zod validator/serializer compilers, sets an `onRequest` hook that resolves the request language, and registers the global error and not-found handlers.

## Plugin order (explicit)

`prisma → cors → rate-limit → helmet → body-parsers → cookies → jwt → multipart → capabilities → settings → mailer → notifications → [dev: swagger] → audit → autoload`.

Infrastructure first, then service decorators, then (dev) OpenAPI, then the audit writer, then routes. `autoload` is last so all decorators/hooks exist when handlers run. Plugins are `fastify-plugin`-wrapped so their decorators cross encapsulation into route contexts.

## Modules and routes

```
src/modules/<feature>/
  <feature>.schema.ts     # zod request/response schemas
  <feature>.service.ts    # business logic (pure of HTTP concerns)
  <feature>.mapper.ts     # DB → public shape (optional)
  routes/<accessLevel>/route.ts
```

`<accessLevel>` ∈ `public | user | admin`. The autoloader strips the `routes/` and access-level folders from the URL:

- `modules/auth/routes/public/route.ts` → `/auth/...`
- `modules/users/routes/admin/route.ts` → `/users`

Each access level runs in its own encapsulated context with its auth hook applied first (`src/services/roles/<level>/hook.ts`). Authenticated levels apply `verifyToken` then `enforcePermissions`.

## Route handler contract

A handler does exactly: **validate (via schema) → delegate to a service → return `{ data, meta? }`.** No business logic, no direct unguarded Prisma writes, no manual permission checks.

## Prisma

Schema is split by concern across `prisma/schema/*.prisma` (merged automatically). `schema.prisma` holds only the generator + datasource. The `zod` generator emits `src/schemas/zod`. Run `npm run db:generate` after any schema edit. Secret hashes are globally omitted in `src/plugins/prisma.ts`.

## Adding an access level

Create `src/services/roles/<name>/hook.ts` and register it in `src/plugins/autoload.ts`. Place routes under `routes/<name>/`.
