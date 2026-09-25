/**
 * Seeds a CASH closed contract with an open chargeable road liability for Playwright E2E.
 * Usage: npx tsx scripts/e2e-seed-cash-road-liability.ts
 */
import "./e2e-script-env";
import { buildApp } from "src/app";
import { companyId as resolveCompanyId } from "tests/helpers/operating-company";

async function main() {
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const app = await buildApp();
  const prisma = app.prisma;
  const company = await resolveCompanyId(prisma, "UNIQUE");

  const customer = await prisma.customer.create({
    data: { name: `E2E RL Customer ${run}`, mobile: `+9715000${run.slice(-6)}` },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      companyId: company,
      vehicleName: `E2E RL ${run}`,
      plateNumber: `RL ${run}`.slice(0, 16),
      modelYear: 2024,
      color: "White",
      dailyRate: 400,
      operationalStatus: "AVAILABLE",
    },
  });
  const contract = await prisma.contract.create({
    data: {
      companyId: company,
      contractNumber: `E2E-RL-${run}`,
      status: "CLOSED",
      vehicleId: vehicle.id,
      customerId: customer.id,
      createdByUserId: 1,
      priceType: "DAILY",
      rentalDays: 1,
      agreedAmount: 500,
      collectionMode: "CASH",
    },
  });
  const liability = await prisma.roadLiability.create({
    data: {
      type: "RTA_VIOLATION",
      vehicleId: vehicle.id,
      occurredAt: new Date("2026-09-10T12:00:00.000Z"),
      amount: 480,
      currency: "AED",
      authoritativeSourceKey: "RTA",
      authoritativeExternalReference: `E2E-RTA-${run}`,
      confirmationStatus: "CONFIRMED",
      attributionStatus: "MATCHED",
      collectionStatus: "OPEN",
      attributedContractId: contract.id,
      confirmedAt: new Date(),
    },
  });

  console.log(
    `E2E_CASH_RL_SEED_JSON=${JSON.stringify({
      liabilityId: liability.id,
      contractId: contract.id,
      contractNumber: contract.contractNumber,
      vehicleId: vehicle.id,
      amount: 480,
      companyId: company,
    })}`,
  );
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
