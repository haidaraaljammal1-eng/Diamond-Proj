/**
 * Provisions one REVIEW contract with an unpaid office renewal (500 AED) for combined-settlement E2E.
 */
import dotenv from "dotenv";
import { buildApp } from "src/app";
import {
  completeCarInToReview,
  confirmReturnForContract,
  createActiveRentalContract,
  seedRenewalGuardUser,
} from "../tests/helpers/renewal-integration-setup";

dotenv.config();
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "silent";

async function main() {
  const tag = process.env.E2E_COMBINED_TAG ?? `E2E-CMB-${Date.now().toString(36).toUpperCase()}`;
  const app = await buildApp();
  const prisma = app.prisma;
  const run = tag;
  const email = `e2e-combined-${run.toLowerCase().replace(/[^a-z0-9]/g, "")}@example.test`;
  const password = "E2eCombinedPass-123";
  process.env.LEGACY_CARD_LINK_ENABLED = "true";
  await seedRenewalGuardUser(prisma, email, password, `e2e_cmb_${run}`);
  const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
  if (login.statusCode !== 200) throw new Error(login.body);
  const token = login.json().data.accessToken as string;
  const auth = () => ({ authorization: `Bearer ${token}` });
  const active = await createActiveRentalContract(app, prisma, auth, run, 1);
  const renew = await app.inject({
    method: "POST",
    url: `/contracts/${active.contractId}/renew`,
    headers: auth(),
    payload: { additionalDays: 3, additionalAmount: 500 },
  });
  if (renew.statusCode !== 200) throw new Error(renew.body);
  await confirmReturnForContract(app, auth, active.contractId);
  await completeCarInToReview(app, auth, active.contractId);
  const damageAmount = Number(process.env.E2E_RECON_DAMAGE_AMOUNT ?? "0");
  if (damageAmount > 0) {
    const damage = await app.inject({
      method: "POST",
      url: `/contracts/${active.contractId}/reconcile`,
      headers: auth(),
      payload: { lines: [{ type: "DAMAGE", description: "e2e-scratch", amount: damageAmount }] },
    });
    if (damage.statusCode !== 200) throw new Error(damage.body);
  }
  await app.close();
  process.stdout.write(
    JSON.stringify({
      contractId: active.contractId,
      contractNumber: active.contractNumber,
      adminEmail: email,
      adminPassword: password,
      settlementAmountDue: 500 + damageAmount,
      reconciliationChargesAmount: damageAmount,
      outstandingRenewalAmount: 500,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
