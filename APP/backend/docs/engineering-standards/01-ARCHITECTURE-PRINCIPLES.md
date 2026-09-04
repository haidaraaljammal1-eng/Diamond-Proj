# Architecture Principles

1. **Backend is the authority.** Authentication, authorization, and validation are enforced server-side. The frontend may mirror rules for UX, but is never trusted.
2. **Secure by default.** The safe path is the default path. A route with no explicit `public: true` and no permission is still authenticated; making something public or unguarded requires an explicit, visible choice.
3. **Contract-first.** Every endpoint is described by a zod schema that generates OpenAPI. The generated client is derived from the contract; no hand-written wire types.
4. **Stable machine contracts, localized humans.** Clients branch on stable `code`/enum values. Human-facing text is localized and never load-bearing for logic.
5. **Source of truth per concept.** Each concept (session, permission, setting, notification) has exactly one model. No duplicate representations.
6. **Explicit over implicit.** Plugin order, access levels, and permissions are explicit and greppable.
7. **Do only what was asked.** No scope creep, no speculative abstractions, no fake endpoints or mock data.
8. **Fail fast at the edges, degrade gracefully in the middle.** Invalid configuration crashes startup; a failed best-effort side effect (email, audit) is logged but does not break the core transaction.
9. **Read-only hot paths.** Authentication reads identity; it does not write on every request. Incidental writes (lastSeen) are throttled and non-blocking.
10. **No business domain in the foundation.** The starter stays generic; product entities live in product modules.
