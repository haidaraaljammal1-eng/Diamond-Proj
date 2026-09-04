# 14 — Root Cause Analysis

41 catalogued deviations, each assigned a primary root cause. IDs are referenced by
`18-PRIORITIZED-FIX-BACKLOG.md`.

| Root cause | Count | Share |
| --- | --- | --- |
| **E. AUTOMATION_GAP** | 14 | 34% |
| **C. STARTER_CAPABILITY_GAP** | 9 | 22% |
| **D. DOCUMENTATION_GAP** | 7 | 17% |
| **G. LEGACY_PATTERN_LEAK** | 4 | 10% |
| **F. ARCHITECTURE_AMBIGUITY** | 4 | 10% |
| **A. AGENT_NON_COMPLIANCE** | 2 | 5% |
| **I. DOMAIN_COMPLEXITY_GAP** | 1 | 2% |
| **B. STARTER_DISCOVERABILITY_GAP** | 0 | 0% |
| **H. PROMPT_OR_CONTEXT_PRESSURE** | 0 | 0% |

---

## A. AGENT_NON_COMPLIANCE — 2

*The rule was explicit, discoverable, and a working pattern existed. It was not followed.*

| ID | Deviation | Evidence | Why this is A and not C/D/E |
| --- | --- | --- | --- |
| A-1 | SLA evaluation and auto-escalation perform 3–8 related writes with no transaction | `complaints.service.ts:1061-1109` | `withTransaction` is used 60× **in the same file's sibling functions**; `CLAUDE.md`, `AGENTS.md:12` and `15-TRANSACTIONS…` all state the rule. Nothing was missing but the habit — background code, written outside the request mindset. |
| A-2 | `prisma.notification.create` called directly instead of `fastify.notify.send`, discarding preferences, dedupe and the delivery log | `call-center.service.ts:583`, `public-surveys.service.ts:501` | Partially mitigated: `notify`'s EMAIL channel is a stub (that part is C). But both call sites already held the resolved `userIds` and could have called `notify.send({ userIds, dedupeKeyPrefix })` in one line. |

**Only 2 of 41.** That is the most important number in this analysis: the agents followed the written
rules. Blaming execution would produce the wrong V2.

## B. STARTER_DISCOVERABILITY_GAP — 0

No case was found where a helper existed, covered the need, and was simply not found. `src/lib/` is
small (23 files), every helper carries a docblock stating its purpose and its anti-pattern, and
`README.md` + `AGENTS.md` name them. **Discoverability is not this template's problem.**

## C. STARTER_CAPABILITY_GAP — 9

*The shared pattern did not cover the required case, so the domain built its own.*

| ID | Deviation | The missing capability |
| --- | --- | --- |
| C-1 | `complaint-attachments.service.ts` re-implements file upload/download | `files.service` has no ownership/scope hook and no signed short-lived download token |
| C-2 | `ProviderRegistry` replaces `fastify.mailer` for all domain email | `mailer` supports one static 2-key template registry, one channel, no delivery ledger, no per-language DB templates |
| C-3 | `complaint-notifications.ts` builds a durable per-recipient email outbox | `fastify.notify`'s EMAIL channel is a documented stub returning `SKIPPED "no template bound"` |
| C-4 | Two direct `Notification` inserts | `notify` has no audience-resolver seam; callers must resolve then call, and nothing guides them |
| C-5 | `reports.config.ts` and `ComplaintNotificationSetting` bypass `fastify.settings` | no typed/grouped settings registry, no matrix settings, no caching |
| C-6 | 18 route-shell modules | the autoload convention derives the URL prefix from the directory name — a module cannot own two URL prefixes |
| C-7 | `quick-send.create` hand-rolls a saga with compensation and `resultRef` | `runIdempotent` leaves poison keys on failure and returns no stored result |
| C-8 | 5 hand-rolled export endpoints | no `exportEndpoint()` helper (permission + scope + audit + rate limit + streaming + binary schema) |
| C-9 | Sequence numbering re-derived per domain | no `sequence()` helper; each domain invents `@@unique([parent, number])` |

## D. DOCUMENTATION_GAP — 7

*No instruction or reference existed, or the existing one is now false.*

| ID | Deviation | Evidence |
| --- | --- | --- |
| D-1 | `KNOWN-LIMITATIONS.md:34` says "**Scheduler** — none is shipped"; one is shipped and **on by default** | vs `src/plugins/scheduler.ts`, `env.SCHEDULER_ENABLED: envBool(true)` |
| D-2 | `KNOWN-LIMITATIONS.md:22` says 2FA is "intentionally not included"; it is fully implemented (496 lines) | vs `src/modules/auth/two-factor.service.ts` |
| D-3 | `README.md:51` documents `db:deploy` as "prod: prisma migrate deploy"; the script begins with `prisma migrate reset --force` | `package.json:24` |
| D-4 | **9 of the 18 standards files referenced by the task do not exist**: `04-FEATURE-FOLDER-STANDARD`, `12-NOTIFICATION-STANDARD`, `14-DATA-INTEGRITY…`, `16-IMPACT-REPORTS…`, `20-FILES-AND-ATTACHMENTS`, `21-SETTINGS-AND-CONFIGURATION`, `22-ENGINEERING-LESSONS-LEARNED`, `23-NEW-PROJECT-CHECKLIST`, `PROJECT-BOOTSTRAP-INSTRUCTIONS` | `ls docs/engineering-standards/` → 11 files |
| D-5 | The entire standards pack is **363 lines** (12–45 lines per file) — principles without patterns, no code, no import paths, no reference implementations | `wc -l docs/engineering-standards/*.md` |
| D-6 | No rule states "never write `Notification` rows outside the notifications module" / "never build an SMTP transport outside the mail layer" | grep across `CLAUDE.md`, `AGENTS.md`, standards |
| D-7 | No documented rule for when a `revision` (optimistic concurrency) column is required; implemented in `complaints` only | see `07 §6` |

D-4 and D-5 together are the deepest documentation finding: **the "Engineering Standards Pack" this
project was supposedly built from is half-missing and, where present, is an aphorism list.** The
agents did not ignore the standards — for most of the areas that drifted, there were no standards.

## E. AUTOMATION_GAP — 14

*A check, CI job or lint rule should have made the mistake impossible.*

| ID | Deviation | The check that was missing |
| --- | --- | --- |
| E-1 | `db:deploy` starts with `prisma migrate reset --force` | script-content assertion |
| E-2 | Demo seed defaults **ON** in every environment incl. production | seed-safety check: demo data must be opt-**in** |
| E-3 | `files` download/delete has no ownership filter | ownership-check lint + a test that a second user gets 403 |
| E-4 | Two `prisma.notification.create` bypasses | `no-restricted-syntax` outside `modules/notifications` |
| E-5 | 37 integration suites skip silently under `npm test` | test runner must fail on unexplained skips |
| E-6 | **No CI exists at all** | — |
| E-7 | `openapi.json` has `components.schemas: 0` and is 6.0 MB | `check:openapi` size + named-schema assertion |
| E-8 | 9 routes with no response schema | `check:openapi` requiring a zod response or an explicit `binaryResponse` marker |
| E-9 | 5 module dependency cycles | dependency-cruiser / madge in CI |
| E-10 | `NotificationDeliveryLog.dedupeKey` is `@unique` with **zero writers** | `check:prisma` — unique columns with no writer |
| E-11 | `GET /` registered on the root instance, outside every access-level scope | `check:routes` — no route registration outside `modules/**/routes/<level>/` |
| E-12 | 5 local `resolveScope` copies while `resolveBranchScope` exists | duplicate-shape lint / import-graph rule |
| E-13 | Raw password-reset token logged inside a `link` field | ban secret-shaped values in log objects |
| E-14 | A stale `pnpm-lock.yaml` beside `package-lock.json`; no `engines` field | repo-hygiene check |

**14 of 41 — the largest bucket.** Every one is mechanically detectable. This is the strongest
argument for `16-AUTOMATED-GUARDS-PROPOSAL.md`.

## F. ARCHITECTURE_AMBIGUITY — 4

*More than one legitimate pattern exists for the same task, with no rule choosing between them.*

| ID | Ambiguity | The competing patterns |
| --- | --- | --- |
| F-1 | How to send an email | `fastify.mailer.send()` vs `ProviderRegistry[EMAIL].send()` |
| F-2 | How to define an email template | `lib/email/templates.ts` static registry vs DB `MessageTemplate`+version vs `complaints/complaint-email.ts` |
| F-3 | Where configuration lives | `env` vs `Setting` table vs per-domain settings tables (`reports.config`, `ComplaintNotificationSetting`) |
| F-4 | How to consume a single-use token | atomic `updateMany … usedAt: null` + `count` (2FA challenge, recovery codes) vs `findUnique` → check → `update where {id}` (password reset / account setup) — **two patterns for the same problem in one codebase** |

F-4 is the clearest illustration: the *same repository* contains both the correct and the racy
implementation of "consume a single-use token", written months apart, with nothing to make the
correct one the obvious choice.

## G. LEGACY_PATTERN_LEAK — 4

*The starter's own reference implementation is the weak one.*

| ID | Bad reference | Consequence |
| --- | --- | --- |
| G-1 | `files.service.ts` — permission-gated but **not ownership-gated**, advertised in `README.md:135-137` as the secure-files answer with ownership simply unmentioned | any `files.read` holder reads any file; and the one domain that needed scope had to write its own module |
| G-2 | `auth.service.setPasswordViaToken` — check-then-write single-use consumption in the starter's own auth core | the pattern a developer copies when adding a new token flow |
| G-3 | `plugins/notifications.ts` EMAIL channel is a permanent `SKIPPED "no template bound"` stub | devalues the whole abstraction; makes bypassing it feel costless |
| G-4 | `plugins/capabilities.ts` hardcodes `email: env.EMAIL_ENABLED`, ignoring the DB-integration resolver the send path actually uses | the capability contract lies in both directions |

## H. PROMPT_OR_CONTEXT_PRESSURE — 0

No evidence of "shortest path under pressure" was found. The opposite is visible throughout: dense
explanatory docblocks stating *why* a decision was made, including several that document their own
debt (`branch-scope.ts:20-26`, `quick-send.service.ts:914-918`, `cx-demo.seed.ts:128-129`). Where
corners were cut, they were cut **knowingly and annotated**, which is the behaviour you want — it
just never reached a backlog.

## I. DOMAIN_COMPLEXITY_GAP — 1

| ID | Gap |
| --- | --- |
| I-1 | The starter had no answer for **multi-channel, multi-language, provider-backed, per-recipient, retryable, admin-gated messaging**. The CX domain needed exactly that, and the result is the `communication` + `survey-campaigns/providers` + `integrations` stack (≈30 files) — high-quality work that had to be invented from zero, and which then made the starter's `mailer`/`notify` redundant. |

---

## Cross-cutting conclusions

1. **The permission architecture is the proof that automation beats documentation.** The one rule
   that was enforced *by construction* (`enforcePermissions` reading route metadata inside an
   encapsulated access-level scope) has **zero** violations across 307 endpoints. Every rule enforced
   only by prose has violations. This is the whole postmortem in one sentence.

2. **Bypass follows capability, not laziness.** All 9 `C` findings and both `A` findings involve a
   shared component that covered most of the need and offered no seam for the rest. V2's rule:
   *every shared component ships an extension point, or it will be replaced.*

3. **A stub is worse than an absence.** `notify`'s EMAIL channel and `capabilities`' hardcoded flags
   are both stubs that look like features. Each one taught a reader that the abstraction is not
   serious. V2 should either implement or throw `NOT_IMPLEMENTED` — never silently `SKIP`.

4. **Documentation that ages silently is a liability.** `KNOWN-LIMITATIONS.md` describes a system two
   major features out of date, and `README.md` describes `db:deploy` as the opposite of what it does.
   Docs that assert facts about code must be checked by code.

5. **Honest in-code debt notes are worth capturing.** Three separate files document their own
   compromise precisely. In V2 those should be a machine-readable `@debt(...)` annotation that
   `check:architecture` collects into a report — so honesty produces a backlog item instead of a
   comment nobody reads.
