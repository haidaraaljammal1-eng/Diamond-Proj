/**
 * Creates QA-RENEWAL-VISUAL-20261013 ACTIVE CASH rental on haidara only.
 * Preserves fixture — do not auto-delete.
 */
import dotenv from "dotenv";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { buildApp } from "src/app";
import { parseDatabaseTarget, formatSafeDatabaseTarget } from "src/lib/dev/development-database";
import { CAR_OUT_REQUIRED_ANGLES } from "src/modules/contracts/contracts.constants";
import { createContractPaymentService } from "src/modules/contracts/payment/contract-payment.service";
import { seedReadyIdentity } from "tests/helpers/public-identity";
import { seedRenewalGuardUser, multipart, RENEWAL_GUARD_PERMS } from "tests/helpers/renewal-integration-setup";

dotenv.config();
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "silent";

const VEHICLE_NAME = "QA-RENEWAL-VISUAL-20261013";
const VEHICLE_ID = 628;
const REQUIRED_DB = "haidara";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const target = parseDatabaseTarget(url);
  if (target.database !== REQUIRED_DB) {
    throw new Error(`Refusing: expected ${REQUIRED_DB}, got ${formatSafeDatabaseTarget(target)}`);
  }

  const app = await buildApp();
  const prisma = app.prisma;

  const vehicleRow = await prisma.vehicle.findUnique({
    where: { id: VEHICLE_ID },
    select: { id: true, vehicleName: true, plateNumber: true, operationalStatus: true },
  });
  if (!vehicleRow || vehicleRow.vehicleName !== VEHICLE_NAME) {
    throw new Error(`Expected vehicle ${VEHICLE_ID} named ${VEHICLE_NAME}`);
  }
  const activeContract = await prisma.contract.findFirst({
    where: { vehicleId: VEHICLE_ID, status: "ACTIVE" },
    select: { id: true, contractNumber: true },
  });
  if (activeContract) {
    const manifest = {
      database: formatSafeDatabaseTarget(target),
      vehicleId: VEHICLE_ID,
      vehicleName: VEHICLE_NAME,
      plateNumber: vehicleRow.plateNumber,
      contractId: activeContract.id,
      contractNumber: activeContract.contractNumber,
      alreadyActive: true,
      preserved: true,
    };
    const fs = await import("node:fs/promises");
    await fs.writeFile("db-backups/_qa-renewal-visual-manifest.json", JSON.stringify(manifest, null, 2), "utf8");
    process.stdout.write(JSON.stringify(manifest, null, 2));
    await app.close();
    return;
  }
  if (vehicleRow.operationalStatus !== "AVAILABLE") {
    throw new Error(`Vehicle ${VEHICLE_ID} must be AVAILABLE before provisioning; got ${vehicleRow.operationalStatus}`);
  }

  const email = "qa-renewal-visual-20261013@example.test";
  const password = "QaRenewalVisual-20261013";
  await seedRenewalGuardUser(prisma, email, password, "qa_renewal_visual_20261013");
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
  });
  assert.equal(login.statusCode, 200, login.body);
  const token = login.json().data.accessToken as string;
  const auth = () => ({ authorization: `Bearer ${token}` });
  const { normalizeEmail } = await import("src/lib/security/normalize");
  const staffUser = await prisma.user.findUniqueOrThrow({
    where: { email: normalizeEmail(email) },
    select: { id: true },
  });
  const staffUserId = staffUser.id;

  const vehicleId = VEHICLE_ID;
  const plate = vehicleRow.plateNumber ?? `QA-RN13-${randomUUID().slice(0, 6).toUpperCase()}`;

  const offer = await app.inject({
    method: "POST",
    url: "/contracts/offers",
    headers: auth(),
    payload: {
      vehicleId,
      priceType: "DAILY",
      rentalDays: 3,
      agreedAmount: 1050,
      collectionMode: "CASH",
    },
  });
  assert.equal(offer.statusCode, 201, offer.body);
  const contractId = offer.json().data.id as string;
  const contractNumber = offer.json().data.contractNumber as string;

  const linkRes = await app.inject({
    method: "POST",
    url: `/contracts/${contractId}/rental-link`,
    headers: auth(),
  });
  assert.equal(linkRes.statusCode, 200, linkRes.body);
  const rentalToken = linkRes.json().data.link.token as string;

  await seedReadyIdentity(app, rentalToken, {
    licenseNumber: "DL-QA-RN-20261013",
    expiryDate: "2031-12-31",
  });

  const form = await app.inject({
    method: "POST",
    url: `/contracts/rental/${rentalToken}/form`,
    payload: {
      name: "QA Renewal Visual Customer",
      mobile: "+971500001013",
      nationality: "AE",
      identityNumber: "784-2013-1013",
      drivingLicenseNumber: "DL-QA-RN-20261013",
    },
  });
  assert.equal(form.statusCode, 200, form.body);

  const accept = await app.inject({
    method: "POST",
    url: `/contracts/rental/${rentalToken}/accept`,
    payload: {},
  });
  assert.equal(accept.statusCode, 200, accept.body);

  const signed = await prisma.contract.findUniqueOrThrow({
    where: { id: contractId },
    select: { status: true },
  });
  assert.equal(signed.status, "SIGNED");

  const payments = createContractPaymentService(prisma);
  const payment = await payments.settleCashRental(contractId, staffUserId);
  assert.equal(payment.method, "CASH");
  assert.equal(payment.status, "CONFIRMED");

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lV8AAAAASUVORK5CYII=",
    "base64",
  );
  const nextAttachment = async (label: string) => {
    const row = await prisma.attachment.create({
      data: {
        originalName: `${label}.png`,
        storageKey: `qa-rn-visual-${label}-${Date.now()}`,
        mimeType: "image/png",
        size: 8,
      },
    });
    return row.id;
  };

  const photos = await Promise.all(CAR_OUT_REQUIRED_ANGLES.map(async (a) => nextAttachment(a)));
  const carOut = await app.inject({
    method: "POST",
    url: `/contracts/${contractId}/car-out`,
    headers: auth(),
    payload: {
      mileageOut: 1013,
      fuelOut: "F",
      photos: CAR_OUT_REQUIRED_ANGLES.map((angle, i) => ({
        attachmentId: photos[i]!,
        angle,
      })),
      hirerSignatureAttachmentId: await nextAttachment("car-out-sig"),
    },
  });
  assert.equal(carOut.statusCode, 200, carOut.body);

  const contract = await prisma.contract.findUniqueOrThrow({
    where: { id: contractId },
    select: { status: true, customerId: true },
  });
  assert.equal(contract.status, "ACTIVE");
  const vehicle = await prisma.vehicle.findUniqueOrThrow({
    where: { id: vehicleId },
    select: { operationalStatus: true },
  });
  assert.equal(vehicle.operationalStatus, "RENTED");

  const ledger = await prisma.financialLedgerEntry.count({
    where: { contractId, kind: "RENTAL_PAYMENT" },
  });

  const manifest = {
    database: formatSafeDatabaseTarget(target),
    vehicleId,
    vehicleName: VEHICLE_NAME,
    plateNumber: plate,
    contractId,
    contractNumber,
    customerId: contract.customerId,
    paymentId: payment.id,
    paymentAmount: payment.amount,
    ledgerRentalPaymentRows: ledger,
    staffEmail: email,
    staffPassword: password,
    permissions: RENEWAL_GUARD_PERMS,
    preserved: true,
  };

  const fs = await import("node:fs/promises");
  await fs.writeFile("db-backups/_qa-renewal-visual-manifest.json", JSON.stringify(manifest, null, 2), "utf8");
  process.stdout.write(JSON.stringify(manifest, null, 2));
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
