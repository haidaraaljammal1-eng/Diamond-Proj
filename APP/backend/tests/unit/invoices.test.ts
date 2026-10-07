import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addCalendarDaysUtc,
  deriveRentalQuantityAndRate,
  formatInvoiceAed,
  formatInvoiceDateDdMmYyyy,
  toUtcDateOnly,
} from "src/modules/invoices/invoice-money";
import { invoiceBrandingForCompany, resolveInvoiceBrandKey } from "src/modules/invoices/invoice-company-branding";
import { buildInvoiceWhatsAppMessage } from "src/modules/invoices/invoice-whatsapp-message";
import { invoicePdfFilename, renderInvoicePdfBuffer } from "src/modules/invoices/invoice-pdf.service";
import {
  APPROVED_INVOICE_SEQUENCE_START,
  rentalInvoiceOriginKey,
  reconciliationLineInvoiceOriginKey,
  roadLiabilityInvoiceOriginKey,
} from "src/modules/invoices/invoices.constants";
import { safeInvoiceSequenceNextNumber } from "src/modules/invoices/invoice-number-sequence.bootstrap";
import { allocateInvoiceNumber } from "src/modules/invoices/invoice-number-sequence.service";
import { invoiceLogoAssetPath } from "src/modules/invoices/invoice-logo";
import fs from "node:fs";
import type { Invoice, InvoiceLine } from "@prisma/client";
import type { Tx } from "src/lib/db/transaction";

test("rental origin key is idempotent per contract", () => {
  const id = "11111111-1111-1111-1111-111111111111";
  assert.equal(rentalInvoiceOriginKey(id), `RENTAL:${id}`);
  assert.equal(rentalInvoiceOriginKey(id), rentalInvoiceOriginKey(id));
});

test("road liability origin key uses customer charge id", () => {
  const id = "22222222-2222-2222-2222-222222222222";
  assert.equal(roadLiabilityInvoiceOriginKey(id), `ROAD_LIABILITY:${id}`);
});

test("Net 30 due date uses calendar days in UTC", () => {
  const issue = toUtcDateOnly(new Date("2026-07-02T15:00:00.000Z"));
  const due = addCalendarDaysUtc(issue, 30);
  assert.equal(formatInvoiceDateDdMmYyyy(due), "01/08/2026");
});

test("AED formatting matches invoice style", () => {
  assert.equal(formatInvoiceAed(1950), "AED1,950.00");
  assert.equal(formatInvoiceAed(80), "AED80.00");
});

test("derive rental qty/rate uses integer division when exact", () => {
  const derived = deriveRentalQuantityAndRate({
    durationValue: 3,
    durationUnit: "DAY",
    priceType: "DAILY",
    agreedAmount: 900,
  });
  assert.deepEqual(derived, { quantity: 3, unitRate: 300 });
});

test("custom pricing falls back to qty 1", () => {
  const derived = deriveRentalQuantityAndRate({
    durationValue: 3,
    durationUnit: "DAY",
    priceType: "CUSTOM",
    agreedAmount: 900,
  });
  assert.deepEqual(derived, { quantity: 1, unitRate: 900 });
});

test("non-divisible agreed amount falls back to qty 1", () => {
  const derived = deriveRentalQuantityAndRate({
    durationValue: 3,
    durationUnit: "DAY",
    priceType: "DAILY",
    agreedAmount: 1000,
  });
  assert.deepEqual(derived, { quantity: 1, unitRate: 1000 });
});

test("ELITE and UNIQUE branding keys resolve from company code", () => {
  assert.equal(resolveInvoiceBrandKey({ code: "ELITE" }), "ELITE");
  assert.equal(resolveInvoiceBrandKey({ code: "UNIQUE" }), "UNIQUE");
  const elite = invoiceBrandingForCompany({
    id: 1,
    code: "ELITE",
    displayName: "ELITE",
    legalNameAr: "x",
    legalNameEn: "DIAMOND ELITE CAR RENTALS CO. LLC S.O.C",
    accentColor: "#000",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  assert.equal(elite.brandKey, "ELITE");
  assert.match(elite.displayName, /ELITE/);
});

test("WhatsApp message includes invoice and contract context", () => {
  const message = buildInvoiceWhatsAppMessage({
    customerName: "Test Person",
    invoiceNumber: 1035,
    contractNumber: "DRC-2401",
    totalAmount: 1800,
    companyDisplayName: "DIAMOND ELITE RENT CAR",
  });
  assert.match(message, /Invoice 1035/);
  assert.match(message, /Contract DRC-2401/);
  assert.match(message, /AED1,800.00/);
  assert.doesNotMatch(message, /undefined/);
});

test("PDF filename follows company brand", () => {
  assert.equal(
    invoicePdfFilename({ companyBrandKeySnapshot: "ELITE", invoiceNumber: 12 }),
    "Diamond-Elite-Invoice-12.pdf",
  );
  assert.equal(
    invoicePdfFilename({ companyBrandKeySnapshot: "UNIQUE", invoiceNumber: 44 }),
    "Diamond-Unique-Invoice-44.pdf",
  );
});

test("PDF generator returns valid PDF bytes with invoice metadata", async () => {
  const now = new Date("2026-07-02T00:00:00.000Z");
  const invoice: Invoice & { lines: InvoiceLine[] } = {
    id: "inv-1",
    invoiceNumber: 1035,
    invoiceType: "RENTAL",
    status: "ISSUED",
    companyId: 1,
    contractId: "c-1",
    vehicleId: 1,
    customerId: 1,
    issueDate: now,
    dueDate: addCalendarDaysUtc(now, 30),
    termsSnapshot: "Net 30",
    currency: "AED",
    customerNameSnapshot: "John Doe",
    contractNumberSnapshot: "DRC-2401",
    vehicleNameSnapshot: "Nissan Patrol",
    plateNumberSnapshot: "A 12345",
    companyDisplayNameSnapshot: "DIAMOND ELITE RENT CAR",
    companyAddressSnapshot: "Dubai",
    companyEmailSnapshot: "info@test.ae",
    companyBrandKeySnapshot: "ELITE",
    subtotalAmount: 1800,
    totalAmount: 1800,
    balanceDueSnapshot: 1800,
    templateVersion: "v1",
    originEventKey: "RENTAL:c-1",
    issuedAt: now,
    issuedByUserId: null,
    createdAt: now,
    updatedAt: now,
    lines: [
      {
        id: "line-1",
        invoiceId: "inv-1",
        position: 1,
        lineType: "RENTAL",
        serviceLabel: "Rental Income",
        description: "Rental income from 02/07/2026",
        quantity: 3,
        unitRate: 600,
        amount: 1800,
        sourceType: "CONTRACT_RENTAL",
        sourceId: "c-1",
        createdAt: now,
      },
    ],
  };
  const buffer = await renderInvoicePdfBuffer(invoice);
  assert.ok(buffer.length > 100);
  assert.equal(buffer.subarray(0, 4).toString("utf8"), "%PDF");
  const latin = buffer.toString("latin1");
  assert.match(latin, /1035/);
  assert.match(latin, /Invoice 1035/);
  assert.match(latin, /\/Image/);
});

test("approved sequence start constant is 1100", () => {
  assert.equal(APPROVED_INVOICE_SEQUENCE_START, 1100);
});

test("safeInvoiceSequenceNextNumber uses 1100 when no invoices exist", () => {
  assert.equal(safeInvoiceSequenceNextNumber(null), 1100);
  assert.equal(safeInvoiceSequenceNextNumber(0), 1100);
});

test("safeInvoiceSequenceNextNumber uses 1100 when max issued is below baseline", () => {
  assert.equal(safeInvoiceSequenceNextNumber(1044), 1100);
  assert.equal(safeInvoiceSequenceNextNumber(1099), 1100);
});

test("safeInvoiceSequenceNextNumber advances when max issued is at or above baseline", () => {
  assert.equal(safeInvoiceSequenceNextNumber(1100), 1101);
  assert.equal(safeInvoiceSequenceNextNumber(1157), 1158);
});

test("safeInvoiceSequenceNextNumber is independent per company inputs", () => {
  assert.equal(safeInvoiceSequenceNextNumber(1100), 1101);
  assert.equal(safeInvoiceSequenceNextNumber(null), 1100);
});

test("allocateInvoiceNumber assigns 1100 then advances to 1101", async () => {
  let next = 1100;
  const tx = {
    invoiceNumberSequence: {
      findUnique: async () => ({ companyId: 1, nextNumber: next }),
      update: async ({ data }: { data: { nextNumber: number } }) => {
        next = data.nextNumber;
        return {};
      },
    },
  } as unknown as Tx;
  const first = await allocateInvoiceNumber(tx, 1);
  assert.equal(first, 1100);
  assert.equal(next, 1101);
  const second = await allocateInvoiceNumber(tx, 1);
  assert.equal(second, 1101);
});

test("reconciliation line origin keys are unique per line", () => {
  const lineId = "33333333-3333-3333-3333-333333333333";
  assert.equal(reconciliationLineInvoiceOriginKey(lineId), `RECONCILIATION_LINE:${lineId}`);
});

test("official ELITE and UNIQUE logo asset files exist locally", () => {
  assert.ok(fs.existsSync(invoiceLogoAssetPath("ELITE")));
  assert.ok(fs.existsSync(invoiceLogoAssetPath("UNIQUE")));
});

test("UNIQUE PDF embeds raster logo (Image XObject)", async () => {
  const now = new Date("2026-07-02T00:00:00.000Z");
  const invoice: Invoice & { lines: InvoiceLine[] } = {
    id: "inv-u",
    invoiceNumber: 1100,
    invoiceType: "RENTAL",
    status: "ISSUED",
    companyId: 2,
    contractId: "c-2",
    vehicleId: 2,
    customerId: 2,
    issueDate: now,
    dueDate: addCalendarDaysUtc(now, 30),
    termsSnapshot: "Net 30",
    currency: "AED",
    customerNameSnapshot: "Unique Client",
    contractNumberSnapshot: "DRC-UNQ",
    vehicleNameSnapshot: "SUV",
    plateNumberSnapshot: "U 999",
    companyDisplayNameSnapshot: "DIAMOND UNIQUE RENT CAR",
    companyAddressSnapshot: "Dubai",
    companyEmailSnapshot: "info@unique.ae",
    companyBrandKeySnapshot: "UNIQUE",
    subtotalAmount: 500,
    totalAmount: 500,
    balanceDueSnapshot: 500,
    templateVersion: "v1",
    originEventKey: "RENTAL:c-2",
    issuedAt: now,
    issuedByUserId: null,
    createdAt: now,
    updatedAt: now,
    lines: [
      {
        id: "line-u",
        invoiceId: "inv-u",
        position: 1,
        lineType: "RENTAL",
        serviceLabel: "Car Rental Income",
        description: "Rental income from 02/07/2026",
        quantity: 1,
        unitRate: 500,
        amount: 500,
        sourceType: "CONTRACT_RENTAL",
        sourceId: "c-2",
        createdAt: now,
      },
    ],
  };
  const buffer = await renderInvoicePdfBuffer(invoice);
  assert.match(buffer.toString("latin1"), /\/Image/);
});

test("WhatsApp message body does not accept phone override (builder is server-side only)", () => {
  const message = buildInvoiceWhatsAppMessage({
    customerName: "A",
    invoiceNumber: 1,
    contractNumber: "C-1",
    totalAmount: 10,
    companyDisplayName: "DIAMOND ELITE RENT CAR",
  });
  assert.doesNotMatch(message, /\+971/);
});
