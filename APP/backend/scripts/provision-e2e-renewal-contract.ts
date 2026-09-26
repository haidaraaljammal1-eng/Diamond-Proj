/**
 * Provisions one ACTIVE rental contract on the current DATABASE_URL for live E2E.
 * Prints JSON: { contractId, contractNumber, endAt, rentalDays, agreedAmount }
 */
import dotenv from "dotenv";
import { buildApp } from "src/app";
import {
  createActiveRentalContract,
  seedRenewalGuardUser,
} from "../tests/helpers/renewal-integration-setup";

dotenv.config();
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "silent";

async function main() {
  const tag = process.env.E2E_RENEWAL_TAG ?? `E2E-REN-${Date.now().toString(36).toUpperCase()}`;
  const app = await buildApp();
  const prisma = app.prisma;
  const run = tag;
  const email = `e2e-renewal-${run.toLowerCase().replace(/[^a-z0-9]/g, "")}@example.test`;
  const password = "E2eRenewalPass-123";
  process.env.LEGACY_CARD_LINK_ENABLED = "true";
  await seedRenewalGuardUser(prisma, email, password, `e2e_ren_${run}`);
  const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
  if (login.statusCode !== 200) throw new Error(login.body);
  const token = login.json().data.accessToken as string;
  const auth = () => ({ authorization: `Bearer ${token}` });
  const active = await createActiveRentalContract(app, prisma, auth, run, 1);
  await app.close();
  process.stdout.write(
    JSON.stringify({
      contractId: active.contractId,
      contractNumber: active.contractNumber,
      endAt: active.endAt,
      rentalDays: active.rentalDays,
      agreedAmount: active.agreedAmount,
      adminEmail: email,
      adminPassword: password,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
