/**
 * Prepares a SIGNED rental contract for live Stripe QA.
 * Usage: npx tsx scripts/stripe4-prepare-signed-contract.ts [--company=ELITE|UNIQUE] [--mobile=+971...] [--identity=784-...]
 */
import dotenv from "dotenv";

dotenv.config({ override: true });
import assert from "node:assert/strict";
import { buildApp } from "src/app";
import { hashPassword } from "src/lib/security/password";
import { normalizeEmail } from "src/lib/security/normalize";
import { injectDocumentOcr, seedReadyIdentity } from "../tests/helpers/public-identity";
import { companyId as resolveCompanyId } from "../tests/helpers/operating-company";

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=")[1] ?? fallback;
}

async function main() {
  const run = Date.now().toString(36);
  const companyCode = arg("company", "ELITE");
  const mobile = arg("mobile", `+9715009${run.slice(-6)}`);
  const identityNumber = arg("identity", `784-${run.slice(-4)}`);

  const app = await buildApp();
  const prisma = app.prisma;
  const email = normalizeEmail(`stripe4-qa-${run}@example.test`);
  const password = "Stripe4QaPass123!";

  const role = await prisma.role.create({
    data: { key: `stripe4_qa_${run}`, name: "stripe4 qa" },
  });
  for (const key of ["vehicles.read", "vehicles.manage", "contracts.read", "contracts.manage"]) {
    const perm = await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, category: key.split(".")[0]!, description: key },
    });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
  }
  const user = await prisma.user.create({
    data: {
      email,
      name: "Stripe4 QA",
      status: "ACTIVE",
      passwordHash: await hashPassword(password),
    },
  });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });

  const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
  assert.equal(login.statusCode, 200);
  const token = login.json().data.accessToken as string;
  const auth = { authorization: `Bearer ${token}` };

  const cid = await resolveCompanyId(prisma, companyCode as "ELITE" | "UNIQUE");
  const plate = `S4${run}`.slice(0, 12);
  const vehicle = await app.inject({
    method: "POST",
    url: "/vehicles",
    headers: auth,
    payload: {
      companyId: cid,
      vehicleName: `Stripe4-${run}`,
      plateNumber: plate,
      dailyRate: 400,
      color: "White",
      modelYear: 2024,
    },
  });
  assert.equal(vehicle.statusCode, 201);

  const offer = await app.inject({
    method: "POST",
    url: "/contracts/offers",
    headers: auth,
    payload: { vehicleId: vehicle.json().data.id, priceType: "DAILY", rentalDays: 4, agreedAmount: 1600 },
  });
  assert.equal(offer.statusCode, 201);
  const contractId = offer.json().data.id as string;
  const contractNumber = offer.json().data.contractNumber as string;

  const link = await app.inject({
    method: "POST",
    url: `/contracts/${contractId}/rental-link`,
    headers: auth,
  });
  assert.equal(link.statusCode, 200);
  const rentalToken = link.json().data.link.token as string;

  await seedReadyIdentity(app, rentalToken, { licenseNumber: `DL-${run}` });
  await injectDocumentOcr(undefined);

  const form = await app.inject({
    method: "POST",
    url: `/contracts/rental/${rentalToken}/form`,
    payload: { name: "Stripe QA", mobile, nationality: "AE", identityNumber },
  });
  assert.equal(form.statusCode, 200, form.body);

  const accept = await app.inject({
    method: "POST",
    url: `/contracts/rental/${rentalToken}/accept`,
    payload: {},
  });
  assert.equal(accept.statusCode, 200);
  assert.equal(accept.json().data.contract.status, "SIGNED");

  console.log(
    JSON.stringify({
      rentalToken,
      contractId,
      contractNumber,
      companyCode,
      mobile,
      identityNumber,
      amount: 1600,
    }),
  );

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
