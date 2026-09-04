# Engineering Standards

These standards are **generic and product-agnostic**. They were distilled from a production Fastify backend and are the authoritative reference for building on this starter. Read them before non-trivial work.

> Provenance: this pack was authored for the starter itself (it is not a copy of an external audit). Where a rule exists because a reference implementation got it wrong, that is called out in `KNOWN-LIMITATIONS.md`.

## Index

| Doc | Topic |
| --- | --- |
| `01-ARCHITECTURE-PRINCIPLES.md` | Core principles the whole codebase follows |
| `03-BACKEND-ARCHITECTURE.md` | Boot chain, plugins, module + route conventions |
| `07-API-CONTRACT-STANDARD.md` | Contract-first / OpenAPI, response envelope, pagination |
| `08-ERROR-UX-STANDARD.md` | Structured errors, stable codes, guided conflicts |
| `09-PERMISSIONS-AND-RBAC.md` | RBAC model + automatic permission enforcement |
| `13-AUDIT-LOG-STANDARD.md` | What to audit and how |
| `15-TRANSACTIONS-CONCURRENCY-IDEMPOTENCY.md` | Atomicity, advisory locks, idempotency |
| `19-SECURITY-BASELINE.md` | Passwords, tokens, files, rate limiting, logging |
| `24-DEFINITION-OF-DONE.md` | The checklist a change must pass |
| `KNOWN-LIMITATIONS.md` | Intentional scope boundaries + residual limitations |

## The one-paragraph summary

The backend is the single source of authority for authentication, authorization, and validation. Every route is contract-first (zod → OpenAPI). Permissions are enforced automatically from route metadata — never by hand. Passwords are argon2id, never plaintext. Multi-step writes are transactional; concurrency-sensitive ones take advisory locks; external side effects are idempotent. Errors are structured with stable codes. Sensitive changes are audited; secrets are never logged.
