import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { acquireAdvisoryLocks } from "src/lib/db/advisory-lock";
import { withTransaction, type Tx } from "src/lib/db/transaction";
import { runIdempotent, fingerprintIdempotentPayload } from "src/lib/db/idempotency";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import {
  CONTRACT_PAYMENT_LOCK_NS,
  ROAD_LIABILITY_CHARGE_LOCK_NS,
} from "src/modules/contracts/contracts.constants";
import {
  deriveCustomerChargeAdjustment,
} from "src/modules/contracts/contracts-road-liability-charge";
import { contractError } from "src/modules/contracts/contracts.errors";
import { createContractPaymentService } from "src/modules/contracts/payment/contract-payment.service";
import { createPaymentProvider } from "src/modules/contracts/payment/payment-provider.factory";
import {
  resolveStripeProviderAccountKey,
  stripeLivemodeConfigured,
} from "src/modules/contracts/payment/stripe-account-identity";
import { buildRoadLiabilityChargeProposal, isChargeableRoadLiability } from "src/modules/road-liabilities/road-liability.mapper";
import { roadLiabilityNotFoundError } from "src/modules/road-liabilities/road-liability.errors";
import { roadLiabilityCollectionError } from "src/modules/road-liabilities/road-liability-collection.errors";
import {
  assertChargeOpenForNewCollection,
  assertNoActiveRoadLiabilityPayment,
} from "src/modules/road-liabilities/road-liability-collection-guards";
import { resolveCollectionAuthorization } from "src/modules/road-liabilities/road-liability-collection.capability";
import { buildRoadLiabilityFailureCustomer } from "src/modules/road-liabilities/road-liability-failure-customer";
import { mapStripeFailureToLocalized } from "src/modules/road-liabilities/road-liability-stripe-failure-mapping";
import { ROAD_LIABILITY_COLLECTION_LOCK_NS } from "src/modules/road-liabilities/road-liability.constants";
import { vehicleDisplayName } from "src/modules/vehicles/vehicles.mapper";
import type { z } from "zod";
import type {
  ManualCollectionConfirmInputSchema,
  OffSessionCollectionInputSchema,
  RoadLiabilityCollectionViewSchema,
  OffSessionCollectionResultSchema,
} from "src/modules/road-liabilities/road-liability-collection.schema";

type CollectionView = z.infer<typeof RoadLiabilityCollectionViewSchema>;
type OffSessionInput = z.infer<typeof OffSessionCollectionInputSchema>;
type OffSessionResult = z.infer<typeof OffSessionCollectionResultSchema>;
type ManualConfirmInput = z.infer<typeof ManualCollectionConfirmInputSchema>;

function operationalStateFromCharge(charge: {
  operationalState: string | null;
  roadLiability: { collectionStatus: string };
} | null): CollectionView["operationalState"] {
  if (!charge) return "collectible";
  if (charge.roadLiability.collectionStatus === "SETTLED") return "paid";
  return (charge.operationalState?.toLowerCase() as CollectionView["operationalState"]) ?? "collectible";
}

export function createRoadLiabilityCollectionService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const payments = createContractPaymentService(prisma);

  async function loadLiability(roadLiabilityId: string) {
    const liability = await prisma.roadLiability.findUnique({
      where: { id: roadLiabilityId },
      include: {
        attributedContract: {
          include: {
            customer: true,
            vehicle: { include: { model: { select: { name: true } } } },
            company: { select: { code: true } },
          },
        },
        customerCharge: true,
      },
    });
    if (!liability) throw roadLiabilityNotFoundError();
    return liability;
  }

  async function freezeDirectCharge(
    tx: Tx,
    liability: Awaited<ReturnType<typeof loadLiability>>,
    actorUserId: number,
    input?: OffSessionInput,
  ) {
    if (!liability.attributedContractId || !liability.attributedContract) {
      throw roadLiabilityCollectionError.notCollectible();
    }
    if (!isChargeableRoadLiability(liability) || liability.amount == null) {
      throw roadLiabilityCollectionError.notCollectible();
    }
    if (liability.collectionStatus === "SETTLED") {
      throw roadLiabilityCollectionError.alreadySettled();
    }

    const existing = await tx.roadLiabilityCustomerCharge.findUnique({
      where: { roadLiabilityId: liability.id },
    });
    if (existing) {
      if (existing.destinationType !== "DIRECT_COLLECTION") {
        throw contractError.roadLiabilityAlreadyCharged();
      }
      if (existing.operationalState === "PAID") {
        throw roadLiabilityCollectionError.alreadySettled();
      }
      return existing;
    }

    const proposal = buildRoadLiabilityChargeProposal({ amount: liability.amount });
    const customerChargeAmount = input?.customerChargeAmount ?? proposal.suggestedCustomerChargeAmount;
    const derived = deriveCustomerChargeAdjustment({
      officialAmount: liability.amount,
      customerChargeAmount,
      adjustmentReason: input?.adjustmentReason,
    });
    if (!derived.ok) {
      if (derived.reason === "CUSTOMER_CHARGE_BELOW_OFFICIAL") throw contractError.customerChargeBelowOfficial();
      if (derived.reason === "ADJUSTMENT_REASON_REQUIRED") throw contractError.adjustmentReasonRequired();
      throw contractError.invalidCustomerCharge();
    }

    return tx.roadLiabilityCustomerCharge.create({
      data: {
        roadLiabilityId: liability.id,
        contractId: liability.attributedContractId,
        destinationType: "DIRECT_COLLECTION",
        officialAmountSnapshot: derived.officialAmount,
        customerChargeAmount: derived.customerChargeAmount,
        adjustmentAmount: derived.adjustmentAmount,
        adjustmentReason: derived.adjustmentReason,
        adjustmentNote: input?.adjustmentNote?.trim() || null,
        confirmedByUserId: actorUserId,
        confirmedAt: new Date(),
        operationalState: "COLLECTIBLE",
      },
    });
  }

  async function buildCollectionView(roadLiabilityId: string): Promise<CollectionView> {
    const liability = await loadLiability(roadLiabilityId);
    const contract = liability.attributedContract;
    const { capability } = await resolveCollectionAuthorization(
      prisma,
      liability.attributedContractId ?? "",
      contract?.customerId ?? null,
    );

    const activePayment = liability.customerCharge?.contractPaymentId
      ? await prisma.contractPayment.findUnique({
          where: { id: liability.customerCharge.contractPaymentId },
        })
      : liability.customerCharge
        ? await prisma.contractPayment.findFirst({
            where: {
              purpose: "ROAD_LIABILITY",
              targetId: liability.customerCharge.id,
              status: { in: ["PENDING", "PROCESSING"] },
            },
            orderBy: { createdAt: "desc" },
          })
        : null;

    return {
      liabilityId: liability.id,
      collectionStatus: liability.collectionStatus.toLowerCase() as CollectionView["collectionStatus"],
      operationalState: operationalStateFromCharge(
        liability.customerCharge
          ? { operationalState: liability.customerCharge.operationalState, roadLiability: liability }
          : null,
      ),
      capability,
      charge: liability.customerCharge
        ? {
            officialAmount: liability.customerCharge.officialAmountSnapshot,
            customerChargeAmount: liability.customerCharge.customerChargeAmount,
            currency: "AED",
            adjustmentAmount: liability.customerCharge.adjustmentAmount,
            adjustmentReason: liability.customerCharge.adjustmentReason,
            contractNumber: contract?.contractNumber ?? "",
            customerName: contract?.customer?.name ?? null,
          }
        : liability.amount != null
          ? {
              officialAmount: liability.amount,
              customerChargeAmount: liability.amount,
              currency: liability.currency ?? "AED",
              adjustmentAmount: null,
              adjustmentReason: null,
              contractNumber: contract?.contractNumber ?? "",
              customerName: contract?.customer?.name ?? null,
            }
          : null,
      checkoutUrl: activePayment?.checkoutUrl ?? null,
    };
  }

  async function buildFailurePayload(
    liability: Awaited<ReturnType<typeof loadLiability>>,
    declineCode: string | null,
    failureCode: string | null,
  ) {
    const localized = mapStripeFailureToLocalized(declineCode, failureCode);
    const customer = await buildRoadLiabilityFailureCustomer(prisma, liability.attributedContractId!);
    const auth = liability.attributedContractId
      ? await prisma.contractPaymentAuthorization.findUnique({
          where: { contractId: liability.attributedContractId },
          include: { customerPaymentMethod: true },
        })
      : null;
    const vehicle = liability.attributedContract?.vehicle;
    return {
      liability: {
        id: liability.id,
        source: liability.authoritativeSourceKey,
        type: liability.type,
        amount: liability.amount,
        occurredAt: liability.occurredAt,
        externalReference: liability.authoritativeExternalReference,
        contractNumber: liability.attributedContract?.contractNumber ?? null,
        vehicleLabel: vehicle
          ? vehicleDisplayName({
              vehicleName: vehicle.vehicleName,
              modelName: vehicle.model?.name ?? null,
              modelYear: vehicle.modelYear,
              plateNumber: vehicle.plateNumber,
            })
          : null,
        plateNumber: vehicle?.plateNumber ?? null,
      },
      customer,
      savedCard: auth
        ? { brand: auth.customerPaymentMethod.cardBrand, last4: auth.customerPaymentMethod.cardLast4 }
        : null,
      failure: {
        reasonCode: localized.reasonCode,
        messageEn: localized.messageEn,
        messageAr: localized.messageAr,
        declineCode,
        occurredAt: new Date(),
      },
    };
  }

  async function collectOffSession(
    roadLiabilityId: string,
    input: OffSessionInput,
    actorUserId: number,
    idempotencyKey?: string,
  ): Promise<OffSessionResult> {
    const run = async () => {
      const liability = await loadLiability(roadLiabilityId);
      if (!liability.attributedContractId) throw roadLiabilityCollectionError.notCollectible();

      const { authorization, capability } = await resolveCollectionAuthorization(
        prisma,
        liability.attributedContractId,
        liability.attributedContract?.customerId ?? null,
      );
      if (capability.cashCollectionRequired) {
        throw roadLiabilityCollectionError.cashCollectionRequired();
      }
      if (!authorization || !capability.offSessionAvailable) {
        throw roadLiabilityCollectionError.authorizationMissing();
      }

      const provider = createPaymentProvider();
      if (!provider.configured) throw contractError.paymentProviderNotConfigured();

      const Stripe = (await import("stripe")).default;
      const { env } = await import("src/config/env");
      const stripe = new Stripe(env.STRIPE_SECRET_KEY!);
      const providerAccountKey = await resolveStripeProviderAccountKey(stripe);
      const livemode = stripeLivemodeConfigured();
      const profile = authorization.customerPaymentMethod.profile;
      const stripeCustomerId = profile.providerCustomerId;
      if (!stripeCustomerId) throw roadLiabilityCollectionError.authorizationMissing();

      const attemptId = randomUUID();
      const stripeIdempotencyKey = `diamond:off-session:${attemptId}:v1`;

      const phase = await withTransaction(prisma, async (tx) => {
        await acquireAdvisoryLocks(tx, [
          { namespace: ROAD_LIABILITY_CHARGE_LOCK_NS, entityId: roadLiabilityId },
          { namespace: ROAD_LIABILITY_COLLECTION_LOCK_NS, entityId: roadLiabilityId },
          { namespace: CONTRACT_PAYMENT_LOCK_NS, entityId: `ROAD_LIABILITY:${roadLiabilityId}` },
        ]);

        const fresh = await tx.roadLiability.findUnique({ where: { id: roadLiabilityId } });
        if (!fresh) throw roadLiabilityNotFoundError();
        if (fresh.collectionStatus === "SETTLED") throw roadLiabilityCollectionError.alreadySettled();

        const charge = await freezeDirectCharge(tx, { ...liability, ...fresh, attributedContract: liability.attributedContract }, actorUserId, input);

        assertChargeOpenForNewCollection(charge, { allowFailedRetry: true });
        await assertNoActiveRoadLiabilityPayment(tx, charge.id);

        const existingPayment = await tx.contractPayment.findFirst({
          where: { purpose: "ROAD_LIABILITY", targetId: charge.id, status: "CONFIRMED" },
        });
        if (existingPayment) {
          return { alreadySettled: true as const, charge };
        }

        let payment = await tx.contractPayment.findFirst({
          where: {
            purpose: "ROAD_LIABILITY",
            targetId: charge.id,
            status: { in: ["PENDING", "PROCESSING"] },
          },
          orderBy: { createdAt: "desc" },
        });
        if (!payment) {
          payment = await tx.contractPayment.create({
            data: {
              contractId: charge.contractId,
              purpose: "ROAD_LIABILITY",
              targetId: charge.id,
              amount: charge.customerChargeAmount,
              currency: "AED",
              method: "CARD",
              status: "PROCESSING",
              provider: "stripe",
              processingStartedAt: new Date(),
              createdByUserId: actorUserId,
            },
          });
        }

        const attempt = await tx.contractPaymentOffSessionAttempt.create({
          data: {
            id: attemptId,
            contractPaymentId: payment.id,
            customerChargeId: charge.id,
            authorizationId: authorization.id,
            customerPaymentMethodId: authorization.customerPaymentMethodId,
            provider: "stripe",
            providerAccountKey,
            livemode,
            amount: charge.customerChargeAmount,
            currency: "AED",
            idempotencyKey: stripeIdempotencyKey,
            status: "PREPARING",
          },
        });

        await tx.roadLiabilityCustomerCharge.update({
          where: { id: charge.id },
          data: { operationalState: "PROCESSING" },
        });

        return {
          alreadySettled: false as const,
          charge,
          payment,
          attempt,
          companyCode: liability.attributedContract?.company.code ?? null,
        };
      });

      if (phase.alreadySettled) {
        return {
          status: "succeeded" as const,
          operationalState: "paid" as const,
          failure: null,
        };
      }

      const stripeResult = await provider.createOffSessionPaymentIntent({
        idempotencyKey: stripeIdempotencyKey,
        paymentId: phase.payment.id,
        contractId: phase.charge.contractId,
        purpose: "ROAD_LIABILITY",
        targetId: phase.charge.id,
        amount: phase.charge.customerChargeAmount,
        currency: "AED",
        stripeCustomerId,
        stripePaymentMethodId: authorization.customerPaymentMethod.providerPaymentMethodId,
        companyCode: phase.companyCode,
      });

      const result = await withTransaction(prisma, async (tx) => {
        await tx.contractPaymentOffSessionAttempt.update({
          where: { id: phase.attempt.id },
          data: {
            providerReference: stripeResult.providerReference || null,
            status:
              stripeResult.status === "CONFIRMED"
                ? "SUCCEEDED"
                : stripeResult.requiresAction
                  ? "REQUIRES_ACTION"
                  : stripeResult.status === "FAILED"
                    ? "FAILED"
                    : "PROCESSING",
            failureCode: stripeResult.failureCode ?? null,
            declineCode: stripeResult.declineCode ?? null,
            requiresAction: stripeResult.requiresAction,
            completedAt:
              stripeResult.status === "CONFIRMED" || stripeResult.status === "FAILED"
                ? new Date()
                : null,
          },
        });

        const payment = await tx.contractPayment.findUniqueOrThrow({ where: { id: phase.payment.id } });
        if (!payment.providerReference && stripeResult.providerReference) {
          await tx.contractPayment.update({
            where: { id: payment.id },
            data: { providerReference: stripeResult.providerReference },
          });
        }

        if (stripeResult.status === "CONFIRMED") {
          return { status: "succeeded" as const, operationalState: "paid" as const, failure: null, paymentId: payment.id };
        }

        if (stripeResult.requiresAction) {
          await tx.roadLiabilityCustomerCharge.update({
            where: { id: phase.charge.id },
            data: { operationalState: "REQUIRES_ACTION" },
          });
          const failure = await buildFailurePayload(liability, stripeResult.declineCode ?? null, stripeResult.failureCode ?? null);
          return { status: "requires_action" as const, operationalState: "requires_action" as const, failure };
        }

        if (stripeResult.status === "FAILED") {
          await tx.roadLiabilityCustomerCharge.update({
            where: { id: phase.charge.id },
            data: { operationalState: "FAILED" },
          });
          await tx.contractPayment.update({
            where: { id: payment.id },
            data: { status: "FAILED", failedAt: new Date(), providerStatus: stripeResult.providerStatus },
          });
          const failure = await buildFailurePayload(liability, stripeResult.declineCode ?? null, stripeResult.failureCode ?? null);
          return { status: "failed" as const, operationalState: "failed" as const, failure };
        }

        return { status: "processing" as const, operationalState: "processing" as const, failure: null };
      });

      if ("paymentId" in result && result.paymentId) {
        await payments.settlePaymentFromProvider(
          result.paymentId,
          stripeResult.providerStatus,
          stripeResult.amountMinor,
          stripeResult.currency,
        );
        return { status: "succeeded" as const, operationalState: "paid" as const, failure: null };
      }

      return result;
    };

    if (!idempotencyKey) return run();
    const outcome = await runIdempotent(
      prisma,
      {
        scope: `road-liability:off-session:${roadLiabilityId}`,
        key: idempotencyKey,
        fingerprint: fingerprintIdempotentPayload(input),
      },
      run,
    );
    if (outcome.deduped) {
      const view = await buildCollectionView(roadLiabilityId);
      const succeeded = view.operationalState === "paid";
      return {
        status: succeeded ? ("succeeded" as const) : ("processing" as const),
        operationalState: view.operationalState ?? ("processing" as const),
        failure: null,
      };
    }
    return outcome.result!;
  }

  async function createPaymentLink(roadLiabilityId: string, actorUserId: number, idempotencyKey?: string) {
    const run = async () => {
      const liability = await loadLiability(roadLiabilityId);
      if (!liability.attributedContractId) throw roadLiabilityCollectionError.notCollectible();

      const { capability } = await resolveCollectionAuthorization(
        prisma,
        liability.attributedContractId,
        liability.attributedContract?.customerId ?? null,
      );
      if (capability.cashCollectionRequired || !capability.paymentLinkAvailable) {
        throw roadLiabilityCollectionError.cashCollectionRequired();
      }

      await withTransaction(prisma, async (tx) => {
        await acquireAdvisoryLocks(tx, [
          { namespace: ROAD_LIABILITY_CHARGE_LOCK_NS, entityId: roadLiabilityId },
          { namespace: ROAD_LIABILITY_COLLECTION_LOCK_NS, entityId: roadLiabilityId },
          { namespace: CONTRACT_PAYMENT_LOCK_NS, entityId: `ROAD_LIABILITY:${roadLiabilityId}` },
        ]);

        const fresh = await tx.roadLiability.findUnique({ where: { id: roadLiabilityId } });
        if (!fresh) throw roadLiabilityNotFoundError();
        if (fresh.collectionStatus === "SETTLED") throw roadLiabilityCollectionError.alreadySettled();

        const charge = await freezeDirectCharge(tx, liability, actorUserId);
        if (charge.operationalState === "PAID") {
          throw roadLiabilityCollectionError.alreadySettled();
        }

        const existingConfirmed = await tx.contractPayment.findFirst({
          where: { purpose: "ROAD_LIABILITY", targetId: charge.id, status: "CONFIRMED" },
        });
        if (existingConfirmed) {
          throw roadLiabilityCollectionError.alreadySettled();
        }

        assertChargeOpenForNewCollection(charge, {
          allowPaymentLinkResume: charge.operationalState === "PAYMENT_LINK_READY",
          allowFailedRetry: true,
        });
        await assertNoActiveRoadLiabilityPayment(tx, charge.id);

        if (charge.operationalState !== "PAYMENT_LINK_READY") {
          await tx.roadLiabilityCustomerCharge.update({
            where: { id: charge.id },
            data: { operationalState: "PAYMENT_LINK_READY" },
          });
        }
      });

      const charge = await prisma.roadLiabilityCustomerCharge.findUniqueOrThrow({
        where: { roadLiabilityId },
      });

      const started = await payments.startPayment({
        purpose: "ROAD_LIABILITY",
        targetId: charge.id,
        createdByUserId: actorUserId,
        validate: async (tx, obligation) => {
          if (obligation.contractId !== liability.attributedContractId) {
            throw contractError.roadLiabilityContractMismatch();
          }
        },
      });

      return { checkoutUrl: started.payment.checkoutUrl, paymentId: started.payment.id };
    };

    if (!idempotencyKey) return run();
    const outcome = await runIdempotent(
      prisma,
      { scope: `road-liability:payment-link:${roadLiabilityId}`, key: idempotencyKey, fingerprint: "{}" },
      run,
    );
    if (outcome.deduped) {
      const charge = await prisma.roadLiabilityCustomerCharge.findUniqueOrThrow({
        where: { roadLiabilityId },
      });
      const payment = charge.contractPaymentId
        ? await prisma.contractPayment.findUnique({ where: { id: charge.contractPaymentId } })
        : await prisma.contractPayment.findFirst({
            where: { purpose: "ROAD_LIABILITY", targetId: charge.id },
            orderBy: { createdAt: "desc" },
          });
      return { checkoutUrl: payment?.checkoutUrl ?? null, paymentId: payment?.id ?? "" };
    }
    return outcome.result!;
  }

  async function startManualCollection(
    _roadLiabilityId: string,
    _actorUserId: number,
  ): Promise<CollectionView> {
    throw roadLiabilityCollectionError.manualCollectionNotSupported();
  }

  async function confirmManualCollection(
    _roadLiabilityId: string,
    _input: ManualConfirmInput,
    _actorUserId: number,
  ): Promise<CollectionView> {
    throw roadLiabilityCollectionError.manualCollectionNotSupported();
  }

  async function confirmCashCollection(
    roadLiabilityId: string,
    actorUserId: number,
    idempotencyKey?: string,
  ) {
    const run = async () => {
      const liability = await loadLiability(roadLiabilityId);
      if (!liability.attributedContractId || !liability.attributedContract) {
        throw roadLiabilityCollectionError.notCollectible();
      }

      const { capability } = await resolveCollectionAuthorization(
        prisma,
        liability.attributedContractId,
        liability.attributedContract.customerId ?? null,
      );
      if (!capability.cashCollectionRequired) {
        throw roadLiabilityCollectionError.cashCollectionNotAllowed();
      }

      await withTransaction(prisma, async (tx) => {
        await acquireAdvisoryLocks(tx, [
          { namespace: ROAD_LIABILITY_CHARGE_LOCK_NS, entityId: roadLiabilityId },
          { namespace: ROAD_LIABILITY_COLLECTION_LOCK_NS, entityId: roadLiabilityId },
          { namespace: CONTRACT_PAYMENT_LOCK_NS, entityId: `ROAD_LIABILITY:${roadLiabilityId}` },
        ]);

        const fresh = await tx.roadLiability.findUnique({ where: { id: roadLiabilityId } });
        if (!fresh) throw roadLiabilityNotFoundError();
        if (fresh.collectionStatus === "SETTLED") throw roadLiabilityCollectionError.alreadySettled();

        const charge = await freezeDirectCharge(tx, liability, actorUserId);

        const existingConfirmed = await tx.contractPayment.findFirst({
          where: { purpose: "ROAD_LIABILITY", targetId: charge.id, status: "CONFIRMED" },
        });
        if (existingConfirmed) return;

        assertChargeOpenForNewCollection(charge, { allowFailedRetry: true });
        await assertNoActiveRoadLiabilityPayment(tx, charge.id);

        const payment = await tx.contractPayment.create({
          data: {
            contractId: charge.contractId,
            purpose: "ROAD_LIABILITY",
            targetId: charge.id,
            amount: charge.customerChargeAmount,
            currency: "AED",
            method: "CASH",
            status: "PENDING",
            createdByUserId: actorUserId,
          },
        });

        await payments.confirmTrustedPaymentInTx(tx, payment.id);
      });

      return buildCollectionView(roadLiabilityId);
    };

    if (!idempotencyKey) return run();
    const outcome = await runIdempotent(
      prisma,
      { scope: `road-liability:cash:${roadLiabilityId}`, key: idempotencyKey, fingerprint: "{}" },
      run,
    );
    if (outcome.deduped) {
      return buildCollectionView(roadLiabilityId);
    }
    return outcome.result!;
  }

  return {
    getCollection: buildCollectionView,
    collectOffSession,
    createPaymentLink,
    startManualCollection,
    confirmManualCollection,
    confirmCashCollection,
  };
}
