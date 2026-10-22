import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { normalizedNameExtension } from "src/lib/db/prisma-extensions";
import { createPendingRentalRequestDeleteService } from "src/modules/contracts/pending-rental-request-delete.service";
import { bindIntegrationDatabase } from "tests/helpers/integration-harness";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test(
    "pending rental request delete integration skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)",
    { skip: true },
  );
} else {
  describe("pending rental request delete — shared customer attachments", { concurrency: false }, () => {
    let prisma: PrismaClient;
    const run = `PRD${Date.now().toString(36).toUpperCase()}`;
    let adminUserId = 0;

    before(async () => {
      bindIntegrationDatabase();
      const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
      const base = new PrismaClient({ adapter });
      await base.$connect();
      prisma = base.$extends(normalizedNameExtension) as unknown as PrismaClient;

      const { hashPassword } = await import("src/lib/security/password");
      const { normalizeEmail } = await import("src/lib/security/normalize");
      const user = await prisma.user.create({
        data: {
          email: normalizeEmail(`prd-admin-${run}@example.test`),
          name: "prd admin",
          status: "ACTIVE",
          passwordHash: await hashPassword("prd-admin-pass-123"),
        },
      });
      adminUserId = user.id;
    });

    after(async () => {
      await prisma.$disconnect();
    });

    test("FORM cancel preserves CustomerDocument-linked attachment; deletes contract-only attachment", async () => {
      const vehicle = await prisma.vehicle.create({
        data: {
          companyId: await testCompanyId(prisma),
          vehicleName: `PRD-V-${run}`,
          plateNumber: `P${run}`.slice(0, 20),
          dailyRate: 300,
          operationalStatus: "AVAILABLE",
        },
      });
      const customer = await prisma.customer.create({
        data: { name: `PRD Customer ${run}`, mobile: `+9715${run.slice(-7)}` },
      });

      const sharedAttachment = await prisma.attachment.create({
        data: {
          originalName: `prd-shared-${run}.png`,
          storageKey: `prd-shared-${run}.png`,
          mimeType: "image/png",
          size: 8,
        },
      });
      const contractOnlyAttachment = await prisma.attachment.create({
        data: {
          originalName: `prd-only-${run}.png`,
          storageKey: `prd-only-${run}.png`,
          mimeType: "image/png",
          size: 8,
        },
      });

      const contract = await prisma.contract.create({
        data: {
          companyId: await testCompanyId(prisma),
          contractNumber: `PRD-${run}`,
          status: "FORM",
          vehicleId: vehicle.id,
          customerId: customer.id,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 2,
          durationValue: 2,
          durationUnit: "DAY",
          agreedAmount: 600,
          collectionMode: "ELECTRONIC",
        },
      });

      await prisma.contractDocument.createMany({
        data: [
          {
            contractId: contract.id,
            type: "DRIVING_LICENSE",
            attachmentId: sharedAttachment.id,
          },
          {
            contractId: contract.id,
            type: "PASSPORT",
            attachmentId: contractOnlyAttachment.id,
          },
        ],
      });

      const customerDocument = await prisma.customerDocument.create({
        data: {
          customerId: customer.id,
          type: "DRIVING_LICENSE",
          attachmentId: sharedAttachment.id,
        },
      });

      const pendingDelete = createPendingRentalRequestDeleteService(prisma);
      const result = await pendingDelete.deletePendingRentalRequest(contract.id, {
        expectedVehicleId: vehicle.id,
      });

      assert.equal(result.contractNumber, contract.contractNumber);
      assert.equal(await prisma.contract.count({ where: { id: contract.id } }), 0);

      const sharedStill = await prisma.attachment.findUnique({ where: { id: sharedAttachment.id } });
      assert.ok(sharedStill, "shared attachment must remain when CustomerDocument still references it");

      const customerDocStill = await prisma.customerDocument.findUnique({
        where: { id: customerDocument.id },
      });
      assert.ok(customerDocStill);
      assert.equal(customerDocStill.attachmentId, sharedAttachment.id);

      const contractOnlyGone = await prisma.attachment.findUnique({
        where: { id: contractOnlyAttachment.id },
      });
      assert.equal(contractOnlyGone, null);

      await prisma.customerDocument.delete({ where: { id: customerDocument.id } });
      await prisma.attachment.deleteMany({
        where: { id: { in: [sharedAttachment.id, contractOnlyAttachment.id] } },
      });
      await prisma.customer.delete({ where: { id: customer.id } });
      await prisma.vehicle.delete({ where: { id: vehicle.id } });
    });
  });
}
