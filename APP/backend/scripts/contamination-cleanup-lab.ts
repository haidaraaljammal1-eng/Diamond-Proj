/**
 * Surgical cleanup of verified deferred-test fixtures — LAB DATABASE ONLY.
 * Usage: set LAB_DATABASE_URL to an isolated clone (e.g. haidara_contamination_lab).
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { extractPostgresDatabaseName } from "../src/lib/db/integration-database-guard";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
const labUrl = process.env.LAB_DATABASE_URL ?? "";
const dbName = labUrl ? extractPostgresDatabaseName(labUrl) : "";
const ALLOWED_LAB_NAMES = new Set(["haidara_contamination_lab", "haidara_recovery_lab"]);
if (!labUrl || !ALLOWED_LAB_NAMES.has(dbName)) {
  console.error(
    `Refusing cleanup: LAB_DATABASE_URL must target ${[...ALLOWED_LAB_NAMES].join(" or ")}`,
  );
  process.exit(1);
}

const RUN_TOKENS = ["DR-MVEKAA14", "DR-MVEKB4QL", "DR-MVEKO41O"];
const PROTECTED_CONTRACT_NUMBER = "DE-2026-000192";

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: labUrl }) });
  const before = await snapshot(prisma);
  const deleted: Record<string, number> = {};

  const liabilityPhase = await prisma.$transaction(async (tx) => {
    const liabilities = await tx.roadLiability.findMany({
      where: {
        authoritativeSourceKey: "STAFF_MANUAL",
        OR: RUN_TOKENS.map((token) => ({
          authoritativeExternalReference: { contains: token, mode: "insensitive" },
        })),
      },
      select: { id: true, attributedContractId: true },
    });
    const liabilityIds = liabilities.map((l) => l.id);
    const contractIds = [
      ...new Set(liabilities.map((l) => l.attributedContractId).filter(Boolean) as string[]),
    ];

    const charges = await tx.roadLiabilityCustomerCharge.findMany({
      where: { roadLiabilityId: { in: liabilityIds } },
      select: { id: true, contractPaymentId: true },
    });
    const paymentIds = charges.map((c) => c.contractPaymentId).filter(Boolean) as string[];
    const chargeIds = charges.map((c) => c.id);

    const counts: Record<string, number> = {};
    const bump = async (label: string, result: { count: number }) => {
      counts[label] = result.count;
    };

    if (paymentIds.length) {
      bump("financial_ledger_entries", await tx.financialLedgerEntry.deleteMany({
        where: {
          OR: [{ contractPaymentId: { in: paymentIds } }, { sourceId: { in: paymentIds } }],
        },
      }));
      bump("contract_payment_allocations", await tx.contractPaymentAllocation.deleteMany({
        where: { contractPaymentId: { in: paymentIds } },
      }));
      bump("contract_payment_off_session_attempts", await tx.contractPaymentOffSessionAttempt.deleteMany({
        where: { contractPaymentId: { in: paymentIds } },
      }));
      bump("contract_payment_attempts", await tx.contractPaymentAttempt.deleteMany({
        where: { contractPaymentId: { in: paymentIds } },
      }));
    }

    bump("contract_post_close_receivables", await tx.contractPostCloseReceivable.deleteMany({
      where: {
        OR: [{ roadLiabilityId: { in: liabilityIds } }, { customerChargeId: { in: chargeIds } }],
      },
    }));
    bump("road_liability_customer_charges", await tx.roadLiabilityCustomerCharge.deleteMany({
      where: { roadLiabilityId: { in: liabilityIds } },
    }));
    bump("contract_reconciliation_lines", await tx.contractReconciliationLine.deleteMany({
      where: { roadLiabilityId: { in: liabilityIds } },
    }));
    bump("road_charge_reference_registry", await tx.roadChargeReferenceRegistry.deleteMany({
      where: { roadLiabilityId: { in: liabilityIds } },
    }));
    bump("road_liability_observations", await tx.roadLiabilityObservation.deleteMany({
      where: { liabilityId: { in: liabilityIds } },
    }));
    bump("road_liabilities", await tx.roadLiability.deleteMany({ where: { id: { in: liabilityIds } } }));

    if (paymentIds.length) {
      bump("road_liability_contract_payments", await tx.contractPayment.deleteMany({
        where: { id: { in: paymentIds } },
      }));
    }

    return { counts, contractIds, liabilityIds };
  });
  Object.assign(deleted, liabilityPhase.counts);

  const contractPhase = await prisma.$transaction(async (tx) => {
    const testContracts = await tx.contract.findMany({
      where: {
        contractNumber: { not: PROTECTED_CONTRACT_NUMBER },
        OR: [
          ...RUN_TOKENS.flatMap((token) => [
            { contractNumber: { contains: token, mode: "insensitive" } },
          ]),
          { contractNumber: { startsWith: "DR-", mode: "insensitive" } },
          { contractNumber: { gte: "DE-2026-000216", lte: "DE-2026-000226" } },
        ],
      },
      select: { id: true, contractNumber: true },
    });
    const purgeContractIds = testContracts.map((c) => c.id);
    const counts: Record<string, number> = {};
    const bump = async (label: string, result: { count: number }) => {
      counts[label] = result.count;
    };
    if (!purgeContractIds.length) {
      return { counts, purgeContractIds };
    }

    const contractPayments = await tx.contractPayment.findMany({
      where: { contractId: { in: purgeContractIds } },
      select: { id: true },
    });
    const allPaymentIds = contractPayments.map((p) => p.id);

    await tx.contractReconciliation.updateMany({
      where: { contractId: { in: purgeContractIds } },
      data: { settledPaymentId: null },
    });
    await tx.contractRenewal.updateMany({
      where: { contractId: { in: purgeContractIds } },
      data: { settledPaymentId: null },
    });
    await tx.contractPostCloseReceivable.updateMany({
      where: { contractId: { in: purgeContractIds } },
      data: { settledPaymentId: null },
    });

    if (allPaymentIds.length) {
      bump("contract_financial_ledger_entries", await tx.financialLedgerEntry.deleteMany({
        where: {
          OR: [
            { contractPaymentId: { in: allPaymentIds } },
            { sourceId: { in: allPaymentIds } },
            { contractId: { in: purgeContractIds } },
          ],
        },
      }));
      bump("contract_payment_allocations_all", await tx.contractPaymentAllocation.deleteMany({
        where: { contractPaymentId: { in: allPaymentIds } },
      }));
      bump("contract_payment_attempts_all", await tx.contractPaymentAttempt.deleteMany({
        where: { contractPaymentId: { in: allPaymentIds } },
      }));
      const authorizations = await tx.contractPaymentAuthorization.findMany({
        where: {
          OR: [
            { contractId: { in: purgeContractIds } },
            { sourcePaymentId: { in: allPaymentIds } },
          ],
        },
        select: { id: true },
      });
      const authorizationIds = authorizations.map((a) => a.id);
      if (authorizationIds.length) {
        bump("contract_payment_off_session_by_auth", await tx.contractPaymentOffSessionAttempt.deleteMany({
          where: { authorizationId: { in: authorizationIds } },
        }));
      }
      bump("contract_payment_off_session_all", await tx.contractPaymentOffSessionAttempt.deleteMany({
        where: { contractPaymentId: { in: allPaymentIds } },
      }));
      bump("contract_payment_authorizations", await tx.contractPaymentAuthorization.deleteMany({
        where: { id: { in: authorizationIds } },
      }));
      bump("contract_card_payment_methods", await tx.contractCardPaymentMethod.deleteMany({
        where: { contractId: { in: purgeContractIds } },
      }));
      bump("contract_payments_all", await tx.contractPayment.deleteMany({
        where: { id: { in: allPaymentIds } },
      }));
    }

    bump("archive_rows", await tx.archiveRow.deleteMany({ where: { contractId: { in: purgeContractIds } } }));
    bump("invoices", await tx.invoice.deleteMany({ where: { contractId: { in: purgeContractIds } } }));
    bump("contract_renewals", await tx.contractRenewal.deleteMany({ where: { contractId: { in: purgeContractIds } } }));
    bump("reconciliation_lines_remaining", await tx.contractReconciliationLine.deleteMany({
      where: { reconciliation: { contractId: { in: purgeContractIds } } },
    }));
    bump("contract_reconciliations", await tx.contractReconciliation.deleteMany({
      where: { contractId: { in: purgeContractIds } },
    }));
    bump("contract_car_in", await tx.contractCarIn.deleteMany({ where: { contractId: { in: purgeContractIds } } }));
    bump("contract_car_out", await tx.contractCarOut.deleteMany({ where: { contractId: { in: purgeContractIds } } }));
    bump("contract_links", await tx.contractLink.deleteMany({ where: { contractId: { in: purgeContractIds } } }));
    bump("contracts", await tx.contract.deleteMany({ where: { id: { in: purgeContractIds } } }));

    return { counts, purgeContractIds, contractNumbers: testContracts.map((c) => c.contractNumber) };
  });
  Object.assign(deleted, contractPhase.counts);

  const after = await snapshot(prisma);
  const out = path.join(__dirname, "../backups", `contamination-lab-cleanup-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const report = {
    before,
    after,
    deleted,
    liabilityIds: liabilityPhase.liabilityIds,
    purgedContracts: contractPhase.contractNumbers ?? [],
  };
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ report: out, ...report }, null, 2));
  await prisma.$disconnect();
}

async function snapshot(prisma: PrismaClient) {
  const tokenLiabilities = await prisma.roadLiability.count({
    where: {
      authoritativeSourceKey: "STAFF_MANUAL",
      OR: RUN_TOKENS.map((token) => ({
        authoritativeExternalReference: { contains: token, mode: "insensitive" },
      })),
    },
  });
  const [staffManual, drContracts, ledger, payments] = await Promise.all([
    prisma.roadLiability.count({ where: { authoritativeSourceKey: "STAFF_MANUAL" } }),
    prisma.contract.count({ where: { contractNumber: { startsWith: "DR-", mode: "insensitive" } } }),
    prisma.financialLedgerEntry.count(),
    prisma.contractPayment.count(),
  ]);
  return {
    deferred_token_liabilities: tokenLiabilities,
    staff_manual_liabilities: staffManual,
    dr_prefix_contracts: drContracts,
    ledger,
    payments,
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
