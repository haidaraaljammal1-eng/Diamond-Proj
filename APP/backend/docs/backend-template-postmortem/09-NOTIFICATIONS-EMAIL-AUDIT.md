# 09 — Notification & Email Architecture Audit

Reviewed: `src/plugins/{notifications,mailer,capabilities}.ts`, `src/lib/email/*`,
`src/modules/communication/*` (10 files), `src/modules/complaints/complaint-notifications.ts` +
`complaint-email.ts`, `src/modules/survey-campaigns/providers.ts`,
`src/modules/integrations/adapters/*`, and every `notify` / `mailer` / `notification.create` call
site.

**Headline: three parallel notification pipelines and two parallel email-send interfaces exist in one
codebase.** Each is individually well-built; together they are the largest architectural drift in the
system.

---

## 1. The three notification pipelines

| # | Pipeline | Entry point | Channels | Dedupe | Delivery log | Preferences |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **Starter generic** | `fastify.notify.send()` (`plugins/notifications.ts:97-152`) | IN_APP (real), EMAIL (stub — always `SKIPPED "no template bound"`), PUSH/SMS (stub) | `runIdempotent` when `dedupeKeyPrefix` given | `NotificationDeliveryLog` | ✅ per-user, narrowing-only |
| 2 | **Complaint durable outbox** | `createComplaintNotificationsService(...)` (`complaint-notifications.ts`) | EMAIL (real, via `ProviderRegistry`) | 5-column composite unique | `ComplaintNotificationDelivery` + mirrored to `NotificationDeliveryLog` | ✅ per-user, narrowing-only |
| 3 | **Direct insert** | `prisma.notification.create(...)` | IN_APP only | `findFirst` on a JSON path (**racy**) | ❌ none | ❌ **ignored** |

Pipeline 3 has two call sites:
- `src/modules/call-center/call-center.service.ts:583-586` — "customer unreachable" to the branch manager
- `src/modules/public-surveys/public-surveys.service.ts:499-501` — negative-survey alert to the CX audience

### Consequences of pipeline 3

| Guarantee | Lost? |
| --- | --- |
| Per-recipient preference respected (`NotificationPreference.enabled`, `channels`) | **yes — bypassed entirely.** A user who muted `call_center.customer_unreachable` still receives it. |
| Delivery log row written | **yes — no row.** The admin "delivery log" view under-reports these events. |
| Idempotent under concurrency | **yes — racy** (see `08 §4`) |
| Channel gating by admin settings | **yes** |
| Consistent `title`/`body` localization | **yes** — hardcoded English strings (`"Customer unreachable"`, `"Negative survey response"`) while the rest of the system uses `t(key, { lng })` |

*Classification:* `PREFERENCE_MISUSE` + `DEDUPE_MISSING` + `FAILURE_NOT_LOGGED`.

### Why the bypass happened — this is the important part

`NotifyParams` (`plugins/notifications.ts:14-29`) accepts `{ eventKey, userIds, title, body, data,
dedupeKeyPrefix, channels }`. It deliberately keeps **audience resolution out of the starter** —
`:11-13` says so: *"Audience resolution is DOMAIN-SPECIFIC and stays out of the starter: callers pass
explicit recipient userIds."*

That decision is architecturally right. But both bypassing call sites already *had* their user ids —
`public-surveys.service.ts:480-488` resolves the CX audience by permission, `call-center` resolves the
branch manager. They could have called `notify.send({ userIds, dedupeKeyPrefix })` in one line.

They did not, because:
- the in-app title/body they wanted was trivially expressible as a direct insert;
- nothing in `CLAUDE.md`, `AGENTS.md` or the standards says *"never write `Notification` rows
  outside the notifications module"*;
- no lint rule or check script exists;
- and `fastify.notify`'s EMAIL branch is a documented stub that returns `SKIPPED "no template bound"`,
  so the pipeline visibly "doesn't do much", which lowers the perceived cost of skipping it.

*Root cause:* `E. AUTOMATION_GAP` (primary) + `D. DOCUMENTATION_GAP` + `C. STARTER_CAPABILITY_GAP`
(the stub EMAIL channel devalues the abstraction). **Not** `A. AGENT_NON_COMPLIANCE` — no written rule
was broken.

## 2. Pipeline ordering — Audience ≠ Preferences

The standard is: *business event → audience resolver (authorization) → authorized recipients →
preferences → channels → template → deliver → dedupe → delivery log.*

| Pipeline | Ordering | Verdict |
| --- | --- | --- |
| Complaints | documented and implemented exactly: `complaint-notifications.ts:16-20` — "Event → Admin channel rule → resolved audience → per-user preference → provider availability → delivery"; audience built in `complaints.service.ts:253` (`resolveAudience`) from department/assignee/escalation-level rules | `FULL_PIPELINE_COMPLIANT` |
| Generic `notify` | audience is the caller's `userIds`; preferences applied per recipient at `:107-125`; **user preference can only NARROW the admin-enabled set** (`:122-125`) | `FULL_PIPELINE_COMPLIANT` |
| Direct insert | no audience policy object, no preferences | `AUDIENCE_RISK` + `PREFERENCE_MISUSE` |

**"No default admin copy" check: passed.** No code path adds admins as implicit recipients. Audience
is always explicit — either a caller-supplied list or a permission-derived query
(`public-surveys.service.ts:480` selects users holding `SURVEY_NEGATIVE_ALERTS_RECEIVE`; that *is* an
authorization-derived audience, which is the correct model).

**Recipient isolation:** `Notification.userId` is per-row, and the user routes filter by
`requireAuth(request).id` (`notifications/routes/user/route.ts`). Mark-read and read-all are
user-scoped. ✅ `FULL_PIPELINE_COMPLIANT`.

## 3. Business action coupled to delivery?

| Flow | Coupling | Verdict |
| --- | --- | --- |
| Complaint transitions → notify | `complaints.service.ts:292` documents "Non-blocking notify"; failures are caught | ✅ decoupled |
| Complaint email | enqueued to a durable table; the worker sends later | ✅ fully decoupled |
| Survey submission → outbox event | written **inside** the submission transaction; delivery is later and separate | ✅ ideal |
| Negative-survey alert | `try/catch` around each insert, logged (`public-surveys.service.ts:502-504`) | ✅ decoupled |
| Account setup email (`users.service.ts:241`) | result inspected but does not roll back user creation | ✅ decoupled |
| Password reset email | send failure does not surface to the caller (anti-enumeration) | ✅ |

**`BUSINESS_ACTION_COUPLED_TO_DELIVERY`: 0 findings.** This was done right everywhere.

## 4. Delivery failure logging

| Pipeline | Failures logged? |
| --- | --- |
| Generic `notify` | ✅ every skip/failure writes a `NotificationDeliveryLog` row with a `reason` (`preference disabled`, `deduped`, `no template bound`, `channel not available`) |
| Complaint emails | ✅ `ComplaintNotificationDelivery.failureReason` + attempt counts + `recoverStaleLeases()` for crashed workers (`complaint-notifications.ts:110-118`) |
| Campaign deliveries | ✅ stable `DeliveryReason` vocabulary (`providers.ts:56-82`) — 20 machine-readable codes; the docblock explicitly forbids folding provider payloads/credentials into a reason |
| Direct inserts | ❌ nothing |

The `DeliveryReason` enum and its "honesty contract" (`providers.ts:20-24`: *not configured → SKIPPED,
never a fabricated SENT*) is exemplary and should be lifted into V2 as the standard delivery-outcome
vocabulary.

## 5. Email architecture

### Two send interfaces, one transport

| Interface | Used by | Templates |
| --- | --- | --- |
| `fastify.mailer.send({ to, template, vars })` (`plugins/mailer.ts`) | **2 call sites only**: `auth.service.ts:206` (password reset), `users.service.ts:241` (account setup) | static registry `src/lib/email/templates.ts` — exactly 2 keys: `account_setup`, `password_reset` |
| `ProviderRegistry[channel].send({ to, rendered })` (`survey-campaigns/providers.ts`) | campaigns, quick-send, complaint notifications | DB-backed `MessageTemplate` → `MessageTemplateVersion` → per-language content, rendered by `communication/template-render.ts` |

Underneath, **both resolve to the same SMTP construction** — `resolveEmailTransport` builds its
transport from `integrations/adapters/email.adapter.ts:buildTransportFromConfig`, which is the only
`nodemailer.createTransport` in the system besides that adapter itself. `email.adapter.ts:26-30`
documents this deliberately. So there is **one SMTP code path**, two send APIs. ✅ on transport,
⚠ on interface.

`nodemailer` import sites: **2** (`lib/email/resolve-transport.ts`, `integrations/adapters/email.adapter.ts`).
No service imports nodemailer directly. ✅

### Template layering

Four template surfaces exist:
1. `src/lib/email/templates.ts` — starter's static 2-key registry (auth only)
2. `src/modules/communication/{email-layout,email-shell,template-render,template-content}.ts` — the
   product's DB-backed, server-owned premium layout
3. `src/modules/complaints/complaint-email.ts` — complaint-specific renderer
4. `docs/email-templates/*.preview.html` — generated previews

This is `ARCHITECTURE_AMBIGUITY`: a developer adding a new transactional email has to pick between a
static registry and a DB-backed template system with no documented rule for which.

### Email security — strong

| Control | Implementation |
| --- | --- |
| HTML sanitization | `template-security.ts` — `sanitize-html` allow-list: fixed tag list, `allowedSchemes: ["http","https","mailto"]`, `allowProtocolRelative: false`, `disallowedTagsMode: "discard"`, regex-constrained inline styles. Applied **before persistence** — "the backend is the authority" |
| Variable interpolation | `template-content.ts:95` — `html.replace(VALID_TOKEN, (_, key) => escapeHtml(ctx[key] ?? ""))`. Every interpolated value is HTML-escaped; unknown tokens become empty strings, not literal `{{token}}` |
| Template variable validation | `template-validation.ts` + `variables.ts` registry |
| Hardcoded credentials | **none** — all SMTP config from env or the encrypted `IntegrationConnection` row |
| Hardcoded sender | none — `SMTP_FROM` env or integration `fromEmail`/`fromName` |
| Plaintext passwords by email | **none** — account setup emails a single-use **token link**, never a password |
| Secrets in integration rows | encrypted at rest (`integrations/secret-blob.ts`, AES-256-GCM) |

### The non-production recipient allowlist — a genuinely excellent control

`src/lib/email/recipient-allowlist.ts` deserves to be copied into V2 verbatim. Its docblock states
the threat precisely: dev SMTP credentials are frequently *real*, recipient addresses come from the
database, so "we only use test fixtures" is a convention rather than a guarantee. The module turns it
into an enforced boundary:

- inert in production (never a production failure mode),
- inert when unset (no behaviour change until opted into),
- refuses **before** `sendMail` is called,
- records the honest stable reason `recipient_not_allowlisted` — never a fabricated `SENT`.

It is enforced in three places: `plugins/mailer.ts:47`, `providers.ts` (EMAIL send), and
`email.adapter.ts:47` (send-test button).

⚠ One caveat worth stating: `cx-demo.seed.ts:128-129` already warns that in `NODE_ENV=production`
"the recipient allowlist is INERT … only `SCHEDULER_ENABLED=false` and unconfigured integrations hold
the line." That is correct and honest — but it means a production-mode demo seed plus a configured
integration would mail synthetic customers at real addresses. See `11 §Seed`.

## 6. Seed / test email behaviour

| Check | Result |
| --- | --- |
| Does the seed send email? | **No** — grep for `mailer`/`sendMail`/`notify` in `prisma/seeds/cx-demo.seed.ts`: 0 hits |
| Does the base seed send a welcome email? | No (`README.md:54` claims this, and it holds) |
| Are real addresses used in demo data? | Synthetic domain, deterministic PRNG (`cx-demo.data.ts:59-73`) |
| Integration tests sending mail | possible when `RUN_INTEGRATION=true` **and** SMTP is configured — mitigated only by `EMAIL_RECIPIENT_ALLOWLIST`, which is opt-in |

## 7. Capability honesty

`plugins/capabilities.ts:24-29` hardcodes:

```ts
{ email: env.EMAIL_ENABLED, files: true, push: false, sms: false }
```

But the real email capability is `resolveEmailTransport()` — **a DB-configured integration row wins
over ENV** (`plugins/mailer.ts:12-15`). So an operator who configures SMTP entirely through the
integrations admin screen, leaving `EMAIL_ENABLED=false`, gets `capabilities.email === false` while
email actually works — and worse, `plugins/notifications.ts:130` gates the EMAIL channel on
`fastify.capabilities.email`, so the notification pipeline will refuse a channel the system can
actually deliver.

Conversely `sms: false` / `push: false` are hardcoded even though the integrations catalog contains
WhatsApp/SMS adapters — so a configured WhatsApp provider is invisible to `GET /capabilities`.

*Classification:* capability map is **stale relative to the integrations layer**. The starter's
"capabilities tell the frontend the truth, with a reason" promise is violated in both directions.
*V2:* capabilities must be *computed* from the same resolver the send path uses, never from env alone.

## 8. Verdicts

| Flow | Verdict |
| --- | --- |
| Complaint notification pipeline | `FULL_PIPELINE_COMPLIANT` |
| Generic `fastify.notify` pipeline | `FULL_PIPELINE_COMPLIANT` (EMAIL channel is a documented stub) |
| Campaign / quick-send delivery | `FULL_PIPELINE_COMPLIANT` |
| Call-center "customer unreachable" | `PREFERENCE_MISUSE` + `DEDUPE_MISSING` + `FAILURE_NOT_LOGGED` |
| Negative-survey alert | `PREFERENCE_MISUSE` + `DEDUPE_MISSING` + `FAILURE_NOT_LOGGED` |
| Business action ↔ delivery coupling | none (all decoupled) ✅ |
| Email transport | single path ✅ |
| Email send interface | two APIs — `ARCHITECTURE_AMBIGUITY` |
| Email template system | four surfaces — `ARCHITECTURE_AMBIGUITY` |
| Email security (sanitize/escape/schemes/secrets) | ✅ strong |
| Non-production recipient allowlist | ✅ exemplary — adopt in V2 |
| Capability reporting | ⚠ stale / dishonest in both directions |
