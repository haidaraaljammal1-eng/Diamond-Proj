import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "src/constants/permissions";
import { auth, login, seedPaymentUser } from "../helpers/payment-integration-helpers";
import { companyId } from "../helpers/operating-company";
import { resetWhatsAppTables } from "../helpers/whatsapp-reset";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test("whatsapp customer context skipped", { skip: true });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("WhatsApp customer context", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    let linkerToken = "";
    let readerToken = "";
    let conversationId = "";
    let customerId = 0;
    let eliteContractId = "";
    let uniqueContractId = "";

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("customer context tests require haidara_test");
      }
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      await resetWhatsAppTables(prisma);
      const linker = { email: `wa-ctx-l-${run}@example.test`, password: "wa-ctx-link-123" };
      const reader = { email: `wa-ctx-r-${run}@example.test`, password: "wa-ctx-read-123" };
      await seedPaymentUser(prisma, linker.email, linker.password, `wa_ctx_l_${run}`, [
        PERMISSIONS.WHATSAPP_READ,
        PERMISSIONS.WHATSAPP_LINK_CUSTOMER,
        PERMISSIONS.CUSTOMERS_READ,
        PERMISSIONS.CUSTOMERS_VIEW_ALL_BRANCHES,
        PERMISSIONS.CONTRACTS_READ,
      ]);
      await seedPaymentUser(prisma, reader.email, reader.password, `wa_ctx_r_${run}`, [
        PERMISSIONS.WHATSAPP_READ,
      ]);
      linkerToken = await login(app, linker);
      readerToken = await login(app, reader);
      const connection = await prisma.whatsAppConnection.create({
        data: {
          provider: "META_CLOUD_API",
          status: "LINKED",
          providerInstanceId: `ctx-${run}`,
          providerSessionStatus: "AUTHENTICATED",
          credentialCiphertext: "test",
          webhookCallbackCiphertext: "test",
        },
      });
      const customer = await prisma.customer.create({
        data: { name: `CTX ${run}`, mobile: `9715${run.slice(-8)}` },
      });
      customerId = customer.id;
      const convo = await prisma.whatsAppConversation.create({
        data: {
          connectionId: connection.id,
          customerWaId: customer.mobile!,
          providerChatId: `${customer.mobile}@s.whatsapp.net`,
          customerId: customer.id,
          customerLinkedAt: new Date(),
        },
      });
      conversationId = convo.id;
      const actor = await prisma.user.findFirstOrThrow({ where: { email: "admin@diamond.test" } });
      const eliteId = await companyId(prisma, "ELITE");
      const uniqueId = await companyId(prisma, "UNIQUE");
      const vehicleElite = await prisma.vehicle.create({
        data: {
          companyId: eliteId,
          vehicleName: `CTX ELITE ${run}`,
          plateNumber: `CE${run}`.slice(0, 20),
          dailyRate: 300,
          operationalStatus: "RENTED",
        },
      });
      const vehicleUnique = await prisma.vehicle.create({
        data: {
          companyId: uniqueId,
          vehicleName: `CTX UNIQUE ${run}`,
          plateNumber: `CU${run}`.slice(0, 20),
          dailyRate: 300,
          operationalStatus: "AVAILABLE",
        },
      });
      const elite = await prisma.contract.create({
        data: {
          contractNumber: `CTX-E-${run}`,
          companyId: eliteId,
          vehicleId: vehicleElite.id,
          customerId: customer.id,
          createdByUserId: actor.id,
          status: "ACTIVE",
          startAt: new Date("2026-10-01"),
          endAt: new Date("2026-10-20T18:00:00.000Z"),
          agreedAmount: 1000,
          rentalDays: 5,
          durationValue: 5,
          durationUnit: "DAY",
          priceType: "DAILY",
          collectionMode: "ELECTRONIC",
          collectionModeSelectedAt: new Date(),
        },
      });
      eliteContractId = elite.id;
      const unique = await prisma.contract.create({
        data: {
          contractNumber: `CTX-U-${run}`,
          companyId: uniqueId,
          vehicleId: vehicleUnique.id,
          customerId: customer.id,
          createdByUserId: actor.id,
          status: "PAID",
          startAt: new Date("2026-10-05"),
          endAt: new Date("2026-10-25T18:00:00.000Z"),
          agreedAmount: 800,
          rentalDays: 4,
          durationValue: 4,
          durationUnit: "DAY",
          priceType: "DAILY",
          collectionMode: "ELECTRONIC",
          collectionModeSelectedAt: new Date(),
        },
      });
      uniqueContractId = unique.id;
    });

    after(async () => {
      await app.close();
    });

    test("returns ACTIVE ELITE rental ahead of UNIQUE PAID and exposes company codes", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/whatsapp/conversations/${conversationId}/customer-context`,
        headers: auth(linkerToken),
      });
      assert.equal(res.statusCode, 200, res.body);
      const data = res.json().data;
      assert.equal(data.linked, true);
      assert.equal(data.customer?.id, customerId);
      assert.equal(data.contracts?.active?.id, eliteContractId);
      assert.equal(data.contracts?.active?.companyCode, "ELITE");
      assert.equal(data.contracts?.latest, null);
      assert.equal(data.contracts?.active?.id, eliteContractId);
      assert.notEqual(data.contracts?.active?.id, uniqueContractId);
    });

    test("reader without customers.read gets linked context without customer or contract payloads", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/whatsapp/conversations/${conversationId}/customer-context`,
        headers: auth(readerToken),
      });
      assert.equal(res.statusCode, 200, res.body);
      const data = res.json().data;
      assert.equal(data.linked, true);
      assert.equal(data.customer, null);
      assert.equal(data.contracts?.canRead, false);
      assert.equal(data.contracts?.active, null);
      assert.equal(data.contracts?.latest, null);
      const blob = JSON.stringify(data);
      assert.equal(blob.includes("CTX ELITE"), false);
      assert.equal(blob.includes(eliteContractId), false);
      assert.equal(blob.includes("ELITE"), false);
      assert.equal(blob.includes("UNIQUE"), false);
    });
  });
}
