/**
 * Phase 2A financial integrity checks.
 * Runs only when STAGE2_DATABASE_URL names diamond_fresh_stage2 exactly.
 * Refuses haidara and haidara_test. Does not read APP/backend/.env.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { withTransaction } from "src/lib/db/transaction";
import {
  buildConsolidatedInvoiceLines,
  createContractInvoiceConsolidationService,
} from "src/modules/invoices/contract-invoice-consolidation.service";
import {
  allocateInvoiceNumber,
  configureInvoiceNumberSequence,
} from "src/modules/invoices/invoice-number-sequence.service";

const STAGE2_NAME = "diamond_fresh_stage2";
const stage2Url = process.env.STAGE2_DATABASE_URL ?? "";

function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, "").split("/")[0] ?? "");
}

const enabled = (() => {
  if (!stage2Url) return false;
  try {
    return databaseName(stage2Url) === STAGE2_NAME;
  } catch {
    return false;
  }
})();

if (!enabled) {
  test("phase 2A stage2 integrity skipped", { skip: true });
} else {
  const createdContractIds: string[] = [];
  let createdUserId = 0;
  let createdCustomerId = 0;
  const createdVehicleIds: number[] = [];

  const adapter = new PrismaPg({ connectionString: stage2Url });
  const prisma = new PrismaClient({ adapter });

  after(async () => {
    if (createdContractIds.length > 0) {
      await prisma.invoice.deleteMany({ where: { contractId: { in: createdContractIds } } });
      await prisma.roadLiabilityCustomerCharge.deleteMany({
        where: { contractId: { in: createdContractIds } },
      });
      await prisma.contractReconciliationLine.deleteMany({
        where: { reconciliation: { contractId: { in: createdContractIds } } },
      });
      await prisma.contractReconciliation.deleteMany({
        where: { contractId: { in: createdContractIds } },
      });
      await prisma.roadLiability.deleteMany({
        where: { attributedContractId: { in: createdContractIds } },
      });
      await prisma.contract.deleteMany({ where: { id: { in: createdContractIds } } });
    }
    if (createdVehicleIds.length > 0) {
      await prisma.vehicle.deleteMany({ where: { id: { in: createdVehicleIds } } });
    }
    if (createdCustomerId) await prisma.customer.deleteMany({ where: { id: createdCustomerId } });
    if (createdUserId) await prisma.user.deleteMany({ where: { id: createdUserId } });
    await prisma.$disconnect();
  });

  test("isolated database, invoice lines, and concurrent numbering", async () => {
    assert.equal(databaseName(stage2Url), STAGE2_NAME);
    assert.notEqual(STAGE2_NAME, "haidara");
    assert.notEqual(STAGE2_NAME, "haidara_test");

    const probe = new pg.Client({ connectionString: stage2Url });
    await probe.connect();
    const identity = await probe.query(
      `SELECT current_database() AS name,
              inet_server_addr()::text AS host,
              inet_server_port() AS port,
              current_setting('server_version') AS version`,
    );
    const row = identity.rows[0];
    assert.equal(row.name, STAGE2_NAME);
    assert.match(String(row.version), /^16\./);
    const forbidden = await probe.query(
      `SELECT datname FROM pg_database WHERE datname IN ('haidara', 'haidara_test')`,
    );
    assert.equal(forbidden.rowCount, 0);
    const migrations = await probe.query(
      `SELECT COUNT(*)::int AS count
       FROM "_prisma_migrations"
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    assert.equal(migrations.rows[0].count, 57);
    const indexes = await probe.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname = ANY($1::text[])`,
      [[
        "invoices_contractId_one_current_idx",
        "contract_payment_attempts_one_active_per_payment_idx",
        "whatsapp_connections_one_current",
        "vehicle_gps_bindings_active_device_key",
        "contract_payments_confirmed_obligation_idx",
      ]],
    );
    assert.equal(indexes.rowCount, 5);
    await probe.end();
    console.log(
      `stage2-db name=${row.name} host=${row.host} port=${row.port} version=${row.version}`,
    );

    const companies = await prisma.operatingCompany.findMany({ orderBy: { code: "asc" } });
    assert.deepEqual(
      companies.map((company) => [company.code, company.legalNameEn, company.legalNameAr]),
      [
        [
          "ELITE",
          "Diamond Elite Car Rental LLC",
          "شركة دايموند إيليت لتأجير السيارات ذ.م.م ش.ش.و",
        ],
        [
          "UNIQUE",
          "Diamond Unique Car Rental CO.L.L.C.S.O.C",
          "شركة دايموند يونيك لتأجير السيارات ذ.م.م ش.ش.و",
        ],
      ],
    );
    const elite = companies.find((company) => company.code === "ELITE");
    const unique = companies.find((company) => company.code === "UNIQUE");
    assert.ok(elite && unique);

    await withTransaction(prisma, async (tx) => {
      await configureInvoiceNumberSequence(tx, elite.id, 1100);
      await configureInvoiceNumberSequence(tx, unique.id, 1100);
    });

    const eliteNumbers = await Promise.all(
      Array.from({ length: 8 }, () =>
        withTransaction(prisma, (tx) => allocateInvoiceNumber(tx, elite.id)),
      ),
    );
    assert.deepEqual([...eliteNumbers].sort((a, b) => a - b), [1100, 1101, 1102, 1103, 1104, 1105, 1106, 1107]);
    const uniqueNumber = await withTransaction(prisma, (tx) => allocateInvoiceNumber(tx, unique.id));
    assert.equal(uniqueNumber, 1100);

    const run = `p2a${Date.now().toString(36)}`;
    const user = await prisma.user.create({
      data: { email: `${run}@stage2.test`, name: "Stage2", status: "ACTIVE" },
    });
    createdUserId = user.id;
    const customer = await prisma.customer.create({ data: { name: `Stage2 ${run}` } });
    createdCustomerId = customer.id;
    const vehicle = await prisma.vehicle.create({
      data: {
        companyId: elite.id,
        vehicleName: `Stage2 ${run}`,
        plateNumber: `P2A-${run}`.slice(0, 20),
        operationalStatus: "AVAILABLE",
        dailyRate: 400,
      },
    });
    createdVehicleIds.push(vehicle.id);

    const contract = await prisma.contract.create({
      data: {
        companyId: elite.id,
        contractNumber: `P2A-${run}`,
        status: "REVIEW",
        vehicleId: vehicle.id,
        customerId: customer.id,
        createdByUserId: user.id,
        priceType: "DAILY",
        rentalDays: 2,
        durationValue: 2,
        durationUnit: "DAY",
        agreedAmount: 800,
        collectionMode: "CASH",
        carOut: {
          create: {
            performedByUserId: user.id,
            occurredAt: new Date("2026-10-01T08:00:00.000Z"),
            mileageOut: 1000,
            fuelOut: "F",
          },
        },
        carIn: {
          create: {
            occurredAt: new Date("2026-10-03T08:00:00.000Z"),
            mileageIn: 1200,
            fuelIn: "1/2",
          },
        },
        renewals: {
          create: [
            {
              additionalDays: 0,
              additionalDurationValue: 5,
              additionalDurationUnit: "HOUR",
              additionalAmount: 75,
              previousEndAt: new Date("2026-10-03T08:00:00.000Z"),
              newEndAt: new Date("2026-10-03T13:00:00.000Z"),
              approvedAt: new Date("2026-10-02T08:00:00.000Z"),
              appliedAt: new Date("2026-10-02T08:05:00.000Z"),
            },
            {
              additionalDays: 1,
              additionalDurationValue: 1,
              additionalDurationUnit: "DAY",
              additionalAmount: 200,
              previousEndAt: new Date("2026-10-03T13:00:00.000Z"),
              newEndAt: new Date("2026-10-04T13:00:00.000Z"),
              approvedAt: new Date("2026-10-02T09:00:00.000Z"),
              appliedAt: new Date("2026-10-02T09:05:00.000Z"),
            },
            {
              additionalDays: 2,
              additionalDurationValue: 2,
              additionalDurationUnit: "DAY",
              additionalAmount: 300,
              previousEndAt: new Date("2026-10-04T13:00:00.000Z"),
              newEndAt: new Date("2026-10-06T13:00:00.000Z"),
              approvedAt: new Date("2026-10-02T10:00:00.000Z"),
            },
          ],
        },
      },
    });
    createdContractIds.push(contract.id);

    const liability = await prisma.roadLiability.create({
      data: {
        type: "RTA_VIOLATION",
        vehicleId: vehicle.id,
        occurredAt: new Date("2026-10-02T10:00:00.000Z"),
        amount: 400,
        currency: "AED",
        authoritativeSourceKey: "RTA",
        authoritativeExternalReference: `P2A-${run}`,
        confirmationStatus: "CONFIRMED",
        attributionStatus: "MATCHED",
        collectionStatus: "OPEN",
        attributedContractId: contract.id,
        confirmedAt: new Date("2026-10-02T11:00:00.000Z"),
      },
    });
    const recon = await prisma.contractReconciliation.create({
      data: {
        contractId: contract.id,
        chargesTotal: 650,
        finalAmount: 650,
        depositAmount: 0,
        deductions: 0,
        approvedAt: new Date("2026-10-03T09:00:00.000Z"),
        finalizedAt: new Date("2026-10-03T09:00:00.000Z"),
        finalizedByUserId: user.id,
      },
    });
    const roadLine = await prisma.contractReconciliationLine.create({
      data: {
        reconciliationId: recon.id,
        type: "VIOLATION",
        description: "linked fine",
        amount: 400,
        roadLiabilityId: liability.id,
        officialAmountSnapshot: 400,
        adjustmentAmount: 0,
        confirmedAt: new Date("2026-10-03T09:00:00.000Z"),
        confirmedByUserId: user.id,
      },
    });
    const damageLine = await prisma.contractReconciliationLine.create({
      data: {
        reconciliationId: recon.id,
        type: "DAMAGE",
        description: "scratch",
        amount: 250,
        confirmedAt: new Date("2026-10-03T09:00:00.000Z"),
        confirmedByUserId: user.id,
      },
    });
    await prisma.roadLiabilityCustomerCharge.create({
      data: {
        roadLiabilityId: liability.id,
        contractId: contract.id,
        destinationType: "RECONCILIATION",
        officialAmountSnapshot: 400,
        customerChargeAmount: 400,
        adjustmentAmount: 0,
        confirmedAt: new Date("2026-10-03T09:00:00.000Z"),
        confirmedByUserId: user.id,
        reconciliationLineId: roadLine.id,
      },
    });

    const lines = await withTransaction(prisma, (tx) => buildConsolidatedInvoiceLines(tx, contract.id));
    const amounts = lines.map((line) => [line.sourceType, line.sourceId, line.amount]);
    assert.deepEqual(
      amounts
        .filter((entry) => entry[0] === "CONTRACT_RENEWAL")
        .map((entry) => entry[2])
        .sort((a, b) => Number(a) - Number(b)),
      [75, 200],
    );
    assert.equal(lines.some((line) => line.amount === 300), false);
    assert.equal(lines.filter((line) => line.sourceId === roadLine.id && line.amount === 400).length, 1);
    assert.equal(lines.filter((line) => line.sourceId === damageLine.id && line.amount === 250).length, 1);
    assert.equal(lines.filter((line) => line.sourceType === "ROAD_LIABILITY_CUSTOMER_CHARGE").length, 0);
    assert.equal(lines.reduce((sum, line) => sum + line.amount, 0), 925);

    const service = createContractInvoiceConsolidationService({ prisma } as never);
    const first = await service.ensureConsolidatedContractInvoice(contract.id, user.id);
    const second = await service.ensureConsolidatedContractInvoice(contract.id, user.id);
    assert.equal(first.id, second.id);
    assert.equal(first.totalAmount, 925);
    assert.equal(first.balanceDueSnapshot, 925);
    assert.equal(await prisma.invoice.count({ where: { contractId: contract.id, isCurrent: true } }), 1);
    assert.equal(await prisma.invoice.count({ where: { contractId: contract.id } }), 1);
    const issued = await prisma.invoice.findFirstOrThrow({
      where: { id: first.id },
      include: { company: true },
    });
    assert.equal(issued.company.legalNameEn, "Diamond Elite Car Rental LLC");
    assert.equal(issued.invoiceNumber, 1108);

    await prisma.contractPayment.create({
      data: {
        contractId: contract.id,
        purpose: "RENTAL",
        targetId: contract.id,
        amount: 800,
        method: "CASH",
        status: "CONFIRMED",
        provider: null,
        confirmedAt: new Date("2026-10-01T08:10:00.000Z"),
      },
    });
    await assert.rejects(
      () =>
        prisma.contractPayment.create({
          data: {
            contractId: contract.id,
            purpose: "RENTAL",
            targetId: contract.id,
            amount: 800,
            method: "CASH",
            status: "CONFIRMED",
            provider: null,
            confirmedAt: new Date("2026-10-01T08:11:00.000Z"),
          },
        }),
      /unique|contract_payments_confirmed_obligation_idx/i,
    );

    console.log("stage2-ok invoice-lines numbering legal-names one-current duplicate-payment-rejected");
  });
}
