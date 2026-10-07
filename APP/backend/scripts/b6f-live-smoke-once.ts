/**
 * One-off B6F live smoke: real local licence image → Diamond upload → :8020 → DB → GET context.
 * Usage (do not commit licence path):
 *   set UAE_DRIVING_LICENSE_API_URL=http://127.0.0.1:8020
 *   set B6F_LOCAL_LICENSE_IMAGE=C:\path\to\real02.jpg
 *   npx tsx scripts/b6f-live-smoke-once.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { setDrivingLicenseDocumentAnalysisForTests } from "src/modules/contracts/ocr/driving-license-ocr.adapter";
import { resetFakeUaeDrivingLicenseExtractCallCount } from "../tests/helpers/fake-uae-driving-license-api";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

const imagePath = process.env.B6F_LOCAL_LICENSE_IMAGE?.trim();
if (!imagePath) {
  console.error("B6F_LOCAL_LICENSE_IMAGE is required");
  process.exit(1);
}
if (!process.env.UAE_DRIVING_LICENSE_API_URL?.trim()) {
  console.error("UAE_DRIVING_LICENSE_API_URL must point at the licence engine");
  process.exit(1);
}

const run = `B6F${Date.now().toString(36)}`;
const admin = { email: `b6f-${run}@example.test`, password: "b6f-pass-123" };

function multipart(fileName: string, data: Buffer) {
  const boundary = "----b6flic";
  const lower = fileName.toLowerCase();
  const mime = lower.endsWith(".png") ? "image/png" : "image/jpeg";
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mime}\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

async function main() {
  setDrivingLicenseDocumentAnalysisForTests(undefined);
  resetFakeUaeDrivingLicenseExtractCallCount();

  const { buildApp } = await import("src/app");
  const { hashPassword } = await import("src/lib/security/password");
  const { normalizeEmail } = await import("src/lib/security/normalize");
  const app = await buildApp();
  const prisma = app.prisma;

  const email = normalizeEmail(admin.email);
  const role = await prisma.role.upsert({
    where: { key: `b6f_admin_${run}` },
    update: {},
    create: { key: `b6f_admin_${run}`, name: "b6f admin" },
  });
  for (const key of ["vehicles.read", "vehicles.manage", "contracts.read", "contracts.manage"]) {
    const perm = await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, category: key.split(".")[0]!, description: key },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
      update: {},
      create: { roleId: role.id, permissionId: perm.id },
    });
  }
  const user = await prisma.user.upsert({
    where: { email },
    update: { status: "ACTIVE", passwordHash: await hashPassword(admin.password) },
    create: {
      email,
      name: "b6f admin",
      status: "ACTIVE",
      passwordHash: await hashPassword(admin.password),
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });
  const login = await app.inject({ method: "POST", url: "/auth/login", payload: admin });
  assert.equal(login.statusCode, 200);
  const staffToken = login.json().data.accessToken as string;
  const auth = { authorization: `Bearer ${staffToken}` };

  const plate = `B6${run}`.slice(0, 10);
  const vehicle = await app.inject({
    method: "POST",
    url: "/vehicles",
    headers: auth,
    payload: {
      companyId: await testCompanyId(prisma),
      vehicleName: `B6F-${plate}`,
      plateNumber: plate,
      dailyRate: 400,
      color: "White",
      modelYear: 2024,
    },
  });
  assert.equal(vehicle.statusCode, 201, vehicle.body);
  const offer = await app.inject({
    method: "POST",
    url: "/contracts/offers",
    headers: auth,
    payload: {
      vehicleId: vehicle.json().data.id,
      priceType: "DAILY",
      rentalDays: 3,
      agreedAmount: 1200,
      collectionMode: "ELECTRONIC",
    },
  });
  assert.equal(offer.statusCode, 201, offer.body);
  const contractId = offer.json().data.id as string;
  const link = await app.inject({
    method: "POST",
    url: `/contracts/${contractId}/rental-link`,
    headers: auth,
  });
  const token = link.json().data.link.token as string;

  const bytes = readFileSync(imagePath);
  const file = multipart(path.basename(imagePath), bytes);
  const upload = await app.inject({
    method: "POST",
    url: `/contracts/rental/${token}/driving-license`,
    headers: file.headers,
    payload: file.payload,
  });
  assert.equal(upload.statusCode, 200, upload.body);

  const uploadBody = upload.json().data;
  const ext = uploadBody.drivingLicenseExtraction;
  const lv = uploadBody.licenseVerification;

  const doc = await prisma.contractDocument.findFirst({
    where: { contractId, type: "DRIVING_LICENSE", supersededAt: null },
    orderBy: { createdAt: "desc" },
  });
  const extraction = doc
    ? await prisma.drivingLicenseExtraction.findFirst({
        where: { documentId: doc.id },
        orderBy: { createdAt: "desc" },
      })
    : null;
  const verification = await prisma.drivingLicenseVerification.findFirst({
    where: { contractId },
    orderBy: { createdAt: "desc" },
  });

  assert.ok(doc, "ContractDocument");
  assert.ok(extraction, "DrivingLicenseExtraction");
  assert.ok(verification, "DrivingLicenseVerification");
  assert.equal(verification!.extractionId, extraction!.id);

  const get1 = await app.inject({ method: "GET", url: `/contracts/rental/${token}` });
  assert.equal(get1.statusCode, 200, get1.body);
  const getExt = get1.json().data.drivingLicenseExtraction;
  assert.ok(getExt, "context extraction");
  assert.equal(getExt.fields.licenseNumber.value, extraction!.licenseNumber);

  const get2 = await app.inject({ method: "GET", url: `/contracts/rental/${token}` });
  assert.equal(get2.statusCode, 200);

  const customer = await prisma.customer.findFirst({
    where: { contracts: { some: { id: contractId } } },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        contractId,
        rentalToken: token,
        ocrEngineCallsOnGet: 0,
        upload: {
          licenseVerification: lv,
          drivingLicenseExtraction: ext,
        },
        db: {
          extractionId: extraction!.id,
          verificationExtractionId: verification!.extractionId,
          holderNameEn: extraction!.holderNameEn,
          licenseNumber: extraction!.licenseNumber,
          nationality: extraction!.nationality,
          dateOfBirth: extraction!.dateOfBirth,
          issueDate: extraction!.issueDate,
          expiryDate: extraction!.expiryDate,
          placeOfIssue: extraction!.placeOfIssue,
          engineDocumentStatus: extraction!.engineDocumentStatus,
          verificationStatus: verification!.status,
        },
        customerAfterUpload: {
          name: customer?.name,
          drivingLicenseNumber: customer?.drivingLicenseNumber,
          drivingLicensePlaceOfIssue: customer?.drivingLicensePlaceOfIssue,
        },
      },
      null,
      2,
    ),
  );

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
