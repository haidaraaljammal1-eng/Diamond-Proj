import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { setPaymentProviderForTests } from "src/modules/contracts/payment/payment-provider.factory";
import {
  confirmPaymentViaWebhook,
  createFakePaymentProvider,
  type TestWebhookPayload,
} from "./fake-payment-provider";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

export const PAYMENT_PERMS = [
  "vehicles.read",
  "vehicles.manage",
  "contracts.read",
  "contracts.manage",
  "contracts.activate",
  "contracts.car_out",
  "contracts.return",
  "contracts.reconcile",
  "contracts.close",
  "contracts.renew",
  "violations.read",
  "violations.charge",
];

export async function seedPaymentUser(
  prisma: PrismaClient,
  email: string,
  password: string,
  roleKey: string,
  perms: string[],
) {
  const { hashPassword } = await import("src/lib/security/password");
  const { normalizeEmail } = await import("src/lib/security/normalize");
  const canonicalEmail = normalizeEmail(email);
  const role = await prisma.role.upsert({
    where: { key: roleKey },
    update: {},
    create: { key: roleKey, name: roleKey },
  });
  for (const key of perms) {
    const perm = await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, category: key.split(".")[0], description: key },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
      update: {},
      create: { roleId: role.id, permissionId: perm.id },
    });
  }
  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { email: canonicalEmail },
    update: { status: "ACTIVE", passwordHash },
    create: { email: canonicalEmail, name: roleKey, status: "ACTIVE", passwordHash },
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { email: canonicalEmail } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });
  return user.id;
}

export async function login(app: FastifyInstance, creds: { email: string; password: string }) {
  const res = await app.inject({ method: "POST", url: "/auth/login", payload: creds });
  assert.equal(res.statusCode, 200, res.body);
  return res.json().data.accessToken as string;
}

export function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

export async function seedReviewContract(
  prisma: PrismaClient,
  input: {
    run: string;
    seq: number;
    vehicleId: number;
    customerId: number;
    adminUserId: number;
    vehicleAvailable?: boolean;
  },
) {
  const contract = await prisma.contract.create({
    data: {
      companyId: await testCompanyId(prisma),
      contractNumber: `PAY-${input.run}-${input.seq}`,
      status: "REVIEW",
      vehicleId: input.vehicleId,
      customerId: input.customerId,
      createdByUserId: input.adminUserId,
      priceType: "DAILY",
      rentalDays: 3,
      agreedAmount: 1500,
      carOut: {
        create: {
          performedByUserId: input.adminUserId,
          occurredAt: new Date("2026-09-01T08:00:00.000Z"),
          mileageOut: 10,
          fuelOut: "F",
        },
      },
      carIn: {
        create: {
          occurredAt: new Date("2026-09-04T08:00:00.000Z"),
          mileageIn: 80,
          fuelIn: "1/2",
        },
      },
    },
  });
  if (input.vehicleAvailable) {
    await prisma.vehicle.update({
      where: { id: input.vehicleId },
      data: { operationalStatus: "AVAILABLE" },
    });
  }
  return contract;
}

export async function approveReconciliation570(
  app: FastifyInstance,
  token: string,
  contractId: string,
  roadLiabilityId: string,
) {
  const charge = await app.inject({
    method: "POST",
    url: `/contracts/${contractId}/reconciliation/road-liabilities/${roadLiabilityId}/confirm-charge`,
    headers: auth(token),
    payload: { customerChargeAmount: 120, adjustmentReason: "Administration fee" },
  });
  assert.equal(charge.statusCode, 200, charge.body);

  const rec = await app.inject({
    method: "POST",
    url: `/contracts/${contractId}/reconcile`,
    headers: auth(token),
    payload: {
      lines: [
        { type: "DAMAGE", description: "damage", amount: 300 },
        { type: "FUEL", description: "fuel", amount: 50 },
        { type: "LATE", description: "late", amount: 100 },
      ],
    },
  });
  assert.equal(rec.statusCode, 200, rec.body);
  assert.equal(rec.json().data.reconciliation.chargesTotal, 570);
  assert.equal(rec.json().data.reconciliation.finalAmount, 570);
  assert.ok(rec.json().data.reconciliation.approvedAt);
  assert.equal(rec.json().data.reconciliation.settled, false);
  return rec.json().data;
}

export function installPaymentProvider(run: string) {
  const payments = createFakePaymentProvider(run);
  setPaymentProviderForTests(payments.provider);
  return payments;
}

export async function startReconciliationPayment(
  app: FastifyInstance,
  token: string,
  contractId: string,
) {
  const res = await app.inject({
    method: "POST",
    url: `/contracts/${contractId}/reconciliation/payment`,
    headers: auth(token),
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json().data as {
    payment: { id: string; amount: number; status: string };
    statusToken: string | null;
    checkoutUrl: string | null;
  };
}

export async function settlePayment(
  app: FastifyInstance,
  payments: ReturnType<typeof createFakePaymentProvider>,
  paymentId: string,
  overrides?: Partial<TestWebhookPayload>,
) {
  return confirmPaymentViaWebhook(app, payments, paymentId, overrides);
}
