import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { injectDocumentOcr, seedReadyIdentity } from "../helpers/public-identity";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { AppError } from "src/lib/errors/app-error";
import { CAR_OUT_REQUIRED_ANGLES, INSPECTION_ANGLES } from "src/modules/contracts/contracts.constants";
import { setTarsProviderForTests } from "src/modules/integrations/tars/tars.provider";
import { setPaymentProviderForTests } from "src/modules/contracts/payment/payment-provider.factory";
import {
  confirmPaymentViaWebhook,
  confirmRentalPaymentViaStatusToken,
  linkCardViaFakeProvider,
  createFakePaymentProvider,
} from "../helpers/fake-payment-provider";
import type {
  TarsIntegrationService,
} from "src/modules/integrations/tars/tars.service";
import type {
  TarsProvider,
  TarsProviderResult,
} from "src/modules/integrations/tars/tars.types";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

/**
 * TARS mandatory-integration foundation. Requires RUN_INTEGRATION=true and
 * TEST_DATABASE_URL pointing at a disposable database — never the Diamond
 * development fleet DB.
 *
 * A FakeTarsProvider is injected for the execution tests. Production and
 * development runtime always resolve TarsUnconfiguredProvider.
 */
const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test(
    "tars integration skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)",
    { skip: true },
  );
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("tars integration foundation", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    let tars: TarsIntegrationService;
    const run = Date.now().toString(36).toUpperCase();
    const admin = { email: `tars-admin-${run}@example.test`, password: "tars-admin-pass-123" };
    let token = "";
    /** Fully lifecycled contract: signed, paid, car-out, car-in, reconciled, closed. */
    let closedContractId = "";
    let closedContractNumber = "";
    let closedVehicleId = 0;
    /** Bare AWAITING offer used for the unconfigured-provider assertions. */
    let bareContractId = "";

    const PERMS = [
      "vehicles.read",
      "vehicles.manage",
      "contracts.read",
      "contracts.manage",
      "contracts.car_out",
      "contracts.return",
      "contracts.reconcile",
      "contracts.close",
    ];

    // ---- fake provider -----------------------------------------------------

    function createFakeTarsProvider() {
      const calls: string[] = [];
      let result: TarsProviderResult = { success: true };
      let gate: Promise<void> | null = null;

      async function invoke(method: string): Promise<TarsProviderResult> {
        calls.push(method);
        if (gate) await gate;
        return result;
      }

      const provider: TarsProvider = {
        name: "fake",
        companyCode: "UNIQUE",
        configured: true,
        checkAuthReadiness: async () => ({ ready: true }),
        lookupVehicle: async () => ({ success: true, externalVehicleDid: "VEH-DID" }),
        registerVehicleIfRequired: async () => ({ success: true, externalVehicleDid: "VEH-DID" }),
        inquireDrivingLicense: async () => ({ success: true }),
        uploadAttachment: async () => ({ success: true, externalHash: "hash" }),
        submitHandoverEvidence: () => invoke("submitHandoverEvidence"),
        submitReturnEvidence: () => invoke("submitReturnEvidence"),
        linkDigitalAcceptance: () => invoke("linkDigitalAcceptance"),
        createRental: () => invoke("createRental"),
        updateRental: () => invoke("updateRental"),
        returnRental: () => invoke("returnRental"),
        settleRental: () => invoke("settleRental"),
        getAsyncRequestStatus: async () => ({ status: "SUCCEEDED" }),
        requestContractOtp: async () => ({
          success: true,
          challengeReference: "otp-challenge",
          maskedDestination: "***0001",
        }),
        verifyContractOtp: async (_input) => ({
          success: _input.code === "123456",
          verifiedAt: new Date(),
        }),
        registerContract: () => invoke("registerContract"),
        submitContractAcceptance: () => invoke("submitContractAcceptance"),
        submitHandover: () => invoke("submitHandover"),
        submitReturn: () => invoke("submitReturn"),
        completeContract: () => invoke("completeContract"),
      };

      return {
        provider,
        calls,
        setResult(next: TarsProviderResult) {
          result = next;
        },
        setGate(next: Promise<void> | null) {
          gate = next;
        },
      };
    }

    let fake: ReturnType<typeof createFakeTarsProvider>;

    function useFake() {
      fake = createFakeTarsProvider();
      setTarsProviderForTests(fake.provider);
      return fake;
    }

    // ---- seeding helpers ---------------------------------------------------

    async function seedUser() {
      const { hashPassword } = await import("src/lib/security/password");
      const { normalizeEmail } = await import("src/lib/security/normalize");
      const email = normalizeEmail(admin.email);
      const role = await prisma.role.upsert({
        where: { key: `tars_admin_${run}` },
        update: {},
        create: { key: `tars_admin_${run}`, name: "tars admin" },
      });
      for (const key of PERMS) {
        const perm = await prisma.permission.upsert({
          where: { key },
          update: {},
          create: { key, category: key.split(".")[0], description: key },
        });
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
          update: {},
          create: { roleId: role.id, permissionId: perm.id },
        });
      }
      const passwordHash = await hashPassword(admin.password);
      await prisma.user.upsert({
        where: { email },
        update: { status: "ACTIVE", passwordHash },
        create: { email, name: "tars admin", status: "ACTIVE", passwordHash },
      });
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
    }

    const auth = () => ({ authorization: `Bearer ${token}` });



    async function seedValidLicense(rentalToken: string) {
      await seedReadyIdentity(app, rentalToken, { licenseNumber: "DL-TARS-1", expiryDate: "2030-01-01" });
    }

    let photoSeq = 0;
    async function outSignature() {
      photoSeq += 1;
      const row = await prisma.attachment.create({
        data: { originalName: "out-signature.png", storageKey: `tars-${run}-${photoSeq}-sig.png`, mimeType: "image/png", size: 8 },
      });
      return row.id;
    }

    async function dummyPhotos(angles: readonly string[] = INSPECTION_ANGLES) {
      const ids: string[] = [];
      for (let i = 0; i < 8; i++) {
        photoSeq += 1;
        const row = await prisma.attachment.create({
          data: {
            originalName: `tars-${run}-${photoSeq}.png`,
            storageKey: `tars-${run}-${photoSeq}.png`,
            mimeType: "image/png",
            size: 8,
          },
        });
        ids.push(row.id);
      }
      return angles.map((angle, i) => ({ attachmentId: ids[i]!, angle }));
    }

    async function createVehicle(label: string) {
      const res = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(),
        payload: {
         companyId: await testCompanyId(prisma),
          vehicleName: `TARS-${label}-${run}`,
          plateNumber: `TARS ${label} ${run}`,
          dailyRate: 400,
        },
      });
      assert.equal(res.statusCode, 201, res.body);
      return res.json().data.id as number;
    }

    async function createOffer(vehicleId: number) {
      const res = await app.inject({
        method: "POST",
        url: "/contracts/offers",
        headers: auth(),
        payload: {
          vehicleId,
          priceType: "DAILY",
          rentalDays: 3,
          agreedAmount: 1500,
          collectionMode: "ELECTRONIC",
          depositAmount: 500,
        },
      });
      assert.equal(res.statusCode, 201, res.body);
      return res.json().data as { id: string; contractNumber: string };
    }

    /** Drives one contract all the way to CLOSED so every mapper has real data. */
    async function seedClosedContract() {
      closedVehicleId = await createVehicle("LIFE");
      const offer = await createOffer(closedVehicleId);
      closedContractId = offer.id;
      closedContractNumber = offer.contractNumber;

      const link = await app.inject({
        method: "POST",
        url: `/contracts/${closedContractId}/rental-link`,
        headers: auth(),
      });
      const rentalToken = link.json().data.link.token as string;
      await seedValidLicense(rentalToken);

      const form = await app.inject({
        method: "POST",
        url: `/contracts/rental/${rentalToken}/form`,
        payload: {
          name: "Omar TARS",
          mobile: "+971500000021",
          nationality: "AE",
          identityNumber: "784-1990-555",
          passportNumber: "P-TARS-1",
          address: "Dubai",
        },
      });
      assert.equal(form.statusCode, 200, form.body);

      const accept = await app.inject({
        method: "POST",
        url: `/contracts/rental/${rentalToken}/accept`,
        payload: {},
      });
      assert.equal(accept.statusCode, 200, accept.body);

      const payments = createFakePaymentProvider(run);
      setPaymentProviderForTests(payments.provider);
      await linkCardViaFakeProvider(app, payments, rentalToken, closedContractId);
      await confirmRentalPaymentViaStatusToken(app, payments, rentalToken, `tars-pay-${closedContractId}`);

      const carOut = await app.inject({
        method: "POST",
        url: `/contracts/${closedContractId}/car-out`,
        headers: auth(),
        payload: { mileageOut: 12000, fuelOut: "F", notes: "clean", photos: await dummyPhotos(CAR_OUT_REQUIRED_ANGLES), hirerSignatureAttachmentId: await outSignature() },
      });
      assert.equal(carOut.statusCode, 200, carOut.body);

      const returnLink = await app.inject({
        method: "POST",
        url: `/contracts/${closedContractId}/return-link`,
        headers: auth(),
      });
      const returnToken = returnLink.json().data.link.token as string;
      const confirmReturn = await app.inject({ method: "POST", url: `/contracts/return/${returnToken}/confirm` });
      assert.equal(confirmReturn.statusCode, 200, confirmReturn.body);

      const carIn = await app.inject({
        method: "POST",
        url: `/contracts/return/${returnToken}/car-in`,
        payload: { mileageIn: 12480, fuelIn: "1/2", photos: await dummyPhotos() },
      });
      assert.equal(carIn.statusCode, 200, carIn.body);

      const reconcile = await app.inject({
        method: "POST",
        url: `/contracts/${closedContractId}/reconcile`,
        headers: auth(),
        payload: { lines: [{ type: "FUEL", description: "fuel gap", amount: 120 }] },
      });
      assert.equal(reconcile.statusCode, 200, reconcile.body);

      const recPay = await app.inject({
        method: "POST",
        url: `/contracts/${closedContractId}/reconciliation/payment`,
        headers: auth(),
      });
      assert.equal(recPay.statusCode, 200, recPay.body);
      const recPaymentId = recPay.json().data.payment.id as string;
      await confirmPaymentViaWebhook(app, payments, recPaymentId);

      const close = await app.inject({
        method: "POST",
        url: `/contracts/${closedContractId}/close`,
        headers: auth(),
      });
      assert.equal(close.statusCode, 200, close.body);
      assert.equal(close.json().data.status, "CLOSED");
    }

    function reason(error: unknown): string | undefined {
      return error instanceof AppError ? (error.context?.reason as string) : undefined;
    }

    async function expectError(promise: Promise<unknown>): Promise<unknown> {
      try {
        await promise;
      } catch (error) {
        return error;
      }
      return undefined;
    }

    before(async () => {
      process.env.LEGACY_CARD_LINK_ENABLED = "true";
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("tars integration refuses to run unless DATABASE_URL is haidara_test");
      }
      // TARS is disabled in the test environment: the app must still boot.
      assert.equal(env.TARS_ENABLED, false);

      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;

      const { createTarsIntegrationService } = await import(
        "src/modules/integrations/tars/tars.service"
      );
      tars = createTarsIntegrationService(app);

      await seedUser();
      const login = await app.inject({ method: "POST", url: "/auth/login", payload: admin });
      assert.equal(login.statusCode, 200, login.body);
      token = login.json().data.accessToken;

      bareContractId = (await createOffer(await createVehicle("BARE"))).id;
      await seedClosedContract();
    });

    after(async () => {
      await injectDocumentOcr(undefined);
      setTarsProviderForTests(undefined);
      setPaymentProviderForTests(undefined);
      if (app) await app.close();
    });

    // ---- unconfigured ------------------------------------------------------

    test("an unconfigured provider fails closed and persists nothing", async () => {
      setTarsProviderForTests(undefined);
      const before = await prisma.contract.findUniqueOrThrow({
        where: { id: bareContractId },
        select: { status: true, revision: true },
      });

      for (const operationType of [
        "REGISTER_CONTRACT",
        "CONTRACT_ACCEPTANCE",
        "HANDOVER",
        "RETURN_DOCUMENTATION",
        "COMPLETE_CONTRACT",
      ] as const) {
        const error = await expectError(tars.execute(bareContractId, operationType));
        assert.equal(reason(error), "TARS_NOT_CONFIGURED", operationType);
      }

      // No fake success — and no placeholder rows at all.
      assert.equal(await prisma.tarsOperation.count({ where: { contractId: bareContractId } }), 0);
      assert.equal(
        await prisma.tarsContractIntegration.count({ where: { contractId: bareContractId } }),
        0,
      );
      const after = await prisma.contract.findUniqueOrThrow({
        where: { id: bareContractId },
        select: { status: true, revision: true },
      });
      assert.deepEqual(after, before);
    });

    test("the staff projection reports NOT_STARTED without creating rows", async () => {
      setTarsProviderForTests(undefined);
      const res = await app.inject({
        method: "GET",
        url: `/contracts/${bareContractId}/tars`,
        headers: auth(),
      });
      assert.equal(res.statusCode, 200, res.body);
      const state = res.json().data.tars;
      assert.equal(state.configured, false);
      assert.equal(state.externalContractId, null);
      assert.equal(state.lastSuccessfulSyncAt, null);
      assert.deepEqual(state.operations, {
        registerContract: "NOT_STARTED",
        contractAcceptance: "NOT_STARTED",
        handover: "NOT_STARTED",
        returnDocumentation: "NOT_STARTED",
        completeContract: "NOT_STARTED",
      });
      assert.equal(
        await prisma.tarsContractIntegration.count({ where: { contractId: bareContractId } }),
        0,
      );
    });

    test("the TARS read projection requires contracts.read", async () => {
      const res = await app.inject({ method: "GET", url: `/contracts/${bareContractId}/tars` });
      assert.equal(res.statusCode, 401);
    });

    // ---- normalized input --------------------------------------------------

    test("register-contract input is built from Diamond Contract/Customer/Vehicle/Rental", async () => {
      const input = await tars.buildOperationInput(closedContractId, "REGISTER_CONTRACT");
      assert.equal(input.operationType, "REGISTER_CONTRACT");
      const payload = input.payload as Awaited<
        ReturnType<typeof tars.buildOperationInput>
      >["payload"] & { customer: { name: string } };

      const contract = await prisma.contract.findUniqueOrThrow({
        where: { id: closedContractId },
        include: { customer: true, vehicle: true },
      });

      assert.equal(payload.contract.contractNumber, contract.contractNumber);
      assert.equal(payload.customer.name, contract.customer!.name);
      assert.equal(
        (payload as { vehicle: { vehicleId: number } }).vehicle.vehicleId,
        contract.vehicleId,
      );
      const rental = (payload as { rental: { agreedAmount: number; rentalDays: number } }).rental;
      assert.equal(rental.agreedAmount, contract.agreedAmount);
      assert.equal(rental.rentalDays, contract.rentalDays);
      // The OCR-verified license, not the value typed into the public form.
      assert.equal((payload as { license: { number: string } }).license.number, "DL-TARS-1");
    });

    test("handover and return inputs reference existing Attachment rows without copying bytes", async () => {
      const handover = await tars.buildOperationInput(closedContractId, "HANDOVER");
      const returned = await tars.buildOperationInput(closedContractId, "RETURN_DOCUMENTATION");

      const carOutPhotos = await prisma.contractCarOutPhoto.findMany({
        where: { carOut: { contractId: closedContractId } },
        orderBy: { sortOrder: "asc" },
      });
      const carInPhotos = await prisma.contractCarInPhoto.findMany({
        where: { carIn: { contractId: closedContractId } },
        orderBy: { sortOrder: "asc" },
      });

      const handoverPhotos = (handover.payload as { photos: Array<{ attachmentId: string }> })
        .photos;
      const returnPhotos = (returned.payload as { photos: Array<{ attachmentId: string }> })
        .photos;

      assert.deepEqual(
        handoverPhotos.map((photo) => photo.attachmentId).sort(),
        carOutPhotos.map((photo) => photo.attachmentId).sort(),
      );
      assert.deepEqual(
        returnPhotos.map((photo) => photo.attachmentId).sort(),
        carInPhotos.map((photo) => photo.attachmentId).sort(),
      );
      // Attachment bytes are never duplicated into the integration payload.
      const serialized = JSON.stringify([handover, returned]);
      assert.equal(serialized.includes("base64"), false);
      assert.equal(serialized.includes("storageKey"), false);
    });

    test("acceptance and completion inputs map existing Diamond state", async () => {
      const acceptance = await tars.buildOperationInput(closedContractId, "CONTRACT_ACCEPTANCE");
      const stored = await prisma.contractAcceptance.findUniqueOrThrow({
        where: { contractId: closedContractId },
      });
      const mapped = (acceptance.payload as { acceptance: { acceptedAt: Date; termsVersion: string } })
        .acceptance;
      assert.equal(mapped.acceptedAt.getTime(), stored.acceptedAt.getTime());
      assert.equal(mapped.termsVersion, stored.termsVersion);

      const completion = await tars.buildOperationInput(closedContractId, "COMPLETE_CONTRACT");
      const reconciliation = await prisma.contractReconciliation.findUniqueOrThrow({
        where: { contractId: closedContractId },
      });
      const completionPayload = (
        completion.payload as { completion: { reconciliation: { finalAmount: number } } }
      ).completion;
      assert.equal(completionPayload.reconciliation.finalAmount, reconciliation.finalAmount);
    });

    test("mapping gaps are reported before any provider call", async () => {
      const provider = useFake();
      const error = await expectError(tars.execute(bareContractId, "HANDOVER"));
      assert.equal(reason(error), "TARS_MAPPING_INCOMPLETE");
      assert.deepEqual(provider.calls, []);
      assert.equal(await prisma.tarsOperation.count({ where: { contractId: bareContractId } }), 0);
    });

    // ---- execution ---------------------------------------------------------

    test("a successful registration stores the external contract id", async () => {
      const provider = useFake();
      provider.setResult({
        success: true,
        externalContractId: "TARS-EXT-1",
        externalReference: "TARS-REF-REGISTER",
        providerOperationId: "TARS-OP-1",
      });

      const result = await tars.execute(closedContractId, "REGISTER_CONTRACT");
      assert.equal(result.status, "SUCCEEDED");
      assert.equal(result.externalContractId, "TARS-EXT-1");
      assert.deepEqual(provider.calls, ["registerContract"]);

      const integration = await prisma.tarsContractIntegration.findUniqueOrThrow({
        where: { contractId: closedContractId },
      });
      assert.equal(integration.externalContractId, "TARS-EXT-1");
      assert.notEqual(integration.lastSuccessfulSyncAt, null);

      const operation = await prisma.tarsOperation.findFirstOrThrow({
        where: { contractId: closedContractId, operationType: "REGISTER_CONTRACT" },
      });
      assert.equal(operation.status, "SUCCEEDED");
      assert.equal(operation.externalReference, "TARS-REF-REGISTER");
      assert.equal(operation.providerOperationId, "TARS-OP-1");
      assert.equal(operation.lastErrorCode, null);

      // Diamond's own contract number is never rewritten by TARS.
      const contract = await prisma.contract.findUniqueOrThrow({
        where: { id: closedContractId },
      });
      assert.equal(contract.contractNumber, closedContractNumber);
    });

    test("a successful operation is not sent again", async () => {
      const provider = useFake();
      const error = await expectError(tars.execute(closedContractId, "REGISTER_CONTRACT"));
      assert.equal(reason(error), "TARS_OPERATION_ALREADY_COMPLETED");
      assert.deepEqual(provider.calls, []);
      assert.equal(
        await prisma.tarsOperation.count({
          where: { contractId: closedContractId, operationType: "REGISTER_CONTRACT" },
        }),
        1,
      );
    });

    test("a failed attempt is retryable and both attempts stay auditable", async () => {
      const provider = useFake();
      provider.setResult({ success: false, errorCode: "TARS_PROVIDER_ERROR" });
      const failed = await tars.execute(closedContractId, "HANDOVER");
      assert.equal(failed.status, "FAILED");
      assert.equal(failed.errorCode, "TARS_PROVIDER_ERROR");
      assert.equal(failed.attemptNumber, 1);

      provider.setResult({ success: true, externalReference: "TARS-REF-HANDOVER" });
      const succeeded = await tars.execute(closedContractId, "HANDOVER");
      assert.equal(succeeded.status, "SUCCEEDED");
      assert.equal(succeeded.attemptNumber, 2);

      const attempts = await prisma.tarsOperation.findMany({
        where: { contractId: closedContractId, operationType: "HANDOVER" },
        orderBy: { attemptNumber: "asc" },
      });
      assert.deepEqual(
        attempts.map((attempt) => attempt.status),
        ["FAILED", "SUCCEEDED"],
      );

      const state = await tars.getIntegrationState(closedContractId);
      assert.equal(state.operations.handover, "SUCCEEDED");
      // The external contract id from registration is not overwritten.
      assert.equal(state.externalContractId, "TARS-EXT-1");
    });

    test("two simultaneous attempts never both reach PROCESSING", async () => {
      const provider = useFake();
      provider.setGate(new Promise<void>((resolve) => setTimeout(resolve, 300)));
      provider.setResult({ success: true, externalReference: "TARS-REF-RETURN" });

      const [first, second] = await Promise.allSettled([
        tars.execute(closedContractId, "RETURN_DOCUMENTATION"),
        tars.execute(closedContractId, "RETURN_DOCUMENTATION"),
      ]);
      provider.setGate(null);

      const fulfilled = [first, second].filter((r) => r.status === "fulfilled");
      const rejected = [first, second].filter((r) => r.status === "rejected");
      assert.equal(fulfilled.length, 1);
      assert.equal(rejected.length, 1);
      assert.equal(
        reason((rejected[0] as PromiseRejectedResult).reason),
        "TARS_OPERATION_IN_PROGRESS",
      );
      assert.deepEqual(provider.calls, ["submitReturn"]);

      const attempts = await prisma.tarsOperation.findMany({
        where: { contractId: closedContractId, operationType: "RETURN_DOCUMENTATION" },
      });
      assert.equal(attempts.length, 1);
      assert.equal(attempts[0]!.status, "SUCCEEDED");
    });

    test("replaying an idempotency key does not re-send the operation", async () => {
      const provider = useFake();
      provider.setResult({ success: true, externalReference: "TARS-REF-COMPLETE" });
      const key = `tars-complete-${run}`;

      const first = await tars.execute(closedContractId, "COMPLETE_CONTRACT", {
        idempotencyKey: key,
      });
      assert.equal(first.status, "SUCCEEDED");

      const replay = await tars.execute(closedContractId, "COMPLETE_CONTRACT", {
        idempotencyKey: key,
      });
      assert.equal(replay.status, "SUCCEEDED");
      assert.equal(replay.operationId, first.operationId);
      assert.deepEqual(provider.calls, ["completeContract"]);
      assert.equal(
        await prisma.tarsOperation.count({
          where: { contractId: closedContractId, operationType: "COMPLETE_CONTRACT" },
        }),
        1,
      );
    });

    // ---- domain independence ----------------------------------------------

    test("a TARS failure never changes Contract, Vehicle or Payment state", async () => {
      const provider = useFake();
      provider.setResult({ success: false, errorCode: "SOMETHING WENT wrong: 500 <html>" });

      const before = await prisma.contract.findUniqueOrThrow({
        where: { id: closedContractId },
        select: { status: true, revision: true, closedAt: true },
      });
      const vehicleBefore = await prisma.vehicle.findUniqueOrThrow({
        where: { id: closedVehicleId },
        select: { operationalStatus: true },
      });
      const paymentBefore = await prisma.contractPayment.findFirstOrThrow({
        where: { contractId: closedContractId },
        select: { status: true },
      });

      const result = await tars.execute(closedContractId, "CONTRACT_ACCEPTANCE");
      assert.equal(result.status, "FAILED");
      // The raw provider text is normalized to a safe code, never stored verbatim.
      assert.equal(result.errorCode, "SOMETHING_WENT_WRONG__500__HTML_");
      assert.equal(result.errorCode!.includes("<"), false);

      assert.deepEqual(
        await prisma.contract.findUniqueOrThrow({
          where: { id: closedContractId },
          select: { status: true, revision: true, closedAt: true },
        }),
        before,
      );
      assert.deepEqual(
        await prisma.vehicle.findUniqueOrThrow({
          where: { id: closedVehicleId },
          select: { operationalStatus: true },
        }),
        vehicleBefore,
      );
      assert.deepEqual(
        await prisma.contractPayment.findFirstOrThrow({
          where: { contractId: closedContractId },
          select: { status: true },
        }),
        paymentBefore,
      );
    });

    test("no TARS operation row is created by the Diamond lifecycle itself", async () => {
      const vehicleId = await createVehicle("AUTO");
      const offer = await createOffer(vehicleId);

      const link = await app.inject({
        method: "POST",
        url: `/contracts/${offer.id}/rental-link`,
        headers: auth(),
      });
      const rentalToken = link.json().data.link.token as string;
      await seedValidLicense(rentalToken);
      await app.inject({
        method: "POST",
        url: `/contracts/rental/${rentalToken}/form`,
        payload: { name: "Auto Check", mobile: "+971500000031", nationality: "AE", passportNumber: "P-AUTO" },
      });
      await app.inject({
        method: "POST",
        url: `/contracts/rental/${rentalToken}/accept`,
        payload: {},
      });
      const payments = createFakePaymentProvider(`${run}-auto`);
      setPaymentProviderForTests(payments.provider);
      await linkCardViaFakeProvider(app, payments, rentalToken, offer.id);
      await confirmRentalPaymentViaStatusToken(app, payments, rentalToken, `tars-auto-${offer.id}`);
      await app.inject({
        method: "POST",
        url: `/contracts/${offer.id}/car-out`,
        headers: auth(),
        payload: { mileageOut: 500, fuelOut: "F", photos: await dummyPhotos(CAR_OUT_REQUIRED_ANGLES), hirerSignatureAttachmentId: await outSignature() },
      });

      // Signing, payment and Car-Out are deliberately NOT wired to TARS yet.
      assert.equal(await prisma.tarsOperation.count({ where: { contractId: offer.id } }), 0);
      assert.equal(
        await prisma.tarsContractIntegration.count({ where: { contractId: offer.id } }),
        0,
      );
    });

    test("the staff projection reflects stored integration state", async () => {
      useFake();
      const res = await app.inject({
        method: "GET",
        url: `/contracts/${closedContractId}/tars`,
        headers: auth(),
      });
      assert.equal(res.statusCode, 200, res.body);
      const state = res.json().data.tars;
      assert.equal(state.configured, true);
      assert.equal(state.externalContractId, "TARS-EXT-1");
      assert.deepEqual(state.operations, {
        registerContract: "SUCCEEDED",
        contractAcceptance: "FAILED",
        handover: "SUCCEEDED",
        returnDocumentation: "SUCCEEDED",
        completeContract: "SUCCEEDED",
      });
    });
  });
}
