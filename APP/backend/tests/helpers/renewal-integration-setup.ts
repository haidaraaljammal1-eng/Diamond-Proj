import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { CAR_OUT_REQUIRED_ANGLES } from "src/modules/contracts/contracts.constants";
import { seedReadyIdentity } from "./public-identity";
import {
  confirmRentalPaymentViaStatusToken,
  createFakePaymentProvider,
  linkCardViaFakeProvider,
} from "./fake-payment-provider";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

export const RENEWAL_GUARD_PERMS = [
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
  "finance.read",
];

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lV8AAAAASUVORK5CYII=",
  "base64",
);

export function multipart(bytes: Buffer, mime = "image/png") {
  const boundary = "----diamond-renewal-test";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="t.png"\r\nContent-Type: ${mime}\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return {
    payload: body,
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
  };
}

export async function seedRenewalGuardUser(
  prisma: PrismaClient,
  email: string,
  password: string,
  roleKey: string,
) {
  const { hashPassword } = await import("src/lib/security/password");
  const { normalizeEmail } = await import("src/lib/security/normalize");
  const canonical = normalizeEmail(email);
  const role = await prisma.role.upsert({
    where: { key: roleKey },
    update: {},
    create: { key: roleKey, name: roleKey },
  });
  for (const key of RENEWAL_GUARD_PERMS) {
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
    where: { email: canonical },
    update: { status: "ACTIVE", passwordHash },
    create: { email: canonical, name: roleKey, status: "ACTIVE", passwordHash },
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { email: canonical } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });
  return user.id;
}

export async function createActiveRentalContract(
  app: FastifyInstance,
  prisma: PrismaClient,
  authHeaders: () => Record<string, string>,
  run: string,
  seq: number,
) {
  let localSeq = seq;
  const nextAttachment = async () => {
    localSeq += 1;
    const key = `rg-${run}-${seq}-${localSeq}-${Date.now().toString(36)}`;
    const row = await prisma.attachment.create({
      data: {
        originalName: `${key}.png`,
        storageKey: key,
        mimeType: "image/png",
        size: 8,
      },
    });
    return row.id;
  };

  const vehicleRes = await app.inject({
    method: "POST",
    url: "/vehicles",
    headers: authHeaders(),
    payload: {
      companyId: await testCompanyId(prisma),
      vehicleName: `RG-${run}-${seq}`,
      plateNumber: `R${randomUUID().replace(/-/g, "").slice(0, 18)}`,
      dailyRate: 400,
    },
  });
  assert.equal(vehicleRes.statusCode, 201, vehicleRes.body);
  const vehicleId = vehicleRes.json().data.id as number;

  const offer = await app.inject({
    method: "POST",
    url: "/contracts/offers",
    headers: authHeaders(),
    payload: {
      vehicleId,
      priceType: "DAILY",
      rentalDays: 3,
      agreedAmount: 1500,
      collectionMode: "ELECTRONIC",
    },
  });
  assert.equal(offer.statusCode, 201, offer.body);
  const contractId = offer.json().data.id as string;
  const contractNumber = offer.json().data.contractNumber as string;

  const linkRes = await app.inject({
    method: "POST",
    url: `/contracts/${contractId}/rental-link`,
    headers: authHeaders(),
  });
  assert.equal(linkRes.statusCode, 200, linkRes.body);
  const rentalToken = linkRes.json().data.link.token as string;
  await seedReadyIdentity(app, rentalToken, { licenseNumber: "DL-RG", expiryDate: "2030-01-01" });

  const form = await app.inject({
    method: "POST",
    url: `/contracts/rental/${rentalToken}/form`,
    payload: {
      name: "Renewal Guard Customer",
      mobile: "+971500000888",
      nationality: "AE",
      identityNumber: "784-1990-888",
      drivingLicenseNumber: "FORGED",
    },
  });
  assert.equal(form.statusCode, 200, form.body);

  const accept = await app.inject({
    method: "POST",
    url: `/contracts/rental/${rentalToken}/accept`,
    payload: {},
  });
  assert.equal(accept.statusCode, 200, accept.body);

  const payments = createFakePaymentProvider(`${run}-rental-${seq}`);
  const { setPaymentProviderForTests } = await import(
    "src/modules/contracts/payment/payment-provider.factory"
  );
  setPaymentProviderForTests(payments.provider);
  await linkCardViaFakeProvider(app, payments, rentalToken, contractId);
  await confirmRentalPaymentViaStatusToken(app, payments, rentalToken, `rg-pay-${contractId}`);

  const photos = await Promise.all(CAR_OUT_REQUIRED_ANGLES.map(async () => nextAttachment()));
  const carOut = await app.inject({
    method: "POST",
    url: `/contracts/${contractId}/car-out`,
    headers: authHeaders(),
    payload: {
      mileageOut: 1000,
      fuelOut: "F",
      photos: CAR_OUT_REQUIRED_ANGLES.map((angle, i) => ({
        attachmentId: photos[i]!,
        angle,
      })),
      hirerSignatureAttachmentId: await nextAttachment(),
    },
  });
  assert.equal(carOut.statusCode, 200, carOut.body);

  const before = await app.inject({
    method: "GET",
    url: `/contracts/${contractId}`,
    headers: authHeaders(),
  });
  assert.equal(before.statusCode, 200, before.body);

  return {
    contractId,
    contractNumber,
    vehicleId,
    endAt: before.json().data.endAt as string,
    rentalDays: before.json().data.rentalDays as number,
    agreedAmount: before.json().data.agreedAmount as number,
    payments,
  };
}

export async function confirmReturnForContract(
  app: FastifyInstance,
  authHeaders: () => Record<string, string>,
  contractId: string,
) {
  const link = await app.inject({
    method: "POST",
    url: `/contracts/${contractId}/return-link`,
    headers: authHeaders(),
  });
  assert.equal(link.statusCode, 200, link.body);
  const returnToken = link.json().data.link.token as string;
  const confirmed = await app.inject({
    method: "POST",
    url: `/contracts/return/${returnToken}/confirm`,
  });
  assert.equal(confirmed.statusCode, 200, confirmed.body);
  assert.equal(confirmed.json().data.status, "RETOUT");
}

export async function completeCarInToReview(
  app: FastifyInstance,
  authHeaders: () => Record<string, string>,
  contractId: string,
) {
  const draft = await app.inject({
    method: "PATCH",
    url: `/contracts/${contractId}/car-in`,
    headers: authHeaders(),
    payload: { mileageIn: 1100, fuelIn: "3/4" },
  });
  assert.equal(draft.statusCode, 200, draft.body);
  for (const angle of CAR_OUT_REQUIRED_ANGLES) {
    const body = multipart(png);
    const uploaded = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/car-in/photos?angle=${angle}`,
      payload: body.payload,
      headers: { ...body.headers, ...authHeaders() },
    });
    assert.equal(uploaded.statusCode, 200, `${angle}: ${uploaded.body}`);
  }
  const sigBody = multipart(png);
  const signature = await app.inject({
    method: "POST",
    url: `/contracts/${contractId}/car-in/signature`,
    payload: sigBody.payload,
    headers: { ...sigBody.headers, ...authHeaders() },
  });
  assert.equal(signature.statusCode, 200, signature.body);
  const done = await app.inject({
    method: "POST",
    url: `/contracts/${contractId}/car-in/complete`,
    headers: authHeaders(),
  });
  assert.equal(done.statusCode, 200, done.body);
  assert.equal(done.json().data.status, "REVIEW");
}
