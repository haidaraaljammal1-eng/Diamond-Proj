# Fastify Backend — Architecture Summary

## Stack

- Fastify 5
- TypeScript
- Prisma 7
- PostgreSQL
- Zod
- Pino/Fastify logging

## Core Request Flow

```text
HTTP Request
→ Fastify Route
→ Authentication عند الحاجة
→ Zod Validation
→ Permission Check
→ Route Handler
→ Service
→ Prisma
→ Database
→ Response Serialization
→ Audit عند الحاجة
```

There is no generally mandated Controller Layer or Repository Layer.

## Module Structure

The current pattern is:

```text
src/modules/<feature>/
```

Modules commonly contain:

- schema
- service
- routes

Routes are organized by access level:

- public
- user
- admin
- external

## Authentication

- Access Token is a short-lived JWT.
- Refresh Token is an opaque token stored hashed in the database.
- The JWT contains identity and a session reference, not the complete permissions set.
- Users, Roles, and Permissions are reloaded from the database on protected requests.
- 2FA exists.
- Logout revokes the current session.

## Authorization

```text
User
→ Role
→ Permissions
→ Route Permission Check
→ Service-level resource checks عند الحاجة
```

- RBAC already exists.
- Do not create a new Diamond permissions system.
- Permissions are checked in the Backend, not trusted to the Frontend.
- The template's branch/department scoping is not general Multi-Tenancy.

## Business Logic

- Business Logic belongs primarily in Services.
- Services use Prisma directly.
- Do not create a Repository Layer merely because it is a familiar pattern.

## Database Rules

- Prisma and PostgreSQL are used.
- Multi-write operations use transactions.
- Concurrency-sensitive operations use existing patterns such as advisory locks, CAS, or idempotency when needed.
- Do not change this architecture without an explicit reason.

## Validation & Errors

- Zod is the primary request/response contract.
- Errors use a structured error envelope.
- Clients depend on stable error codes, not error text.

## Security Invariants

- Authentication is backend-controlled.
- Authorization is backend-controlled.
- Secrets must not appear in responses.
- Sensitive routes require permissions.
- Sensitive writes require audit when the existing pattern calls for it.
- The Frontend is not trusted for business rules.

## Diamond Development Rule

Any new Diamond module must follow the Backend's existing architecture.

Do not:

- Create a second Backend.
- Create new Authentication.
- Create Roles or Permissions outside the existing pattern.
- Add a new Repository/Controller architecture by default.
- Change the foundation because of personal preference.

## Known Important Limitations

- No Redis.
- No Queue/BullMQ.
- Scheduler runs inside the process.
- Rate limiting is per instance.
- Files currently use local storage.
- No general Multi-Tenancy.
- Audit is best-effort on some paths.

These limitations are not being fixed in this documentation step.
