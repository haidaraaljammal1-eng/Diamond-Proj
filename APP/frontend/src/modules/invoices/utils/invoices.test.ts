import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { formatAed } from "../../dashboard/utils/money.ts";
import {
  INVOICES_PAGE_PERMISSIONS,
  INVOICES_READ_PERMISSION,
  INVOICES_SEND_WHATSAPP_PERMISSION,
} from "../invoices.permissions.ts";
import type { InvoiceListItemDto } from "../types/invoices.types.ts";
import {
  buildInvoicesQuery,
  countInvoiceActiveFilters,
  DEFAULT_INVOICES_QUERY,
  hasInvoiceListFilters,
} from "./invoice-filters.ts";
import {
  formatInvoiceAmount,
  formatInvoiceCalendarDate,
  maskRecipientPhone,
} from "./invoice-format.ts";
import {
  deliveryStatusTranslationKey,
  invoiceTypeTranslationKey,
} from "./invoice-labels.ts";
import { resolveInvoicesErrorMessage } from "./resolve-invoices-error.ts";

const en = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "../../../../messages/en.json"), "utf8"),
) as { Invoices: Record<string, unknown>; navigation: { invoices: string } };
const ar = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "../../../../messages/ar.json"), "utf8"),
) as { Invoices: Record<string, unknown>; navigation: { invoices: string } };

const moduleRoot = path.join(import.meta.dirname, "..");

function read(relative: string): string {
  return readFileSync(path.join(moduleRoot, relative), "utf8");
}

function sampleItem(extra: Partial<InvoiceListItemDto> = {}): InvoiceListItemDto {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    invoiceNumber: 1100,
    invoiceType: "RENTAL",
    status: "ISSUED",
    companyId: 1,
    companyCode: "ELITE",
    companyName: "Diamond Elite",
    contractId: "22222222-2222-4222-8222-222222222222",
    contractNumber: "DRC-2401",
    vehicleId: 1,
    vehicleName: "Nissan Patrol",
    plateNumber: "Dubai A 12345",
    customerId: 1,
    customerName: "Ahmad Ali",
    issueDate: "2026-10-05T00:00:00.000Z",
    dueDate: "2026-11-04T00:00:00.000Z",
    currency: "AED",
    totalAmount: 1800,
    sourceLabel: "Rental",
    latestDeliveryStatus: null,
    createdAt: "2026-10-05T12:00:00.000Z",
    ...extra,
  };
}

describe("invoices permissions", () => {
  it("gates the page on invoices.read", () => {
    assert.equal(INVOICES_READ_PERMISSION, "invoices.read");
    assert.deepEqual([...INVOICES_PAGE_PERMISSIONS], ["invoices.read"]);
    assert.equal(INVOICES_SEND_WHATSAPP_PERMISSION, "invoices.send_whatsapp");
  });

  it("navigation uses invoices.read not adminOnly", () => {
    const config = readFileSync(
      path.join(import.meta.dirname, "../../navigation/navigation.config.ts"),
      "utf8",
    );
    assert.match(config, /INVOICES_PAGE_PERMISSIONS/);
    assert.match(config, /key:\s*"invoices"[\s\S]*permissions:\s*\[\.\.\.INVOICES_PAGE_PERMISSIONS\]/);
  });
});

describe("Invoices i18n", () => {
  it("has aligned navigation and page titles", () => {
    assert.equal(en.navigation.invoices, "Invoices");
    assert.equal(ar.navigation.invoices, "الفواتير");
    assert.equal((en.Invoices as { title: string }).title, "Invoices");
    assert.equal((ar.Invoices as { title: string }).title, "الفواتير");
  });
});

describe("invoice filters → API query", () => {
  it("defaults to ALL company without companyCode param", () => {
    const q = buildInvoicesQuery(DEFAULT_INVOICES_QUERY);
    assert.doesNotMatch(q, /companyCode=/);
    assert.match(q, /page=1/);
  });

  it("maps ELITE and UNIQUE company filters", () => {
    assert.match(buildInvoicesQuery({ ...DEFAULT_INVOICES_QUERY, companyCode: "ELITE" }), /companyCode=ELITE/);
    assert.match(buildInvoicesQuery({ ...DEFAULT_INVOICES_QUERY, companyCode: "UNIQUE" }), /companyCode=UNIQUE/);
  });

  it("maps search and invoice type", () => {
    const q = buildInvoicesQuery({
      ...DEFAULT_INVOICES_QUERY,
      search: "DRC-2401",
      invoiceType: "ROAD_LIABILITY",
    });
    assert.match(q, /search=DRC-2401/);
    assert.match(q, /invoiceType=ROAD_LIABILITY/);
  });

  it("maps date range to ISO boundaries", () => {
    const q = buildInvoicesQuery({
      ...DEFAULT_INVOICES_QUERY,
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
    });
    assert.match(q, /dateFrom=2026-10-01T00%3A00%3A00.000Z/);
    assert.match(q, /dateTo=2026-10-31T23%3A59%3A59.000Z/);
  });

  it("counts active filters for empty vs filtered states", () => {
    assert.equal(countInvoiceActiveFilters(DEFAULT_INVOICES_QUERY), 0);
    assert.equal(hasInvoiceListFilters(DEFAULT_INVOICES_QUERY), false);
    assert.equal(
      hasInvoiceListFilters({ ...DEFAULT_INVOICES_QUERY, companyCode: "ELITE" }),
      true,
    );
  });
});

describe("invoice display helpers", () => {
  it("formats calendar dates without timezone shift", () => {
    assert.equal(formatInvoiceCalendarDate("2026-10-05T00:00:00.000Z"), "05/10/2026");
  });

  it("formats AED amounts via shared formatter", () => {
    assert.equal(formatInvoiceAmount(1950, "AED"), formatAed(1950));
  });

  it("masks recipient phone", () => {
    assert.equal(maskRecipientPhone("+971501234567"), "•••• 4567");
  });

  it("maps delivery and type translation keys", () => {
    assert.equal(deliveryStatusTranslationKey(null), "delivery.notSent");
    assert.equal(deliveryStatusTranslationKey("DELIVERED"), "delivery.status.DELIVERED");
    assert.equal(invoiceTypeTranslationKey("RECONCILIATION"), "types.RECONCILIATION");
  });
});

describe("manual invoice controls must not exist", () => {
  const screen = read("components/invoices-screen/invoices-screen.tsx");
  const table = read("components/invoices-table/invoices-table.tsx");
  const dialog = read("components/invoice-whatsapp-dialog/invoice-whatsapp-dialog.tsx");
  const api = read("api/invoices.api.ts");

  it("has no create/edit/delete invoice UI", () => {
    assert.equal(screen.includes("Create Invoice"), false);
    assert.equal(screen.includes("Edit Invoice"), false);
    assert.equal(screen.includes("Delete"), false);
    assert.equal(table.includes("Create"), false);
  });

  it("whatsapp dialog has no phone input or amount editor", () => {
    assert.doesNotMatch(dialog, /type="tel"/);
    assert.doesNotMatch(dialog, /recipientPhone/);
    assert.doesNotMatch(dialog, /companyId/);
    assert.ok(dialog.includes("phoneHint"));
  });

  it("whatsapp POST only sends idempotency key", () => {
    assert.ok(api.includes("sendInvoiceWhatsApp"));
    assert.doesNotMatch(api, /recipientPhone/);
    assert.doesNotMatch(api, /amount/);
    assert.match(dialog, /idempotencyKeyRef/);
    assert.match(dialog, /disabled={sending/);
  });
});

describe("PDF uses backend endpoint", () => {
  it("does not render HTML invoice layout", () => {
    const api = read("api/invoices.api.ts");
    assert.match(api, /INVOICES_PATH}\/\$\{id\}\/pdf/);
    const screen = read("components/invoices-screen/invoices-screen.tsx");
    assert.equal(screen.includes("print("), false);
  });
});

describe("list rendering concepts", () => {
  it("supports multiple invoices on one contract", () => {
    const a = sampleItem({ id: "a", invoiceNumber: 1100, sourceLabel: "Rental" });
    const b = sampleItem({
      id: "b",
      invoiceNumber: 1101,
      sourceLabel: "Traffic Fine",
      totalAmount: 600,
    });
    assert.equal(a.contractNumber, b.contractNumber);
    assert.notEqual(a.invoiceNumber, b.invoiceNumber);
  });

  it("screen opens detail drawer", () => {
    const screen = read("components/invoices-screen/invoices-screen.tsx");
    assert.ok(screen.includes("InvoiceDetailDrawer"));
    assert.ok(screen.includes("selectInvoice"));
  });
});

describe("resolveInvoicesErrorMessage", () => {
  const t = Object.assign(
    (key: string) => {
      const invoices = en.Invoices as Record<string, unknown>;
      const errors = invoices.errors as Record<string, string>;
      return errors[key.replace("errors.", "")] ?? key;
    },
    {
      has: (key: string) => {
        const invoices = en.Invoices as Record<string, unknown>;
        const errors = invoices.errors as Record<string, string>;
        return Boolean(errors[key.replace("errors.", "")]);
      },
    },
  );

  it("maps WhatsApp unconfigured", () => {
    const message = resolveInvoicesErrorMessage(t, {
      name: "ApiRequestError",
      message: "x",
      code: "INTERNAL_ERROR",
      status: 503,
      context: { reason: "WHATSAPP_PROVIDER_UNCONFIGURED" },
    });
    assert.ok(message?.includes("WhatsApp"));
  });
});
