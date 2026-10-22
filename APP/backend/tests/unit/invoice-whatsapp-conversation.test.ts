import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AppError } from "src/lib/errors/app-error";
import {
  invoiceConversationRecipientMatchesMobile,
  resolveInvoiceWhatsAppConversation,
} from "src/modules/invoices/invoice-whatsapp-conversation";

const CONNECTION_ID = "00000000-0000-4000-8000-000000000010";

type Conv = {
  id: string;
  customerWaId: string;
  customerId: number | null;
  providerChatId: string | null;
};

function mockPrisma(state: {
  linked?: Conv[];
  byWa?: Conv[];
  createData?: unknown;
}) {
  const store = {
    linked: state.linked ?? [],
    byWa: state.byWa ?? [],
    created: null as Conv | null,
    lastCreateData: null as Record<string, unknown> | null,
  };
  return {
    whatsAppConversation: {
      findMany: async (args: { where: { customerId?: number; customerWaId?: string } }) => {
        if (args.where.customerId != null) return [...store.linked];
        if (args.where.customerWaId != null) return [...store.byWa];
        return [];
      },
      findUnique: async () => null,
      create: async (args: { data: { customerWaId: string; customerId?: number } }) => {
        store.lastCreateData = args.data as Record<string, unknown>;
        const row: Conv = {
          id: "00000000-0000-4000-8000-000000000099",
          customerWaId: args.data.customerWaId,
          customerId: args.data.customerId ?? null,
          providerChatId: null,
        };
        store.created = row;
        return { id: row.id };
      },
    },
    _store: store,
  } as unknown as import("@prisma/client").PrismaClient & { _store: typeof store };
}

describe("invoiceConversationRecipientMatchesMobile", () => {
  it("matches digit customerWaId to mobile digits", () => {
    assert.equal(
      invoiceConversationRecipientMatchesMobile(
        { customerWaId: "971501234567", providerChatId: null },
        "971501234567",
        false,
      ),
      true,
    );
  });

  it("rejects digit mismatch", () => {
    assert.equal(
      invoiceConversationRecipientMatchesMobile(
        { customerWaId: "971509999999", providerChatId: null },
        "971501234567",
        false,
      ),
      false,
    );
  });

  it("rejects opaque @lid — does not prove Customer.mobile equality", () => {
    assert.equal(
      invoiceConversationRecipientMatchesMobile(
        { customerWaId: "12345@lid", providerChatId: null },
        "971501234567",
        true,
      ),
      false,
    );
  });
});

describe("resolveInvoiceWhatsAppConversation", () => {
  it("uses staff-linked conversation when digits match", async () => {
    const prisma = mockPrisma({
      linked: [
        {
          id: "00000000-0000-4000-8000-000000000020",
          customerWaId: "971501234567",
          customerId: 42,
          providerChatId: null,
        },
      ],
    });
    const result = await resolveInvoiceWhatsAppConversation(prisma, {
      connectionId: CONNECTION_ID,
      customerId: 42,
      mobile: "+971 50 123 4567",
    });
    assert.equal(result.conversationId, "00000000-0000-4000-8000-000000000020");
    assert.equal(prisma._store.created, null);
  });

  it("rejects staff-linked conversation when wa digits differ from Customer.mobile", async () => {
    const prisma = mockPrisma({
      linked: [
        {
          id: "00000000-0000-4000-8000-000000000021",
          customerWaId: "971509999999",
          customerId: 42,
          providerChatId: null,
        },
      ],
    });
    await assert.rejects(
      () =>
        resolveInvoiceWhatsAppConversation(prisma, {
          connectionId: CONNECTION_ID,
          customerId: 42,
          mobile: "+971501234567",
        }),
      (err: unknown) => err instanceof AppError && err.context?.reason === "INVOICE_WHATSAPP_RECIPIENT_AMBIGUOUS",
    );
  });

  it("reuses unlinked conversation by customerWaId without setting customerId", async () => {
    const prisma = mockPrisma({
      byWa: [
        {
          id: "00000000-0000-4000-8000-000000000030",
          customerWaId: "971501234567",
          customerId: null,
          providerChatId: null,
        },
      ],
    });
    const result = await resolveInvoiceWhatsAppConversation(prisma, {
      connectionId: CONNECTION_ID,
      customerId: 42,
      mobile: "971501234567",
    });
    assert.equal(result.conversationId, "00000000-0000-4000-8000-000000000030");
    assert.equal(prisma._store.created, null);
  });

  it("rejects unlinked conversation linked to another customer", async () => {
    const prisma = mockPrisma({
      byWa: [
        {
          id: "00000000-0000-4000-8000-000000000031",
          customerWaId: "971501234567",
          customerId: 99,
          providerChatId: null,
        },
      ],
    });
    await assert.rejects(
      () =>
        resolveInvoiceWhatsAppConversation(prisma, {
          connectionId: CONNECTION_ID,
          customerId: 42,
          mobile: "971501234567",
        }),
      (err: unknown) => err instanceof AppError,
    );
  });

  it("creates unlinked conversation with digit customerWaId only", async () => {
    const prisma = mockPrisma({});
    const result = await resolveInvoiceWhatsAppConversation(prisma, {
      connectionId: CONNECTION_ID,
      customerId: 42,
      mobile: "+971501234567",
    });
    assert.equal(result.conversationId, "00000000-0000-4000-8000-000000000099");
    assert.deepEqual(prisma._store.lastCreateData, {
      connectionId: CONNECTION_ID,
      kind: "DIRECT",
      customerWaId: "971501234567",
      unreadCount: 0,
    });
  });
});
