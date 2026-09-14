# WhatsApp Backend — Final (Phases 1–10) + UltraMsg provider

Diamond WhatsApp is **manual staff communication only**. No AI, chatbot, auto-reply, campaigns, bulk/broadcast, scheduled send, automatic Customer create/update, or fake Meta/UltraMsg success.

## Active provider (this deployment)

- **Current operational provider:** UltraMsg
- **Test instance id:** `instance191564`
- **API base URL:** `https://api.ultramsg.com/instance191564`
- Token: server-only `ULTRAMSG_TOKEN`. Never in frontend, OpenAPI, docs, logs, AuditLog, or DTOs. There is no `NEXT_PUBLIC_ULTRAMSG_TOKEN`.

The Inbox, conversations, messages, unread, SSE/outbox, customer link, and permissions are **unchanged**. This migration replaces the **provider-specific** connection, send, webhook, and composer-eligibility layer.

Meta Cloud API code remains in-tree (`MetaCloudWhatsAppProvider`) for future reuse. It is not the active runtime when `WHATSAPP_PROVIDER=ULTRAMSG`.

### Provider capabilities (UltraMsg V1)

`supportsQrAuthentication=true`, `supportsEmbeddedSignup=false`, `supportsFreeText=true`, `supportsTemplates=false`, `requiresCustomerServiceWindow=false`, image/document/audio/video=true, provider read receipt exists but Diamond does **not** auto-call `/chats/read`. Frontend derives UI from `connection.capabilities`, not scattered `if provider === ULTRAMSG`.

### Session status

UltraMsg `initialize|qr|retrying|loading|authenticated|disconnected|standby` maps to Diamond `INITIALIZING|QR_REQUIRED|RETRYING|LOADING|AUTHENTICATED|DISCONNECTED|STANDBY|UNKNOWN`. Only **AUTHENTICATED** is send-ready. Diamond never relies on UltraMsg’s “queue while unauthorized” behavior: if the session is not authenticated, `/messages/*` is not called (`WHATSAPP_PROVIDER_NOT_AUTHENTICATED` / `WHATSAPP_QR_REQUIRED`).

### Connection

Additive columns only: `providerInstanceId`, `providerApiUrl`, `providerSessionStatus`, `providerSessionCheckedAt`, `webhookCallbackCiphertext`. Token stays in encrypted `credentialCiphertext`. Meta `wabaId` / `phoneNumberId` remain nullable for historical rows.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/whatsapp/connection/bootstrap` | Server-side UltraMsg env bootstrap (`whatsapp.manage_connection`). Validates `/instance/status` + `/instance/me`, encrypts token, retires previous active connection without delete. |
| `GET` | `/whatsapp/connection/qr` | Sanitized QR for Manage WhatsApp. `whatsapp.manage_connection` only. Never logged or stored in localStorage. Empty when already authenticated. Does **not** call `/instance/clear`. |
| `POST` | `/whatsapp/connection/webhook/activate` | Provider-aware. UltraMsg: GET settings → preserve `sendDelay`/`sendDelayMax` → set webhook fields only → verify. Requires public `PUBLIC_BACKEND_URL` (https, not localhost) **and** `ULTRAMSG_CONFIGURE_WEBHOOK=true`. |

### UltraMsg webhook

`POST /whatsapp/webhooks/ultramsg/:callbackKey` — public, no JWT, **not** Meta HMAC. Compensating controls: high-entropy callback key (path), constant-time compare, instanceId match, JSON size limit, rate limit, schema validation, hash/event-key idempotency. **This is not provider HMAC authentication.**

Events: `message_received` → inbound Conversation/Message; `message_create` → reconcile outbound `providerMessageId` (no duplicate bubble); `message_ack` → monotonic SENT/DELIVERED/READ (`pending` safe, `server`→SENT, `device`→DELIVERED, `read`/`played`→READ). Groups (`@g.us`) persist `IGNORED` (`ULTRAMSG_GROUP_NOT_SUPPORTED`) and never appear in Inbox. 1:1 identity is exact `number@c.us` (`providerChatId`); match digits strip only `@c.us`. No Customer auto-create/link.

### Outbound

Text: `POST /messages/chat` form `to`+`body` (max 4096). Recipient from persisted `providerChatId`. Media: `/messages/image|document|audio|video` with **base64** (no public unauthenticated file URL). Limits: image/audio 16MB, video 32MB, document 30MB, caption 1024, filename 255, intersected with Diamond `MAX_UPLOAD_SIZE`. HTTP 200 ≠ SENT (`ACCEPTED` only). No POST retry. UNKNOWN has no auto-resend.

Optional `/chats` history import is **not** implemented (schema not live-verified). Diamond PostgreSQL remains Inbox source of truth.

### Live gates

- Webhook mutate: only if `PUBLIC_BACKEND_URL` is public HTTPS **and** `ULTRAMSG_CONFIGURE_WEBHOOK=true`.
- Live outbound: only if `ULTRAMSG_TEST_RECIPIENT` is set. Never pick a recipient from existing chats.
- Destructive UltraMsg APIs (`/instance/clear`, logout, restart, chat/message delete) are forbidden in application code.

Historical Meta phases remain documented below. UltraMsg is the active operational provider.

- **Phase 1:** secure office connection (credentials / WABA / phone).
- **Phase 2:** secure Meta webhook ingress (verify, signature, route, idempotent store).
- **Phase 3:** Conversation + Message domain, office unread, sanitized Inbox read APIs.
- **Phase 4:** staff Inbox UI at `/[locale]/whatsapp` (`whatsapp.read`). See `DOCU/05-pages/whatsapp.md`.
- **Phase 5:** manual staff TEXT send inside an existing conversation (`whatsapp.send`). Recipient is server-derived. 24-hour customer service window is enforced server-side.
- **Phase 6:** authenticated SSE Inbox notifications (`GET /whatsapp/realtime`, `whatsapp.read`). SSE is not the source of truth.
- **Final:** approved templates, authenticated media proxy + outbound media, Embedded Signup / webhook activate UI contract, optional explicit Customer link.

**LIVE META VERIFICATION is deferred** (no usable Meta Developer account). Domain/UI/tests are ready. Runtime without Meta config fails closed (`WhatsAppUnconfiguredProvider`). Test doubles live under `tests/` only.

Dedicated module: `APP/backend/src/modules/whatsapp/`. Independent of Contracts, Vehicles, Finance, Maintenance, GPS, and Road Liabilities.

## Phase 1 — secure connection

`LINKED` means: provider authorization validated, WABA validated, phone number validated, credential stored encrypted (`enc:v1:` AES-256-GCM). It does **not** mean webhook active or messaging ready.

One current office connection (V1): partial unique index + `whatsapp_connection` advisory lock. Replacing A with B retires A (`DISCONNECTED`, credential wiped) only after B is fully validated.

Mutations: `whatsapp.manage_connection`. `GET /whatsapp/connection` is sanitized status for Inbox banners and accepts `whatsapp.read` **or** `whatsapp.manage_connection`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/whatsapp/connection/attempts` | Start attempt + frontend-safe bootstrap |
| `POST` | `/whatsapp/connection/attempts/:id/authorize` | Server-side code exchange |
| `POST` | `/whatsapp/connection/attempts/:id/select` | Promote validated WABA/phone |
| `GET` | `/whatsapp/connection` | Sanitized status (`webhookStatus`, `lastWebhookAt`). Readable with `whatsapp.read` or `whatsapp.manage_connection` |
| `POST` | `/whatsapp/connection/disconnect` | Local disconnect (no Meta phone deletion) |

Never returned, logged, audited, or documented as examples: access token, `META_APP_SECRET`, verify token, ciphertext.

Runtime: configured Meta provider, or `WhatsAppUnconfiguredProvider` (`WHATSAPP_PROVIDER_NOT_CONFIGURED`). Test doubles are in-memory injection only; production refuses injection.

## Phase 2 — secure webhook ingress

Public provider callbacks (no Diamond JWT). Security is provider-specific.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/whatsapp/webhooks/meta` | Meta `hub.mode` / `hub.verify_token` / `hub.challenge`. Success returns **plain text** challenge. Fail closed `403`. |
| `POST` | `/whatsapp/webhooks/meta` | Signed events. Raw-body HMAC. |

### Verify token

`META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` is server-only. Not in the database, frontend, OpenAPI examples, responses, or logs (request URLs redact `hub.verify_token`). Empty token never matches.

### Raw-body signature

`X-Hub-Signature-256: sha256=<hex>` is HMAC-SHA256 of the **exact raw request bytes** with `META_APP_SECRET`, compared in constant time.

Do not `JSON.stringify` a parsed body and HMAC that reconstruction. Missing / malformed / invalid signatures return `403` with **no database write**.

### Persistence

`WhatsAppWebhookEvent` is the durable receipt (not AuditLog, not a Message table). One sanitized JSON payload per event. Secrets in unexpected keys are redacted. Customer text may exist on the event row for replay; it is not logged at INFO and is not written to AuditLog (`request.setAudit({ skip: true })`).

Idempotency: unique `providerEventKey` (`wamid:{id}` for messages, `wamid:{id}:status:{status}` for statuses). Concurrent duplicates use unique constraint / `skipDuplicates` and return HTTP 200.

### Routing

Route on server-validated `entry.id` (WABA) **and** `value.metadata.phone_number_id` against a **current** connection (`LINKED` / `LINKING` / `REAUTH_REQUIRED` / `ERROR`). Not display phone, not customer `wa_id`, not client input.

Unknown WABA/phone: persist `IGNORED` + `WHATSAPP_WEBHOOK_CONNECTION_NOT_FOUND`, HTTP **200** (do not retry). Never attach to another account. Replaced connection B receives B events; historical rows keep their original `connectionId`. A `DISCONNECTED` row is not revived.

### Normalization (Phase 2 only)

Supported: `MESSAGE_RECEIVED` (text body extracted; other types store `messageType` only) and `MESSAGE_STATUS`. Preserve exact `wa_id`. Parse Meta unix-second timestamps into `occurredAt`; `receivedAt` is server time. Malformed timestamps → `occurredAt` null, no crash.

No Customer / Contract / Vehicle / Finance side effects. No media download. No auto-reply.

### Readiness

`webhookStatus`: `NOT_CONFIGURED | PENDING | ACTIVE | ERROR` — distinct from `LINKED`. `lastWebhookAt` updates on a successfully routed ingest. `ACTIVE` here means Diamond received a signed, routed webhook; it is not messaging-ready.

### WABA subscription adapter

`subscribeWaba()` / `getWebhookSubscriptionStatus()` exist on `WhatsAppProvider` (`POST|GET /{waba-id}/subscribed_apps`). **Not called automatically** from select or webhook receipt. Unconfigured → `WHATSAPP_PROVIDER_NOT_CONFIGURED`. No fake subscription success.

## Environment

Optional: `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_API_VERSION` (default `v25.0`), `META_WHATSAPP_CONFIG_ID`, `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`.

Live Meta Developer verification is deferred (no usable account in this environment). Tests use isolated secrets and signed fixtures.

## Phase 3 — Conversation + Message

Provider webhook ingestion stays provider-facing. Conversation/Message is Diamond-facing. Routes do not write messages from raw Meta JSON; `WhatsAppWebhookService` calls `materializeInboundMessage()` with normalized fields.

### Identity

Conversation uniqueness: `(connectionId, customerWaId)`. Exact Meta `wa_id` is stored as-is (no `+`, no country-code guessing, no Diamond Customer id). The same customer on two office connections is two conversations. Replacing connection A with B does **not** migrate A’s threads. Historical rows stay on the original `WhatsAppConnection`. A `DISCONNECTED` connection is not used for new webhook routing (Phase 2 current-status rule); existing conversations remain readable with `whatsapp.read`.

### WhatsAppMessage

Normalized business row only. Provider JSON stays on `WhatsAppWebhookEvent`. No media binaries, no Meta media download. Direction `INBOUND` / `OUTBOUND` (outbound exists for later send; Phase 3 creates inbound rows only). Inbound `providerStatus` is null — incoming messages are never labeled `SENT`. Status webhooks may update **existing OUTBOUND** rows; missing `providerMessageId` is kept on the event and is not invented as an outbound message.

Idempotency: unique `(connectionId, providerMessageId)` plus `createMany({ skipDuplicates: true })`. Duplicate `wamid` does not insert a second row, does not increment unread, and does not move `lastMessage*`. Concurrent duplicate ingest is serialized with advisory lock `whatsapp_conversation` + unique constraint.

Chronology uses `providerOccurredAt`, then `createdAt`, then stable `id`. Late older messages are stored; they do not replace `lastMessageId` / `lastMessageAt` / `lastMessagePreview` / `lastInboundAt`. Undated incoming never replaces a dated last message.

Preview: TEXT truncated (160 chars, no HTML). Non-text preview is `null`; `lastMessageType` carries the type for the frontend to localize later.

Customer display name: latest non-empty provider profile name. Null/empty does not erase a useful name. This is not a Diamond Customer name authority.

### Unread (office-level)

`unreadCount` is **Diamond staff unread**, not Meta delivery or customer read. Each newly inserted inbound message increments by 1 exactly once. V1 is office-level (not per-user). `lastReadAt` / `lastReadByUserId` record who last marked the thread read internally.

`POST /whatsapp/conversations/:id/read` (`whatsapp.read`) sets `unreadCount = 0`. It does **not** call Meta and does **not** send a WhatsApp read receipt.

### Read APIs

Permission: `whatsapp.read` (catalog + `system_admin` seed). Verify via `/auth/me`. Not a role-name check. `whatsapp.send` is a separate Phase 5 permission and is not implied by read.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/whatsapp/conversations` | Paginated list (`page` / `pageSize`). `search` on `customerWaId`, `customerDisplayName`, `lastMessagePreview`. `unread=true` → `unreadCount > 0`. |
| `GET` | `/whatsapp/conversations/:id` | Detail + connection display phone / verified name + optional explicit Customer link (PII only if Customer ACL allows). |
| `GET` | `/whatsapp/conversations/:id/messages` | Newest first (`providerOccurredAt` desc, `createdAt` desc, `id` desc), then older pages. |
| `POST` | `/whatsapp/conversations/:id/read` | Internal mark-read. |

Unknown id → safe 404. Responses never include access tokens, ciphertext, verify token, `META_APP_SECRET`, or raw webhook payload.

### Processing state

Supported `MESSAGE_RECEIVED` on a current connection is marked `PROCESSED` only after conversation + message persistence commits (same transaction). Materialization failure leaves the event `FAILED` (`WHATSAPP_INBOUND_MATERIALIZATION_FAILED`) for retry. Retry is idempotent.

### Privacy / retention

Do not log customer message bodies at INFO. Audit `WHATSAPP_CONVERSATION_READ` stores conversation id only. Message retention/deletion is a deployment/business decision; Phase 3 does not auto-delete history. No fake production/dev chat seed.

### Not in Phase 3

Inbox UI, composer, AI/chatbot/auto-reply, campaigns, Customer auto-link, media download, and any Contract / Vehicle / Finance / Maintenance / GPS side effects. Manual outbound send is Phase 5.

## Phase 5 — manual outbound TEXT send

Staff types one text message in an existing `WhatsAppConversation`. Diamond validates permission and eligibility, creates one outbound `WhatsAppMessage`, then calls Meta **once** through `WhatsAppProvider.sendTextMessage()`. No AI, auto-reply, bulk, templates, media, scheduled send, or new-chat initiation.

### Official provider boundary

`POST /{phone-number-id}/messages` (Cloud API text contract). Bearer token is the decrypted connection credential. Body uses `messaging_product: whatsapp`, `recipient_type: individual`, `to` = `conversation.customerWaId`, `type: text`. HTTP **retries are disabled** for this POST. GET/inspect calls may keep existing read retries.

Client body is `{ text }` only. Route id is the conversation. Backend derives recipient (`customerWaId`), connection (`connectionId`), `phoneNumberId`, and credential. Extra fields such as `to` / `wa_id` are rejected.

Text: trim ends only (preserve line breaks, Unicode, Arabic, English, emoji). Empty/whitespace-only rejected. Maximum **4096** characters (official Cloud API text cap).

### Permission

`whatsapp.send` is catalog-seeded and distinct from `whatsapp.read` and `whatsapp.manage_connection`. Verify via `/auth/me`. The send route uses `sensitiveMutationRateLimit()`.

### Eligibility (server authority)

Every send re-checks: authenticated user, `whatsapp.send`, conversation exists, current office connection is this conversation’s connection, status `LINKED`, `webhookStatus = ACTIVE`, credential decrypts, provider configured, 24-hour window open, valid text.

Window: `expiresAt = lastInboundAt + 24 absolute hours`. Open only while `now < expiresAt`. Equal-to-boundary is **closed**. `lastInboundAt` is the latest valid inbound `providerOccurredAt`. Missing/undated inbound does **not** open the window (`CUSTOMER_SERVICE_WINDOW_UNKNOWN`). Closed window does **not** call Meta for free-form text/media (`WHATSAPP_CUSTOMER_SERVICE_WINDOW_CLOSED`). Approved templates may still send when the connection is ready.

Historical conversations on a retired/disconnected connection stay readable and are not sendable (`WHATSAPP_CONVERSATION_CONNECTION_INACTIVE`). Unconfigured Meta → `WHATSAPP_PROVIDER_NOT_CONFIGURED` (no fake `wamid`, no simulation fallback). Inactive webhook → `WHATSAPP_WEBHOOK_NOT_ACTIVE`.

Detail read projection includes:

```
messagingEligibility: { canSendText, canSendMedia, canSendTemplate, reason, windowExpiresAt }
```

Reasons: `READY | NO_ACTIVE_CONNECTION | CONNECTION_INACTIVE | WEBHOOK_NOT_ACTIVE | CUSTOMER_SERVICE_WINDOW_CLOSED | CUSTOMER_SERVICE_WINDOW_UNKNOWN | PROVIDER_NOT_CONFIGURED`.

### Send flow

1. Transaction A: validate, advisory lock, reserve idempotency, create OUTBOUND TEXT `PENDING` (`sentByUserId` from auth, `providerOccurredAt` null, `providerMessageId` null), update conversation summary (`lastMessage*` / `lastOutboundAt`), **do not** increment `unreadCount`. Commit.
2. One provider POST.
3. Transaction B: `ACCEPTED` + persist `providerMessageId`, or `FAILED` / `UNKNOWN`. Then reconcile any `MESSAGE_STATUS` events that arrived before the wamid was saved.

`sendState` (`PENDING | ACCEPTED | FAILED | UNKNOWN`) is Diamond’s provider-request outcome. `providerStatus` remains webhook-owned (`SENT | DELIVERED | READ | FAILED`). HTTP 200 + wamid means **ACCEPTED**, not SENT.

Definite provider rejection keeps the local row (`FAILED`). Ambiguous timeout/network after the request may have been sent → `UNKNOWN`. **No automatic retry** (duplicate customer messages).

### Idempotency

Required `Idempotency-Key` (8–128 chars). Bound to actor + conversation + normalized text fingerprint on `WhatsAppOutboundAttempt`. Same key + same payload returns the existing attempt and does **not** call Meta again. Same key + different payload → `IDEMPOTENCY_KEY_REUSED`. Concurrent duplicates: unique `(actorUserId, idempotencyKeyHash)` + conversation advisory lock → one provider call.

### Webhook status

`MESSAGE_STATUS` updates **OUTBOUND** rows only, by `(connectionId, providerMessageId)`. Monotonic: SENT → DELIVERED → READ. No READ→DELIVERED or DELIVERED→SENT regression. FAILED does not overwrite DELIVERED/READ. Unknown wamid stays on the webhook event (no invented outbound row). Internal mark-read still does **not** send Meta read receipts.

### Audit / logs

`WHATSAPP_MESSAGE_SEND_ATTEMPTED | ACCEPTED | FAILED` store actor, conversation id, message id, connection id, send state. **Not** message text, tokens, or raw Meta bodies. INFO logs follow the same rule. Provider errors are mapped to domain reasons; raw JSON is not returned.

### API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/whatsapp/conversations/:id/messages` | Manual TEXT send (`whatsapp.send`, `Idempotency-Key`) |

Live Meta send verification is **deferred** (no usable Developer account). Automated tests use an in-memory provider double under `tests/` only. Runtime without Meta config fails closed.

### Not in Phase 5

Templates, media send, bulk/campaigns, scheduled send, auto-reply, new-chat initiation, Meta read receipts, Customer auto-link, and any Contract / Vehicle / Finance / Maintenance / GPS / Stripe / TARS side effects. Realtime SSE is Phase 6.

## Phase 6 — authenticated SSE notifications

SSE is a **notification transport only**. Source of truth remains the database and existing WhatsApp REST APIs. No business operation depends on an SSE client being connected. Inbox load, conversation open, send, and manual Refresh work if the stream is down.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/whatsapp/realtime` | Long-lived SSE (`whatsapp.read`). `Content-Type: text/event-stream`. `Cache-Control: no-cache, no-store`. `Connection: keep-alive`. `X-Accel-Buffering: no`. Compression disabled on this route. |

### Auth

Same Diamond JWT as other admin APIs: `Authorization: Bearer`. **Never** `?token=`. Native `EventSource` is not used because it cannot send that header. Losing `whatsapp.read` / session ends the stream.

### Post-commit publishing

Domain services write a `DomainOutboxEvent` (`eventType` `whatsapp.*`, ids only) **inside** the same Prisma transaction as the conversation/message/connection change. After `withTransaction` resolves, `WhatsAppRealtimePublisher` fans out in-process. A rolled-back transaction writes no outbox row and publishes nothing. Duplicate Meta webhooks that insert no new message do not emit `whatsapp.message.received`.

### Multi-instance

API replicas exist in this codebase. An in-memory hub alone would miss events when the webhook hits instance A and the SSE client is on B. V1 therefore:

1. Durably writes WhatsApp rows to the existing `DomainOutboxEvent` table (not a second archive).
2. Each listening API process polls new `whatsapp.*` outbox ids (~1s) and publishes locally (deduped by event id).
3. On connect, optional `Last-Event-ID` replays ids inside a **15-minute** retention window, then purge.

This is **not** Redis. Documented limitation: replay is bounded; clients must REST-reconcile after reconnect if they were disconnected longer than retention. Complaint outbox workers ignore `whatsapp.*` types.

`SINGLE_INSTANCE_REALTIME_ONLY` is **not** claimed. Shared DB poller is the cross-instance path. REST remains the recovery path.

### Heartbeat / proxies

Comment heartbeat `: ping` every 15s. Reverse proxies must not buffer this route (`X-Accel-Buffering: no`, `compress: false`). Do not apply a short HTTP timeout to the stream. Subscriber cap: 40 connections per process.

### Event vocabulary (identifiers only)

| Event | When |
| --- | --- |
| `whatsapp.conversation.created` | New conversation row committed |
| `whatsapp.conversation.read` | Office unread went to 0 (not a Meta read receipt) |
| `whatsapp.message.received` | New inbound message row |
| `whatsapp.message.outbound_created` | New outbound row (other staff tabs) |
| `whatsapp.message.send_state_changed` | `PENDING` → `ACCEPTED` / `FAILED` / `UNKNOWN` |
| `whatsapp.message.provider_status_changed` | Webhook `SENT` / `DELIVERED` / `READ` / `FAILED` after a real status change |
| `whatsapp.connection.updated` | Connection or webhook status actually changed |

Envelope: `eventId`, `type`, optional `conversationId` / `messageId` / `connectionId`, `occurredAt`, optional `sendState` / `providerStatus`. **Never** message body, Meta tokens, ciphertext, verify token, app secret, authorization code, or raw webhook JSON.

### Tests without live Meta

Phase 6 is covered by signed webhook fixtures, DB commits, and authenticated SSE fetch clients. A live Meta Developer account is not required.

## Deployment notes (SSE)

- Disable response buffering for `/whatsapp/realtime` (nginx `X-Accel-Buffering: no` is already set; also `proxy_buffering off` if a proxy ignores that header).
- Idle timeouts should exceed the 15s heartbeat.
- Do not gzip this route (already `compress: false`).

## Final — templates, media, Embedded Signup, Customer link

Still one conversation, one staff action, one message. No campaigns.

### Templates (`whatsapp.send`)

`GET /whatsapp/templates` lists Diamond DTOs for the **active** WABA (server-selected). `sendable` is computed on the backend (V1: `APPROVED` + TEXT header/body, no dynamic URL buttons). `POST /whatsapp/conversations/:id/template-messages` body: `{ name, language, headerParameters?, bodyParameters? }`. Recipient is `conversation.customerWaId`. Same outbound idempotency / `ACCEPTED ≠ SENT` / webhook status as text.

### Media

Authenticated on-demand proxy: `GET /whatsapp/messages/:id/media` (`whatsapp.read`). Diamond does **not** archive inbound binaries into Attachment storage. Provider media IDs expire → `WHATSAPP_MEDIA_UNAVAILABLE`. No Meta URL or Bearer token is returned to the browser.

Outbound V1: IMAGE / DOCUMENT / AUDIO / VIDEO via `POST /whatsapp/conversations/:id/media-messages` (multipart, open 24h window only). Official Cloud API size limits and `MAX_UPLOAD_SIZE` (stricter wins). Caption for image/video/document only (max 1024). Same idempotency / UNKNOWN / no auto-retry rules.

### Embedded Signup / webhook activate (`whatsapp.manage_connection`)

Existing attempt / authorize / select / disconnect remain. `POST /whatsapp/connection/webhook/activate` calls `subscribeWaba` then `getWebhookSubscriptionStatus`. `webhookStatus` is `ACTIVE` only after provider confirmation. Failed setup is `ERROR`, never a fake ACTIVE. No phone registration, PIN, or Meta deletion.

Public client values (App ID, Embedded Signup config id) come from the attempt bootstrap. `META_APP_SECRET` stays server-only.

### Customer matching (`whatsapp.read` / `whatsapp.link_customer`)

`GET /whatsapp/conversations/:id/customer-match` is read-only. Match is exact digit equality after existing `normalizePhone`. No country-code guessing. States: `NO_MATCH` / `NO_SAFE_MATCH` / `ONE_MATCH` / `AMBIGUOUS`. Never auto-link, never create/update Customer.

`POST` / `DELETE /whatsapp/conversations/:id/customer-link` require `whatsapp.link_customer`. Customer ACL (`customers.read` + branch visibility) is not bypassed. Audit `WHATSAPP_CUSTOMER_LINKED` / `WHATSAPP_CUSTOMER_UNLINKED` stores ids only. Realtime: `whatsapp.conversation.updated`.

### Live Meta still deferred

Unverified live Graph calls are not claimed. Automated tests use `tests/helpers/fake-whatsapp-provider.ts`.
