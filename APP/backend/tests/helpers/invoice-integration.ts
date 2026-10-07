import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { seedReadyIdentity } from "tests/helpers/public-identity";
import { companyId, type CompanyCode } from "tests/helpers/operating-company";
import { configureInvoiceNumberSequence } from "src/modules/invoices/invoice-number-sequence.service";
import { APPROVED_INVOICE_SEQUENCE_START } from "src/modules/invoices/invoices.constants";
import { createInvoiceOutboxConsumer } from "src/modules/invoices/invoice-outbox-consumer";
import { withTransaction } from "src/lib/db/transaction";

export async function configureTestInvoiceSequences(
  prisma: PrismaClient,
  start = APPROVED_INVOICE_SEQUENCE_START,
): Promise<void> {
  for (const code of ["ELITE", "UNIQUE"] as const) {
    const id = await companyId(prisma, code);
    await withTransaction(prisma, async (tx) => {
      await configureInvoiceNumberSequence(tx, id, start);
    });
  }
}

export async function drainInvoiceOutbox(app: FastifyInstance): Promise<number> {
  const consumer = createInvoiceOutboxConsumer(app);
  let total = 0;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { processed } = await consumer.runInvoiceOutboxCycle();
    total += processed;
    if (processed === 0 && attempt > 0) break;
  }
  return total;
}

export async function signContractViaPublicRental(
  app: FastifyInstance,
  prisma: PrismaClient,
  input: {
    authHeaders: Record<string, string>;
    companyCode: CompanyCode;
    run: string;
    agreedAmount: number;
    customerName?: string;
    mobile?: string;
  },
): Promise<{ contractId: string; contractNumber: string; vehicleId: number }> {
  const cid = await companyId(prisma, input.companyCode);
  const vehicleRes = await app.inject({
    method: "POST",
    url: "/vehicles",
    headers: input.authHeaders,
    payload: {
      companyId: cid,
      vehicleName: `INV-${input.run}`,
      plateNumber: `INV ${input.run}`,
      dailyRate: 400,
    },
  });
  assert.equal(vehicleRes.statusCode, 201, vehicleRes.body);
  const vehicleId = vehicleRes.json().data.id as number;

  const offer = await app.inject({
    method: "POST",
    url: "/contracts/offers",
    headers: input.authHeaders,
    payload: {
      vehicleId,
      priceType: "DAILY",
      rentalDays: 3,
      agreedAmount: input.agreedAmount,
      collectionMode: "ELECTRONIC",
    },
  });
  assert.equal(offer.statusCode, 201, offer.body);
  const contractId = offer.json().data.id as string;
  const contractNumber = offer.json().data.contractNumber as string;

  const linkRes = await app.inject({
    method: "POST",
    url: `/contracts/${contractId}/rental-link`,
    headers: input.authHeaders,
  });
  assert.equal(linkRes.statusCode, 200, linkRes.body);
  const rentalToken = linkRes.json().data.link.token as string;

  await seedReadyIdentity(app, rentalToken, { licenseNumber: "DL-INV", expiryDate: "2030-01-01" });

  const form = await app.inject({
    method: "POST",
    url: `/contracts/rental/${rentalToken}/form`,
    payload: {
      name: input.customerName ?? "Invoice Customer",
      mobile: input.mobile ?? "+971500011100",
      nationality: "AE",
      identityNumber: `784-${input.run}`,
      drivingLicenseNumber: "DL-INV",
    },
  });
  assert.equal(form.statusCode, 200, form.body);

  const accept = await app.inject({
    method: "POST",
    url: `/contracts/rental/${rentalToken}/accept`,
    payload: {},
  });
  assert.equal(accept.statusCode, 200, accept.body);
  assert.equal(accept.json().data.contract.status, "SIGNED");

  return { contractId, contractNumber, vehicleId };
}
