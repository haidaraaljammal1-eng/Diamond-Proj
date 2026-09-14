# WhatsApp Inbox — Final

Staff Inbox at `/[locale]/whatsapp` (`whatsapp.read`). Visual layout follows the Diamond Demo conversation list + chat pane. This remains **manual staff communication** — no auto-replies, no Customer auto-create, no campaigns.

## Active provider (UltraMsg)

This is **not** an Inbox rebuild. The list, search, All/Unread, bubbles, media cards, Customer strip, SSE, AR/EN, and RTL stay the same.

- Employees see WhatsApp Connected / Disconnected / Scan QR — not provider brand.
- Manage WhatsApp may show `Provider: UltraMsg` for diagnostics.
- Capabilities hide Embedded Signup, WABA, Phone Number ID, approved templates, and the 24-hour Meta window when `supportsTemplates=false` / `requiresCustomerServiceWindow=false` / `supportsEmbeddedSignup=false`.
- Composer is enabled only when the provider session is **AUTHENTICATED** (plus `whatsapp.send` and current-connection eligibility). QR required / disconnected show localized reasons.
- QR polling (~2–3s) runs only while the QR dialog is open, bounded, and never as Inbox polling. QR is not cached in localStorage.
- Simulation is frontend-only UltraMsg-shaped (QR / authenticated / disconnected / retrying). No backend calls. No real-mode fallback to simulation.
- Meta template / Embedded Signup code remains dormant behind capability flags.

## Route and navigation

- `/ar/whatsapp`, `/en/whatsapp`
- Sidebar label: WhatsApp / واتساب (`whatsapp.read` only)
- No fake Sidebar unread total
- WhatsApp Dock from the Demo is **not** in this phase

## APIs used

- `GET /whatsapp/connection` — sanitized status (not messaging-ready)
- `GET /whatsapp/conversations` — search, `unread=true`, `page` / `pageSize`
- `GET /whatsapp/conversations/:id` — includes `messagingEligibility` (advisory UX)
- `GET /whatsapp/conversations/:id/messages` — newest-first; UI reverses to oldest → newest
- `POST /whatsapp/conversations/:id/read` — Diamond staff unread only, **not** a Meta read receipt
- `POST /whatsapp/conversations/:id/messages` — manual TEXT send (`whatsapp.send` + `Idempotency-Key`)
- `GET /whatsapp/templates` — approved/sendable DTOs for the active WABA (`whatsapp.send`)
- `POST /whatsapp/conversations/:id/template-messages` — one approved template (`whatsapp.send`)
- `GET /whatsapp/messages/:id/media` — authenticated media proxy (`whatsapp.read`)
- `POST /whatsapp/conversations/:id/media-messages` — image/document/audio/video (`whatsapp.send`, open 24h window)
- `POST /whatsapp/connection/webhook/activate` — subscribe WABA (`whatsapp.manage_connection`)
- `GET /whatsapp/conversations/:id/customer-match` — safe phone suggestion (`whatsapp.read`)
- `POST` / `DELETE /whatsapp/conversations/:id/customer-link` — explicit link (`whatsapp.link_customer`)

`GET /whatsapp/connection` accepts `whatsapp.read` **or** `whatsapp.manage_connection` so Inbox readers can see connection/webhook banners. Mutations stay `whatsapp.manage_connection`. Send stays `whatsapp.send`. No credentials are returned. The client never sends a recipient, `wa_id`, or `phoneNumberId`.

## Permissions

| Key | Inbox behavior |
| --- | --- |
| `whatsapp.read` | Open Inbox, search, history, internal mark-read |
| `whatsapp.send` | Enable composer when backend eligibility allows |
| `whatsapp.manage_connection` | Manage WhatsApp (Embedded Signup, change account, webhook setup, disconnect) |
| `whatsapp.link_customer` | Explicitly link/unlink a conversation to a Diamond Customer |

A reader without `whatsapp.send` sees a disabled composer: “You do not have permission to send WhatsApp messages.” / «ليس لديك صلاحية لإرسال رسائل واتساب.»

## Inbox behavior

- Search is backend-side (name, wa_id, preview)
- All / Unread is backend-side (`unread=true`)
- `unreadCount` is office staff unread. Outbound office messages do not increment it
- Opening a conversation loads messages then marks read internally
- Under Unread, the open chat stays open even if the row leaves the filtered list
- Older messages: “Load older messages”, prepend, dedupe by id, keep scroll
- Composer: open 24h window → text + attachment (image/document/audio/video) + optional template. Closed window → free-form disabled, **Use Template** for approved templates
- Media renders through `GET /whatsapp/messages/:id/media`. Simulation uses labeled previews (`sim-wa-*`) and never calls Meta
- Compact Customer strip: possible match / explicit link / unlink. WhatsApp display name is not Customer authority
- Manage WhatsApp (`whatsapp.manage_connection`): Connect / Change Account / Complete Setup / Disconnect. Official Embedded Signup (`FB.login` `response_type: code`). OAuth code is posted to the backend immediately and is not stored in localStorage/sessionStorage/URL
- No Online / Typing / Last seen
- `LINKED` ≠ messaging ready. Send also needs webhook `ACTIVE`, current connection, credentials. Free-form also needs an open 24-hour window

## Manual send (Phase 5)

Staff types text → domain hook → Zustand → `sendWhatsAppTextMessage()` → `POST /whatsapp/conversations/:id/messages`.

- Body is `{ text }` only. Recipient is derived server-side
- One UUID `Idempotency-Key` per user send action; reused if the HTTP response is slow. Send is disabled while submitting
- The UI merges the real persisted outbound row by Diamond message id. It does **not** invent `SENT` / `DELIVERED` / `READ` or a `providerMessageId`
- `ACCEPTED` (Meta HTTP accepted) is shown as Pending, not Sent. Webhook owns Sent / Delivered / Read / Failed
- Failed and uncertain outcomes stay visible. No Retry button. No automatic resend
- After send, the conversation stays open. List preview comes from the backend conversation payload
- Manual Refresh remains. Phase 6 adds authenticated SSE as a notification transport; REST remains source of truth. No polling loop

## Realtime (Phase 6)

`GET /whatsapp/realtime` (`whatsapp.read`) is an authenticated SSE notification stream. The Inbox uses a fetch + `Authorization` header client (native `EventSource` cannot send that header). Tokens are never placed in the query string.

SSE tells the browser that something changed. The Zustand store then applies a targeted REST refresh or a local id merge. If SSE is down, Inbox load, open, send, and Refresh still work.

Reconnect uses bounded exponential backoff and pauses while the browser is offline. 401/403 do not retry forever. After a successful reconnect, the client reconciles connection + conversation list + selected messages because durable replay is only a 15-minute outbox window (`Last-Event-ID`).

Office-level unread: when another tab/user marks a conversation read, `whatsapp.conversation.read` clears the badge here. Opening a chat still uses `POST /read`; an inbound SSE event does **not** mark the chat read by itself.

Live / Reconnecting in the WhatsApp header is transport state only. It is not Account Linked, Webhook Active, or send eligibility.

## Simulation

Optional frontend-only overlay when `NEXT_PUBLIC_DEMO_SIMULATION_ENABLED=true` **and** Simulation Mode is explicitly active. Local synthetic rows (`sim-wa-*`) never call the backend or Meta. Covers open/closed windows, approved templates, inbound/outbound media, FAILED/UNKNOWN, customer match/link, and connection states. Simulated realtime is in-memory and does not open `GET /whatsapp/realtime`. Removable without API, SSE, or domain changes. Real mode never falls back to simulation.

## Not in this page

AI/auto-reply, bulk/campaign send, WhatsApp Dock, WebSockets, Customer auto-create/update, Meta read receipts. **LIVE META VERIFICATION deferred.**
