# Invoices backend (V1 foundation)

Backend-only customer invoice documents. Invoices are **immutable snapshots** issued automatically from authoritative business sources. They do not drive payments, ledger, or contract lifecycle.

## Automatic triggers

Issuance keeps one current consolidated invoice per contract (`CONTRACT_INVOICE:<contractId>:rN`). A later event creates the next revision and marks the previous snapshot historical. Closing a contract does not create a second rental invoice.

| Event | Line added to the current revision |
|-------|--------------------------------------|
| `contract.paid` / confirmed rental payment | `RENTAL`, from the confirmed rental payment amount |
| `contract.renewed` | `RENEWAL`, only after `appliedAt` |
| `reconciliation.finalized` | Reconciliation lines, including a road-liability line |
| `road_liability.customer_charge.confirmed` | `DIRECT_COLLECTION` charge, or the reconciliation line when that is the destination |

**Renewal:** a renewal line is added only after the extension is applied (`appliedAt`). Public approval that is still awaiting payment does not invoice the offer. A captured renewal payment that could not be applied stays off the invoice.

**Double billing:** a road liability appears once. `DIRECT_COLLECTION` uses the customer charge. A `RECONCILIATION` charge is the reconciliation line itself, including lines with `roadLiabilityId`. The same liability is not added again from the charge or from a post-close receivable.

**RENTAL payment timing:** Electronic rentals stay `SIGNED` until trusted payment confirmation → `PAID`; only then is the RENTAL invoice issued. CASH rentals still settle on signature in the same authoritative flow, emit `contract.paid`, and issue the invoice immediately after commit. New RENTAL PDFs for fully collected rentals show **Paid in full**, **balance due 0**, and **Received in full** (not Net 30 / full balance due).

## Company authority

`Invoice.companyId` is always `Contract.companyId` (frozen at contract creation). Staff cannot select company on invoice APIs.

## Invoice numbering

Per-company `InvoiceNumberSequence` (`companyId` → `nextNumber`). The allocator increments the row in one `UPDATE ... RETURNING`, so concurrent contracts in the same company cannot take the same number. **Approved dev initial value (human decision): 1100 for ELITE and UNIQUE independently** — configured idempotently by `dev:bootstrap` (`ensureDevelopmentInvoiceNumberSequences`) when no invoices exist yet; existing production sequences are never silently overwritten if invoices were issued. Reference PDF numbers (1035 / 1044) are not used as defaults.

## Staff APIs (admin)

- `GET /invoices` — list/filter (`companyCode`, `companyId`, `contractId`, search, dates, …)
- `GET /invoices/:id` — detail + lines + delivery summary
- `GET /invoices/:id/pdf` — canonical PDF (`?download=1` for attachment)
- `GET /invoices/:id/deliveries` — delivery history
- `POST /invoices/:id/deliveries/whatsapp` — send PDF via WhatsApp provider abstraction (fails closed if unconfigured)

Permissions: `invoices.read`, `invoices.send_whatsapp` (seed via `PERMISSION_CATALOG`).

## WhatsApp

Staff send uses `createWhatsAppSendService().sendMedia` on a resolved DIRECT conversation (`Customer.mobile` → digit `customerWaId`). Uses an existing **staff-linked** thread when `customerId` and recipient digits (or staff-linked `@lid`) match; otherwise reuses or creates an **unlinked** conversation — invoice send never sets `customerId`. Outbound messages, attempts, media archive, and realtime events follow the standard WhatsApp module lifecycle. `InvoiceDelivery`: `SENT` only on provider `ACCEPTED`; `SEND_UNKNOWN` stays `SENDING` (not failed, same idempotency key must not auto-resend); `DELIVERED` is not inferred from HTTP accept.

No manual invoice creation, edit, or delete endpoints in V1.
