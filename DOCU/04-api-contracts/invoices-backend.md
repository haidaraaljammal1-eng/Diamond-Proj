# Invoices backend (V1 foundation)

Backend-only customer invoice documents. Invoices are **immutable snapshots** issued automatically from authoritative business sources. They do not drive payments, ledger, or contract lifecycle.

## Automatic triggers

| Event | Source | Invoice type | Idempotency |
|-------|--------|--------------|-------------|
| `contract.paid` | `Contract` (`agreedAmount`, **CONFIRMED** RENTAL payment) | `RENTAL` | `RENTAL:<contractId>` |
| `road_liability.customer_charge.confirmed` | `RoadLiabilityCustomerCharge` | `ROAD_LIABILITY` | `ROAD_LIABILITY:<chargeId>` |
| `reconciliation.finalized` | `ContractReconciliationLine` (non–road-liability lines) | `RECONCILIATION` (one invoice per line) | `RECONCILIATION_LINE:<lineId>` |

**Renewal:** model supports `RENEWAL`; automatic generation is **deferred** until renewal payment semantics are unambiguous.

**Double billing:** Road liability amounts invoice from `RoadLiabilityCustomerCharge` only. Reconciliation invoice generation skips lines with `roadLiabilityId`.

**RENTAL payment timing:** Electronic rentals stay `SIGNED` until trusted payment confirmation → `PAID`; only then is the RENTAL invoice issued. CASH rentals still settle on signature in the same authoritative flow, emit `contract.paid`, and issue the invoice immediately after commit. New RENTAL PDFs for fully collected rentals show **Paid in full**, **balance due 0**, and **Received in full** (not Net 30 / full balance due).

## Company authority

`Invoice.companyId` is always `Contract.companyId` (frozen at contract creation). Staff cannot select company on invoice APIs.

## Invoice numbering

Per-company `InvoiceNumberSequence` (`companyId` → `nextNumber`). Allocator assigns `nextNumber` then increments. **Approved dev initial value (human decision): 1100 for ELITE and UNIQUE independently** — configured idempotently by `dev:bootstrap` (`ensureDevelopmentInvoiceNumberSequences`) when no invoices exist yet; existing production sequences are never silently overwritten if invoices were issued. Reference PDF numbers (1035 / 1044) are not used as defaults.

## Staff APIs (admin)

- `GET /invoices` — list/filter (`companyCode`, `companyId`, `contractId`, search, dates, …)
- `GET /invoices/:id` — detail + lines + delivery summary
- `GET /invoices/:id/pdf` — canonical PDF (`?download=1` for attachment)
- `GET /invoices/:id/deliveries` — delivery history
- `POST /invoices/:id/deliveries/whatsapp` — send PDF via WhatsApp provider abstraction (fails closed if unconfigured)

Permissions: `invoices.read`, `invoices.send_whatsapp` (seed via `PERMISSION_CATALOG`).

## WhatsApp

Uses existing `WhatsAppProvider` (`uploadMedia` + `sendMediaMessage` document). `InvoiceDelivery` stores attempts, snapshots, and provider message id for future webhook updates.

No manual invoice creation, edit, or delete endpoints in V1.
