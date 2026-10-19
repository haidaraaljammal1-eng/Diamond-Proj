/**
 * Read-only contamination graph for deferred integration fixtures on haidara.
 */
import dotenv from "dotenv";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { extractPostgresDatabaseName } from "../src/lib/db/integration-database-guard";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
const url = process.env.DATABASE_URL ?? "";
if (extractPostgresDatabaseName(url) !== "haidara") {
  console.error("Refusing audit: DATABASE_URL must target haidara");
  process.exit(1);
}

const RUN_TOKENS = ["DR-MVEKAA14", "DR-MVEKB4QL", "DR-MVEKO41O"];
const PROTECTED_CONTRACT = "DE-2026-000192";
const PROTECTED_REF = "222222";

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const liabilities = await prisma.roadLiability.findMany({
      where: {
        authoritativeSourceKey: "STAFF_MANUAL",
        OR: RUN_TOKENS.map((token) => ({
          authoritativeExternalReference: { contains: token, mode: "insensitive" },
        })),
      },
      select: {
        id: true,
        authoritativeExternalReference: true,
        attributedContractId: true,
        createdAt: true,
        amount: true,
        customerCharge: {
          select: {
            id: true,
            contractPaymentId: true,
            reconciliationLineId: true,
            destinationType: true,
            postCloseReceivable: { select: { id: true } },
          },
        },
        referenceRegistries: { select: { id: true, referenceNormalized: true, status: true } },
        reconciliationLine: { select: { id: true } },
        postCloseReceivable: { select: { id: true } },
        observations: { select: { id: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const contractIds = [
      ...new Set(liabilities.map((l) => l.attributedContractId).filter(Boolean) as string[]),
    ];
    const contracts = await prisma.contract.findMany({
      where: { id: { in: contractIds } },
      select: { id: true, contractNumber: true, status: true, customerId: true, vehicleId: true },
    });

    const paymentIds = [
      ...new Set(
        liabilities
          .map((l) => l.customerCharge?.contractPaymentId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const payments = paymentIds.length
      ? await prisma.contractPayment.findMany({
          where: { id: { in: paymentIds } },
          select: {
            id: true,
            purpose: true,
            status: true,
            method: true,
            amount: true,
            provider: true,
            providerReference: true,
          },
        })
      : [];

    const ledger = paymentIds.length
      ? await prisma.financialLedgerEntry.findMany({
          where: { OR: [{ contractPaymentId: { in: paymentIds } }, { sourceId: { in: paymentIds } }] },
          select: { id: true, amount: true, sourceType: true, sourceId: true },
        })
      : [];

    const invoices = contractIds.length
      ? await prisma.invoice.findMany({
          where: { contractId: { in: contractIds } },
          select: { id: true, invoiceNumber: true, contractId: true, isCurrent: true },
        })
      : [];

    const protectedLiability = await prisma.roadLiability.findFirst({
      where: {
        OR: [
          {
            authoritativeExternalReference: { contains: PROTECTED_REF, mode: "insensitive" },
            attributedContract: { contractNumber: PROTECTED_CONTRACT },
          },
          {
            referenceRegistries: {
              some: { referenceNormalized: { contains: PROTECTED_REF } },
            },
            attributedContract: { contractNumber: PROTECTED_CONTRACT },
          },
        ],
      },
      select: { id: true, createdAt: true, authoritativeExternalReference: true },
    });

    const contractScopeIds = contractIds;
    const [renewals, idempotencyKeys, outboxEvents, allContractPayments, uncertainLiabilities] =
      await Promise.all([
        contractScopeIds.length
          ? prisma.contractRenewal.findMany({
              where: { contractId: { in: contractScopeIds } },
              select: { id: true, contractId: true, additionalAmount: true, settledPaymentId: true },
            })
          : [],
        prisma.idempotencyKey.findMany({
          where: {
            OR: RUN_TOKENS.map((token) => ({ key: { contains: token, mode: "insensitive" } })),
          },
          select: { id: true, scope: true, key: true, resultRef: true, createdAt: true },
        }),
        contractScopeIds.length
          ? prisma.domainOutboxEvent.findMany({
              where: {
                aggregateType: "Contract",
                aggregateId: { in: contractScopeIds },
              },
              select: { id: true, eventType: true, status: true, createdAt: true, dedupeKey: true },
              take: 100,
            })
          : [],
        contractScopeIds.length
          ? prisma.contractPayment.findMany({
              where: { contractId: { in: contractScopeIds } },
              select: {
                id: true,
                contractId: true,
                purpose: true,
                status: true,
                method: true,
                amount: true,
                provider: true,
                providerReference: true,
              },
            })
          : [],
        prisma.roadLiability.findMany({
          where: {
            authoritativeSourceKey: "STAFF_MANUAL",
            NOT: {
              OR: RUN_TOKENS.map((token) => ({
                authoritativeExternalReference: { contains: token, mode: "insensitive" },
              })),
            },
          },
          select: {
            id: true,
            authoritativeExternalReference: true,
            attributedContract: { select: { contractNumber: true } },
            createdAt: true,
          },
        }),
      ]);

    const customerIds = [
      ...new Set(contracts.map((c) => c.customerId).filter((id): id is number => id != null)),
    ];
    const vehicleIds = [...new Set(contracts.map((c) => c.vehicleId).filter(Boolean) as number[])];
    const [customers, vehicles, gpsBindingsOnTestVehicles, notifications] = await Promise.all([
      customerIds.length
        ? prisma.customer.findMany({
            where: { id: { in: customerIds } },
            select: { id: true, name: true, mobile: true, createdAt: true },
          })
        : [],
      vehicleIds.length
        ? prisma.vehicle.findMany({
            where: { id: { in: vehicleIds } },
            select: {
              id: true,
              vehicleName: true,
              plateNumber: true,
              operationalStatus: true,
              createdAt: true,
            },
          })
        : [],
      vehicleIds.length
        ? prisma.vehicleGpsBinding.findMany({
            where: { vehicleId: { in: vehicleIds } },
            select: {
              vehicleId: true,
              providerKey: true,
              externalDeviceId: true,
              isActive: true,
            },
          })
        : [],
      prisma.notification.findMany({
        where: {
          OR: RUN_TOKENS.flatMap((token) => [
            { title: { contains: token, mode: "insensitive" } },
            { body: { contains: token, mode: "insensitive" } },
          ]),
        },
        select: { id: true, eventKey: true, title: true, createdAt: true },
      }),
    ]);

    const cascadeSafety = {
      cleanup_touches_gps_tables: false,
      cleanup_touches_whatsapp_tables: false,
      cleanup_deletes_vehicles: false,
      test_vehicles_with_gps_bindings: gpsBindingsOnTestVehicles.filter((b) => b.isActive).length,
      note:
        "Lab cleanup deletes contracts/liabilities only; Vehicle onDelete is Restrict from GPS bindings — vehicles are never removed by contamination-cleanup-lab.ts.",
    };

    const externalProviderPayments = payments.filter(
      (p) => p.provider === "stripe" && p.providerReference?.startsWith("cs_test_") === false,
    );

    console.log(
      JSON.stringify(
        {
          summary: {
            deferred_test_liabilities: liabilities.length,
            related_contracts: contracts.length,
            contract_payments: payments.length,
            ledger_entries: ledger.length,
            invoices: invoices.length,
            stripe_live_like_payments: externalProviderPayments.length,
            protected_de_192_present: Boolean(protectedLiability),
            idempotency_keys: idempotencyKeys.length,
            outbox_events: outboxEvents.length,
            notifications_token_match: notifications.length,
            suspected_customers: customers.length,
            suspected_vehicles: vehicles.length,
          },
          liabilities,
          contracts,
          payments,
          ledger,
          invoices,
          renewals,
          idempotencyKeys,
          outboxEvents,
          allContractPayments,
          uncertain_staff_manual_liabilities: uncertainLiabilities,
          customers_identification_only: customers,
          vehicles_identification_only: vehicles,
          gps_bindings_on_test_vehicles: gpsBindingsOnTestVehicles,
          notifications_matching_tokens: notifications,
          cascade_safety: cascadeSafety,
          protected: protectedLiability,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
