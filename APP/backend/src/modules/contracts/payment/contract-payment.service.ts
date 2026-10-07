import type {
  ContractPayment,
  ContractPaymentPurpose,
  ContractPaymentStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import {
  buildPublicFrontendUrl,
  normalizePublicLocale,
  type PublicFrontendLocale,
} from "src/lib/http/public-frontend-url";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { writeOutboxEvent } from "src/lib/db/outbox";
import { withTransaction, type Tx } from "src/lib/db/transaction";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { expiryFromNow, generateOpaqueToken, hashToken } from "src/lib/security/tokens";
import {
  ACTIVE_PAYMENT_STATUSES,
  CONTRACT_LIFECYCLE_LOCK_NS,
  CONTRACT_PAYMENT_LOCK_NS,
  PAYMENT_STATUS_TOKEN_TTL_SECONDS,
} from "src/modules/contracts/contracts.constants";
import { assertTransition } from "src/modules/contracts/contracts-status";
import { completeRentalLinks, revokeReconciliationLinks } from "src/modules/contracts/contracts-links";
import { contractError } from "src/modules/contracts/contracts.errors";
import { assertVehicleFreeForRental } from "src/modules/contracts/vehicle-rental-guard";
import { assertPositiveAedAmount, assertAedCurrency, aedToStripeMinorUnits } from "src/modules/contracts/payment/money";
import { createPaymentProvider, devPaymentSimulationEnabled } from "src/modules/contracts/payment/payment-provider.factory";
import {
  markPaymentProviderReconciled,
  shouldReconcilePaymentWithProvider,
  type ReconcileCandidate,
} from "src/modules/contracts/payment/payment-reconcile-policy";
import {
  getPaymentConsent,
  PAYMENT_METHOD_AUTHORIZATION_VERSION,
} from "src/modules/contracts/payment/payment-consent.constants";
import type { ProviderPaymentStatus } from "src/modules/contracts/payment/payment-provider.types";
import { ensureContractCustomerForPayment } from "src/modules/contracts/contract-customer-materialization";
import {
  createContractPaymentAuthorization,
  findProfileIdForCustomer,
  persistContractCardSnapshot,
  upsertCustomerPaymentMethod,
} from "src/modules/contracts/payment/customer-payment-method.service";
import {
  createCheckoutAttemptService,
  type DesiredCheckoutSnapshot,
} from "src/modules/contracts/payment/checkout-attempt.service";
import {
  claimCustomerPaymentProfile,
  resolveStripeCustomerForPayment,
} from "src/modules/contracts/payment/stripe-payment-profile.service";
import {
  isStripeSdkError,
  stripeErrorCode,
  throwMappedStripeCheckoutError,
} from "src/modules/contracts/payment/payment-stripe-errors";
import {
  resolveStripeProviderAccountKey,
  stripeLivemodeConfigured,
} from "src/modules/contracts/payment/stripe-account-identity";
import {
  recordRoadLiabilityPaymentLedger,
  recordTrustedCollectionLedger,
} from "src/modules/finance/finance-ledger.service";
import {
  assertNoPendingRoadLiabilities,
  ensureReconciliationFinalizedInTx,
  ensureReconciliationShellInTx,
  finalizeReconciliationAndCloseInTx,
  recalculateReconciliationTotalsInTx,
  settleReconciliationWithoutPaymentInTx,
  settleRoadLiabilitiesForReconciliation,
} from "src/modules/contracts/contracts-reconciliation";
import {
  applyCombinedFinalSettlementInTx,
  applyLegacyReconciliationSettlementInTx,
  buildFinalSettlementAllocations,
  ensureFinalSettlementAllocationsForPayment,
} from "src/modules/contracts/contracts-final-settlement";
import { vehicleDisplayName } from "src/modules/vehicles/vehicles.mapper";
import Stripe from "stripe";
import { env } from "src/config/env";
import type { StripeWebhookEvent } from "@prisma/client";

export interface PaymentObligation {
  contractId: string;
  purpose: ContractPaymentPurpose;
  targetId: string;
  amount: number;
  currency: string;
}

export interface StartPaymentResult {
  payment: {
    id: string;
    status: ContractPaymentStatus;
    amount: number;
    currency: string;
    purpose: ContractPaymentPurpose;
    checkoutUrl: string | null;
    checkoutExpiresAt: Date | null;
  };
  statusToken: string | null;
  providerAvailable: boolean;
  alreadySettled?: boolean;
  noPaymentRequired?: boolean;
}

function paymentCallbackUrl(
  statusToken: string,
  outcome: "success" | "cancel",
  locale: PublicFrontendLocale = "en",
): string {
  return buildPublicFrontendUrl(normalizePublicLocale(locale), "/payment/callback", {
    statusToken,
    outcome,
  });
}

async function emitPayment(
  tx: Tx,
  eventType: string,
  contractId: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await writeOutboxEvent(tx, {
    eventType,
    aggregateType: "contract",
    aggregateId: contractId,
    dedupeKey: `${eventType}:${contractId}:${extra.dedupe ?? "v1"}`,
    payload: { contractId, ...extra, dedupe: undefined },
  });
}

async function loadObligation(
  tx: Tx,
  purpose: ContractPaymentPurpose,
  targetId: string,
): Promise<PaymentObligation> {
  switch (purpose) {
    case "RENTAL": {
      const contract = await tx.contract.findUnique({ where: { id: targetId } });
      if (!contract) throw contractError.notFound();
      assertPositiveAedAmount(contract.agreedAmount);
      assertAedCurrency(contract.currency);
      return {
        contractId: contract.id,
        purpose,
        targetId: contract.id,
        amount: contract.agreedAmount,
        currency: contract.currency,
      };
    }
    case "RENEWAL": {
      const renewal = await tx.contractRenewal.findUnique({ where: { id: targetId } });
      if (!renewal) throw contractError.notFound();
      const contract = await tx.contract.findUnique({ where: { id: renewal.contractId } });
      if (!contract) throw contractError.notFound();
      assertAedCurrency(contract.currency);
      if (renewal.additionalAmount <= 0) {
        return {
          contractId: renewal.contractId,
          purpose,
          targetId: renewal.id,
          amount: 0,
          currency: contract.currency,
        };
      }
      assertPositiveAedAmount(renewal.additionalAmount);
      return {
        contractId: renewal.contractId,
        purpose,
        targetId: renewal.id,
        amount: renewal.additionalAmount,
        currency: contract.currency,
      };
    }
    case "RECONCILIATION": {
      const reconciliation = await tx.contractReconciliation.findUnique({
        where: { id: targetId },
      });
      if (!reconciliation) throw contractError.notFound();
      const contract = await tx.contract.findUnique({ where: { id: reconciliation.contractId } });
      if (!contract) throw contractError.notFound();
      assertAedCurrency(contract.currency);
      const { settlementAmountDue } = await buildFinalSettlementAllocations(
        tx,
        reconciliation.id,
        reconciliation.contractId,
      );
      if (settlementAmountDue <= 0) {
        return {
          contractId: reconciliation.contractId,
          purpose,
          targetId: reconciliation.id,
          amount: 0,
          currency: contract.currency,
        };
      }
      assertPositiveAedAmount(settlementAmountDue);
      return {
        contractId: reconciliation.contractId,
        purpose,
        targetId: reconciliation.id,
        amount: settlementAmountDue,
        currency: contract.currency,
      };
    }
    case "POST_CLOSE_RECEIVABLE": {
      const receivable = await tx.contractPostCloseReceivable.findUnique({ where: { id: targetId } });
      if (!receivable) throw contractError.notFound();
      assertPositiveAedAmount(receivable.amount);
      assertAedCurrency(receivable.currency);
      return {
        contractId: receivable.contractId,
        purpose,
        targetId: receivable.id,
        amount: receivable.amount,
        currency: receivable.currency,
      };
    }
    case "ROAD_LIABILITY": {
      const charge = await tx.roadLiabilityCustomerCharge.findUnique({
        where: { id: targetId },
        include: { roadLiability: true },
      });
      if (!charge) throw contractError.notFound();
      if (charge.destinationType !== "DIRECT_COLLECTION") throw contractError.paymentNotAllowed();
      assertPositiveAedAmount(charge.customerChargeAmount);
      assertAedCurrency("AED");
      return {
        contractId: charge.contractId,
        purpose,
        targetId: charge.id,
        amount: charge.customerChargeAmount,
        currency: "AED",
      };
    }
    default:
      throw contractError.paymentNotAllowed();
  }
}

async function isObligationSettled(
  tx: Tx,
  purpose: ContractPaymentPurpose,
  targetId: string,
): Promise<boolean> {
  const confirmed = await tx.contractPayment.findFirst({
    where: { purpose, targetId, status: "CONFIRMED" },
  });
  if (confirmed) return true;

  if (purpose === "RECONCILIATION") {
    const reconciliation = await tx.contractReconciliation.findUnique({ where: { id: targetId } });
    return Boolean(reconciliation?.settledAt);
  }
  if (purpose === "POST_CLOSE_RECEIVABLE") {
    const receivable = await tx.contractPostCloseReceivable.findUnique({ where: { id: targetId } });
    return receivable?.status === "SETTLED";
  }
  if (purpose === "ROAD_LIABILITY") {
    const charge = await tx.roadLiabilityCustomerCharge.findUnique({
      where: { id: targetId },
      include: { roadLiability: true },
    });
    return charge?.roadLiability.collectionStatus === "SETTLED";
  }
  if (purpose === "RENEWAL") {
    const renewal = await tx.contractRenewal.findUnique({ where: { id: targetId } });
    if (!renewal) return false;
    if (renewal.additionalAmount <= 0) return Boolean(renewal.appliedAt);
    return Boolean(renewal.settledPaymentId);
  }
  return false;
}

function isCheckoutUsable(payment: ContractPayment): boolean {
  if (!ACTIVE_PAYMENT_STATUSES.includes(payment.status as (typeof ACTIVE_PAYMENT_STATUSES)[number])) {
    return false;
  }
  if (!payment.checkoutUrl) return false;
  if (payment.checkoutExpiresAt && payment.checkoutExpiresAt.getTime() <= Date.now()) return false;
  return true;
}

async function settleRoadLiabilityForPostClose(tx: Tx, receivableId: string): Promise<void> {
  const receivable = await tx.contractPostCloseReceivable.findUnique({
    where: { id: receivableId },
    select: { roadLiabilityId: true },
  });
  if (!receivable) return;
  await tx.roadLiability.update({
    where: { id: receivable.roadLiabilityId },
    data: { collectionStatus: "SETTLED" },
  });
}

/**
 * Applies an approved renewal to its Contract. Serialised with return
 * confirmation on the lifecycle lock (lock order: payment, then lifecycle) and
 * re-checks the Contract under it: a renewal never extends a Contract that has
 * left ACTIVE, e.g. a return confirmed while the renewal payment was in flight.
 * Returns false (nothing applied) in that case when `onIneligible` is "skip";
 * direct callers keep the default and get CONTRACT_INVALID_TRANSITION.
 */
async function applyRenewalExtensionInTx(
  tx: Tx,
  renewalId: string,
  onIneligible: "throw" | "skip" = "throw",
): Promise<boolean> {
  const renewal = await tx.contractRenewal.findUnique({ where: { id: renewalId } });
  if (!renewal) throw contractError.notFound();
  if (renewal.appliedAt) return true;

  await acquireAdvisoryLock(tx, CONTRACT_LIFECYCLE_LOCK_NS, renewal.contractId);
  const contract = await tx.contract.findUnique({ where: { id: renewal.contractId } });
  if (!contract) throw contractError.notFound();
  if (contract.status !== "ACTIVE") {
    if (onIneligible === "skip") return false;
    throw contractError.invalidTransition(contract.status, "ACTIVE");
  }
  await assertVehicleFreeForRental(tx, contract.vehicleId, contract.id);

  await tx.contractRenewal.update({
    where: { id: renewal.id },
    data: {
      approvedAt: renewal.approvedAt ?? new Date(),
      appliedAt: new Date(),
    },
  });
  await tx.contract.update({
    where: { id: contract.id },
    data: {
      rentalDays: contract.rentalDays + renewal.additionalDays,
      agreedAmount: contract.agreedAmount + renewal.additionalAmount,
      endAt: renewal.newEndAt,
      revision: { increment: 1 },
    },
  });
  await tx.contractLink.updateMany({
    where: {
      contractId: contract.id,
      type: "RENEWAL",
      usedAt: null,
      revokedAt: null,
    },
    data: { usedAt: new Date() },
  });
  await emitPayment(tx, "contract.renewed", contract.id, {
    additionalDays: renewal.additionalDays,
    renewalId: renewal.id,
    dedupe: renewal.id,
  });
  return true;
}

async function linkRenewalSettlementInTx(tx: Tx, renewalId: string, paymentId: string): Promise<void> {
  const renewal = await tx.contractRenewal.findUnique({ where: { id: renewalId } });
  if (!renewal) throw contractError.notFound();
  if (renewal.settledPaymentId) {
    if (renewal.settledPaymentId === paymentId) return;
    throw contractError.paymentAlreadySettled();
  }
  await tx.contractRenewal.update({
    where: { id: renewalId },
    data: { settledPaymentId: paymentId },
  });
}

async function settleRenewalFromPaymentInTx(
  tx: Tx,
  renewalId: string,
  paymentId: string,
  onIneligible: "throw" | "skip" = "skip",
): Promise<boolean> {
  const renewal = await tx.contractRenewal.findUnique({ where: { id: renewalId } });
  if (!renewal) throw contractError.notFound();
  if (!renewal.appliedAt) {
    const applied = await applyRenewalExtensionInTx(tx, renewalId, onIneligible);
    if (!applied) return false;
  }
  await linkRenewalSettlementInTx(tx, renewalId, paymentId);
  return true;
}

async function applyDomainSettlement(tx: Tx, payment: ContractPayment): Promise<void> {
  switch (payment.purpose) {
    case "RENTAL": {
      const contract = await tx.contract.findUnique({ where: { id: payment.contractId } });
      if (!contract) throw contractError.notFound();
      if (contract.status === "SIGNED") {
        assertTransition("SIGNED", "PAID");
        await assertVehicleFreeForRental(tx, contract.vehicleId, contract.id);
        await tx.contract.update({
          where: { id: contract.id },
          data: { status: "PAID", revision: { increment: 1 } },
        });
        await completeRentalLinks(tx, contract.id);
        await emitPayment(tx, "contract.paid", contract.id, { vehicleId: contract.vehicleId });
      }
      break;
    }
    case "RECONCILIATION": {
      const allocations = await tx.contractPaymentAllocation.findMany({
        where: { contractPaymentId: payment.id },
      });
      if (allocations.length > 0) {
        await applyCombinedFinalSettlementInTx(tx, payment);
      } else {
        await applyLegacyReconciliationSettlementInTx(tx, payment);
      }
      break;
    }
    case "POST_CLOSE_RECEIVABLE": {
      const receivable = await tx.contractPostCloseReceivable.findUnique({
        where: { id: payment.targetId },
      });
      if (!receivable) throw contractError.notFound();
      if (receivable.status !== "SETTLED") {
        await tx.contractPostCloseReceivable.update({
          where: { id: receivable.id },
          data: {
            status: "SETTLED",
            settledAt: new Date(),
            settledPaymentId: payment.id,
          },
        });
        await settleRoadLiabilityForPostClose(tx, receivable.id);
      }
      break;
    }
    case "ROAD_LIABILITY": {
      const charge = await tx.roadLiabilityCustomerCharge.findUnique({
        where: { id: payment.targetId },
        include: { roadLiability: true },
      });
      if (!charge) throw contractError.notFound();
      if (
        charge.operationalState === "PAID" &&
        charge.contractPaymentId &&
        charge.contractPaymentId !== payment.id
      ) {
        return;
      }
      if (charge.roadLiability.collectionStatus !== "SETTLED") {
        await tx.roadLiability.update({
          where: { id: charge.roadLiabilityId },
          data: { collectionStatus: "SETTLED" },
        });
      }
      const channel =
        payment.method === "CASH"
          ? "CASH"
          : payment.method === "MANUAL"
            ? "MANUAL"
            : payment.checkoutUrl
              ? "CHECKOUT"
              : "OFF_SESSION";
      await tx.roadLiabilityCustomerCharge.update({
        where: { id: charge.id },
        data: {
          operationalState: "PAID",
          settlementChannel: channel,
          contractPaymentId: payment.id,
        },
      });
      await tx.contractPaymentOffSessionAttempt.updateMany({
        where: {
          contractPaymentId: payment.id,
          status: { in: ["PREPARING", "PROCESSING", "REQUIRES_ACTION"] },
        },
        data: { status: "SUCCEEDED", completedAt: new Date() },
      });
      break;
    }
    case "RENEWAL": {
      const settled = await settleRenewalFromPaymentInTx(tx, payment.targetId, payment.id, "skip");
      if (!settled) {
        await emitPayment(tx, "contract.renewal_not_applied", payment.contractId, {
          paymentId: payment.id,
          renewalId: payment.targetId,
          amount: payment.amount,
          currency: payment.currency,
          dedupe: payment.id,
        });
      }
      break;
    }
    default:
      break;
  }
}

function verifyProviderAmount(
  payment: ContractPayment,
  amountMinor?: number,
  currency?: string,
): void {
  if (currency && currency !== payment.currency) {
    throw contractError.paymentAmountMismatch();
  }
  if (amountMinor != null) {
    const expected = aedToStripeMinorUnits(payment.amount);
    if (amountMinor !== expected) throw contractError.paymentAmountMismatch();
  }
}

async function markPaymentTerminal(
  tx: Tx,
  payment: ContractPayment,
  status: ContractPaymentStatus,
  providerStatus?: string,
): Promise<ContractPayment> {
  const data: Prisma.ContractPaymentUpdateInput = {
    status,
    providerStatus: providerStatus ?? status,
  };
  if (status === "CONFIRMED") data.confirmedAt = new Date();
  if (status === "FAILED" || status === "CANCELLED") data.failedAt = new Date();
  return tx.contractPayment.update({ where: { id: payment.id }, data });
}

const STRIPE_CHECKOUT_HOSTS = new Set(["checkout.stripe.com", "checkout.stripe.dev"]);

function assertTrustedCheckoutUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw contractError.paymentProviderNotConfigured();
  }
  if (parsed.protocol !== "https:" || !STRIPE_CHECKOUT_HOSTS.has(parsed.hostname)) {
    throw contractError.paymentProviderNotConfigured();
  }
}

export function createContractPaymentService(prisma: PrismaClient) {
  const provider = () => createPaymentProvider();
  const checkoutAttempts = createCheckoutAttemptService(prisma);

  async function reconcileSavedPaymentMethodAfterPayment(
    payment: ContractPayment,
    audit?: { ip?: string | null; userAgent?: string | null },
  ): Promise<void> {
    if (!payment.savePaymentMethodForFutureUse || !payment.providerReference) return;

    const already = await prisma.contractPaymentAuthorization.findUnique({
      where: { sourcePaymentId: payment.id },
    });
    if (already) return;

    const pm = await provider().getPaymentSessionPaymentMethod(payment.providerReference);
    if (!pm?.stripeCustomerId) return;

    const contract = await prisma.contract.findUnique({
      where: { id: payment.contractId },
      select: { customerId: true },
    });
    if (!contract?.customerId) return;

    const consentVersion = payment.futureUseConsentVersion;
    const consentLocale = payment.futureUseConsentLocale;
    if (!consentVersion || !consentLocale) return;
    const consent = getPaymentConsent(consentVersion, consentLocale as PublicFrontendLocale);
    if (!consent) return;

    if (!env.STRIPE_SECRET_KEY) return;
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    const providerAccountKey = await resolveStripeProviderAccountKey(stripe);
    const livemode = stripeLivemodeConfigured();
    const profileId =
      (await findProfileIdForCustomer(prisma, contract.customerId, providerAccountKey, livemode)) ??
      (await claimCustomerPaymentProfile(prisma, contract.customerId, stripe)).profileId;

    await withTransaction(prisma, async (tx) => {
      const methodId = await upsertCustomerPaymentMethod(tx, profileId, {
        stripeCustomerId: pm.stripeCustomerId!,
        stripePaymentMethodId: pm.stripePaymentMethodId,
        cardBrand: pm.cardBrand,
        cardLast4: pm.cardLast4,
      });
      await createContractPaymentAuthorization(tx, {
        contractId: payment.contractId,
        customerId: contract.customerId!,
        customerPaymentMethodId: methodId,
        sourcePaymentId: payment.id,
        consent,
        ip: audit?.ip,
        userAgent: audit?.userAgent,
      });
      await persistContractCardSnapshot(tx, {
        contractId: payment.contractId,
        stripeCustomerId: pm.stripeCustomerId,
        stripePaymentMethodId: pm.stripePaymentMethodId,
        cardBrand: pm.cardBrand,
        cardLast4: pm.cardLast4,
        futureUseConsentPaymentId: payment.id,
      });
    });
  }

  const LIABILITY_ALREADY_SETTLED_FAILURE = "LIABILITY_ALREADY_SETTLED";

  async function markRoadLiabilityLateProviderConflict(
    tx: Tx,
    payment: ContractPayment,
    winningPaymentId: string,
  ): Promise<void> {
    if (payment.status === "CONFIRMED" || payment.status === "FAILED") return;
    await markPaymentTerminal(
      tx,
      payment,
      "FAILED",
      "provider_collected_after_domain_settlement",
    );
    await tx.contractPaymentOffSessionAttempt.updateMany({
      where: {
        contractPaymentId: payment.id,
        status: { in: ["PREPARING", "PROCESSING", "REQUIRES_ACTION"] },
      },
      data: {
        status: "FAILED",
        failureCode: LIABILITY_ALREADY_SETTLED_FAILURE,
        completedAt: new Date(),
      },
    });
    await emitPayment(tx, "payment.provider_settlement_conflict", payment.contractId, {
      paymentId: payment.id,
      winningPaymentId,
      purpose: payment.purpose,
      targetId: payment.targetId,
      dedupe: `${payment.id}:provider_conflict`,
    });
  }

  async function resolveRoadLiabilityWinningPayment(
    tx: Tx,
    payment: ContractPayment,
  ): Promise<ContractPayment | null> {
    const existingConfirmed = await tx.contractPayment.findFirst({
      where: { purpose: "ROAD_LIABILITY", targetId: payment.targetId, status: "CONFIRMED" },
    });
    if (existingConfirmed && existingConfirmed.id !== payment.id) {
      return existingConfirmed;
    }
    const charge = await tx.roadLiabilityCustomerCharge.findUnique({
      where: { id: payment.targetId },
    });
    if (
      charge?.operationalState === "PAID" &&
      charge.contractPaymentId &&
      charge.contractPaymentId !== payment.id
    ) {
      return tx.contractPayment.findUnique({ where: { id: charge.contractPaymentId } });
    }
    return null;
  }

  async function confirmPaymentAttempt(
    tx: Tx,
    payment: ContractPayment,
    providerStatus?: string,
    amountMinor?: number,
    currency?: string,
  ): Promise<ContractPayment> {
    if (payment.status === "CONFIRMED") return payment;
    if (payment.providerReference) {
      verifyProviderAmount(payment, amountMinor, currency);
    }
    if (payment.purpose === "ROAD_LIABILITY") {
      const winning = await resolveRoadLiabilityWinningPayment(tx, payment);
      if (winning) {
        await markRoadLiabilityLateProviderConflict(tx, payment, winning.id);
        return winning;
      }
    }
    try {
      const updated = await markPaymentTerminal(tx, payment, "CONFIRMED", providerStatus);
      await applyDomainSettlement(tx, updated);
      if (payment.purpose === "ROAD_LIABILITY") {
        await recordRoadLiabilityPaymentLedger(tx, updated);
      } else if (payment.purpose === "RECONCILIATION") {
        const allocations = await tx.contractPaymentAllocation.findMany({
          where: { contractPaymentId: payment.id },
        });
        if (allocations.length === 0) {
          await recordTrustedCollectionLedger(tx, updated);
        }
      } else {
        await recordTrustedCollectionLedger(tx, updated);
      }
      await emitPayment(tx, "payment.confirmed", payment.contractId, {
        paymentId: payment.id,
        purpose: payment.purpose,
        contractId: payment.contractId,
        targetId: payment.targetId,
        amount: payment.amount,
        currency: payment.currency,
        dedupe: payment.id,
      });
      return updated;
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await tx.contractPayment.findFirst({
          where: { purpose: payment.purpose, targetId: payment.targetId, status: "CONFIRMED" },
        });
        if (existing) {
          if (payment.purpose === "ROAD_LIABILITY" && existing.id !== payment.id) {
            await markRoadLiabilityLateProviderConflict(tx, payment, existing.id);
          }
          return existing;
        }
      }
      throw error;
    }
  }

  async function applyProviderStatusInTransaction(
    tx: Tx,
    payment: ContractPayment,
    result: { status: ProviderPaymentStatus; providerStatus?: string; amountMinor?: number; currency?: string },
  ): Promise<ContractPayment> {
    if (payment.status === "CONFIRMED") return payment;
    if (result.status === "CONFIRMED") {
      if (payment.status === "CANCELLED" || payment.status === "FAILED") {
        const winner = await tx.contractPayment.findFirst({
          where: {
            purpose: payment.purpose,
            targetId: payment.targetId,
            status: "CONFIRMED",
            id: { not: payment.id },
          },
        });
        if (winner) return winner;
      }
      const confirmed = await confirmPaymentAttempt(
        tx,
        payment,
        result.providerStatus,
        result.amountMinor,
        result.currency,
      );
      await tx.contractPaymentAttempt.updateMany({
        where: {
          contractPaymentId: payment.id,
          status: { in: ["PREPARING", "RECOVERING", "READY"] },
        },
        data: { status: "COMPLETED" },
      });
      return confirmed;
    }
    if (result.status === "FAILED" || result.status === "CANCELLED" || result.status === "EXPIRED") {
      if (payment.status !== "PENDING" && payment.status !== "PROCESSING") return payment;
      const terminalStatus: ContractPaymentStatus =
        result.status === "EXPIRED" ? "CANCELLED" : result.status;
      const attemptStatus = result.status === "EXPIRED" ? "EXPIRED" : "FAILED";
      const updated = await markPaymentTerminal(tx, payment, terminalStatus, result.providerStatus);
      await tx.contractPaymentAttempt.updateMany({
        where: {
          contractPaymentId: payment.id,
          status: { in: ["PREPARING", "RECOVERING", "READY"] },
        },
        data: { status: attemptStatus },
      });
      await emitPayment(tx, "payment.failed", payment.contractId, {
        paymentId: payment.id,
        purpose: payment.purpose,
        status: terminalStatus,
        dedupe: payment.id,
      });
      return updated;
    }
    return payment;
  }

  /** Marks an abandoned hosted checkout as cancelled so the rental can retry safely. */
  async function abandonActiveRentalCheckout(contractId: string): Promise<boolean> {
    const payment = await prisma.contractPayment.findFirst({
      where: {
        contractId,
        purpose: "RENTAL",
        status: { in: ["PENDING", "PROCESSING"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!payment) return false;
    await withTransaction(prisma, async (tx) => {
      const current = await tx.contractPayment.findUnique({ where: { id: payment.id } });
      if (!current || (current.status !== "PENDING" && current.status !== "PROCESSING")) return;
      await markPaymentTerminal(tx, current, "CANCELLED", "checkout_abandoned");
      await tx.contractPaymentAttempt.updateMany({
        where: {
          contractPaymentId: current.id,
          status: { in: ["PREPARING", "RECOVERING", "READY"] },
        },
        data: { status: "EXPIRED" },
      });
      await emitPayment(tx, "payment.failed", contractId, {
        paymentId: current.id,
        purpose: current.purpose,
        status: "CANCELLED",
        dedupe: current.id,
      });
    });
    return true;
  }

  /** Bounded public-read reconciliation — skips terminal and cooldown-gated payments. */
  async function reconcilePaymentWithProviderIfNeeded(
    payment: ReconcileCandidate,
    audit?: { ip?: string | null; userAgent?: string | null },
  ): Promise<ContractPayment | null> {
    if (!shouldReconcilePaymentWithProvider(payment)) {
      return prisma.contractPayment.findUnique({ where: { id: payment.id } });
    }
    return reconcilePaymentWithProvider(payment.id, audit);
  }

  /** Provider reconciliation outside any DB transaction. */
  async function reconcilePaymentWithProvider(
    paymentId: string,
    audit?: { ip?: string | null; userAgent?: string | null },
  ): Promise<ContractPayment | null> {
    const payment = await prisma.contractPayment.findUnique({ where: { id: paymentId } });
    if (!payment?.providerReference) return payment;
    if (payment.status !== "PENDING" && payment.status !== "PROCESSING") return payment;

    markPaymentProviderReconciled(paymentId);
    const result = await provider().getPaymentStatus(payment.providerReference);
    if (result.status === "UNKNOWN") return payment;

    let updated: ContractPayment = payment;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        updated = await withTransaction(prisma, async (tx) => {
          const current = await tx.contractPayment.findUnique({ where: { id: paymentId } });
          if (!current) throw contractError.paymentAttemptNotFound();
          return applyProviderStatusInTransaction(tx, current, result);
        });
        break;
      } catch (error) {
        if (attempt === 0 && isUniqueViolation(error)) continue;
        throw error;
      }
    }

    if (updated.status === "CONFIRMED" && updated.savePaymentMethodForFutureUse) {
      await reconcileSavedPaymentMethodAfterPayment(updated, audit);
    }
    return updated;
  }

  async function applyProviderPaymentStatus(tx: Tx, paymentId: string): Promise<ContractPayment | null> {
    const payment = await tx.contractPayment.findUnique({ where: { id: paymentId } });
    return payment;
  }

  /**
   * Development-only provider signal. It deliberately creates a non-Stripe
   * payment attempt, resolves the obligation from the database, and then uses
   * the same settlement/domain transition as a verified Stripe confirmation.
   */
  async function simulateSuccessfulPayment(contractId: string): Promise<ContractPayment> {
    if (!devPaymentSimulationEnabled()) throw contractError.paymentProviderNotConfigured();
    return withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLock(tx, CONTRACT_PAYMENT_LOCK_NS, `RENTAL:${contractId}`);
      const contract = await tx.contract.findUnique({ where: { id: contractId } });
      if (!contract) throw contractError.notFound();
      if (contract.status === "PAID") {
        const existing = await tx.contractPayment.findFirst({ where: { contractId, purpose: "RENTAL", status: "CONFIRMED" }, orderBy: { createdAt: "desc" } });
        if (existing) return existing;
        throw contractError.paymentAlreadySettled();
      }
      if (contract.status !== "SIGNED") throw contractError.paymentNotAllowed();
      const active = await tx.contractPayment.findFirst({
        where: { purpose: "RENTAL", targetId: contractId, status: { in: ["PENDING", "PROCESSING"] } },
      });
      if (active) throw contractError.paymentAlreadyProcessing();
      const obligation = await loadObligation(tx, "RENTAL", contractId);
      if (await isObligationSettled(tx, obligation.purpose, obligation.targetId)) {
        const existing = await tx.contractPayment.findFirst({ where: { targetId: obligation.targetId, purpose: obligation.purpose, status: "CONFIRMED" }, orderBy: { createdAt: "desc" } });
        if (existing) return existing;
        throw contractError.paymentAlreadySettled();
      }
      const payment = await tx.contractPayment.create({
        data: {
          contractId: obligation.contractId,
          purpose: obligation.purpose,
          targetId: obligation.targetId,
          amount: obligation.amount,
          currency: obligation.currency,
          method: "CARD",
          status: "CONFIRMED",
          provider: "dev_simulation",
          providerStatus: "SIMULATED_CONFIRMED",
          confirmedAt: new Date(),
          processingStartedAt: new Date(),
        },
      });
      await applyDomainSettlement(tx, payment);
      await emitPayment(tx, "payment.confirmed", payment.contractId, {
        paymentId: payment.id,
        purpose: payment.purpose,
        contractId: payment.contractId,
        targetId: payment.targetId,
        amount: payment.amount,
        currency: payment.currency,
        provider: "dev_simulation",
        dedupe: payment.id,
      });
      return payment;
    });
  }

  async function startPayment(input: {
    purpose: ContractPaymentPurpose;
    targetId: string;
    createdByUserId?: number | null;
    locale?: PublicFrontendLocale;
    savePaymentMethodForFutureUse?: boolean;
    consentVersion?: string;
    /** Overrides the default payment-callback cancel URL (e.g. public rental payment step). */
    cancelUrl?: string;
    validate?: (tx: Tx, obligation: PaymentObligation) => Promise<void>;
    audit?: { ip?: string | null; userAgent?: string | null };
  }): Promise<StartPaymentResult> {
    const payProvider = provider();
    if (!payProvider.configured) throw contractError.paymentProviderNotConfigured();

    const consentLocale = normalizePublicLocale(input.locale);
    const saveForFutureUse = Boolean(input.savePaymentMethodForFutureUse);
    if (saveForFutureUse) {
      const version = input.consentVersion ?? PAYMENT_METHOD_AUTHORIZATION_VERSION;
      if (!getPaymentConsent(version, consentLocale)) {
        throw contractError.paymentConsentInvalid();
      }
    }
    const consentVersion = saveForFutureUse
      ? (input.consentVersion ?? PAYMENT_METHOD_AUTHORIZATION_VERSION)
      : null;

    let diamondCustomerId: number | null = null;
    if (saveForFutureUse && input.purpose === "RENTAL") {
      diamondCustomerId = await withTransaction(prisma, (tx) =>
        ensureContractCustomerForPayment(tx, input.targetId),
      );
    }

    let stripeCustomerId: string | null = null;
    let providerAccountKey: string | null = null;
    if (saveForFutureUse && diamondCustomerId) {
      if (!env.STRIPE_SECRET_KEY) throw contractError.paymentProviderNotConfigured();
      const stripe = new Stripe(env.STRIPE_SECRET_KEY);
      stripeCustomerId = await resolveStripeCustomerForPayment(stripe, prisma, diamondCustomerId);
      providerAccountKey = await resolveStripeProviderAccountKey(stripe);
    }

    type StripePhase = {
      kind: "stripe";
      obligation: PaymentObligation;
      payment: ContractPayment;
      attemptId: string;
      statusToken: string | null;
      savedPaymentMethod: {
        stripeCustomerId: string | null;
        stripePaymentMethodId: string;
      } | null;
    };

    const phase = await withTransaction(prisma, async (tx) => {
      const obligation = await loadObligation(tx, input.purpose, input.targetId);
      await acquireAdvisoryLock(tx, CONTRACT_PAYMENT_LOCK_NS, `${input.purpose}:${obligation.targetId}`);
      if (input.validate) await input.validate(tx, obligation);

      if (obligation.amount <= 0) {
        return {
          kind: "done" as const,
          result: {
            payment: {
              id: "",
              status: "CONFIRMED" as const,
              amount: 0,
              currency: obligation.currency,
              purpose: obligation.purpose,
              checkoutUrl: null,
              checkoutExpiresAt: null,
            },
            statusToken: null,
            providerAvailable: payProvider.configured,
            noPaymentRequired: true,
          },
        };
      }

      if (await isObligationSettled(tx, obligation.purpose, obligation.targetId)) {
        throw contractError.paymentAlreadySettled();
      }

      const active = await tx.contractPayment.findFirst({
        where: {
          purpose: obligation.purpose,
          targetId: obligation.targetId,
          status: { in: [...ACTIVE_PAYMENT_STATUSES] },
        },
        orderBy: { createdAt: "desc" },
      });
      const current = active ?? null;
      if (current?.status === "CONFIRMED") {
        return {
          kind: "done" as const,
          result: {
            payment: {
              id: current.id,
              status: current.status,
              amount: current.amount,
              currency: current.currency,
              purpose: current.purpose,
              checkoutUrl: null,
              checkoutExpiresAt: null,
            },
            statusToken: null,
            providerAvailable: true,
          },
        };
      }
      if (current && isCheckoutUsable(current)) {
        return {
          kind: "done" as const,
          result: {
            payment: {
              id: current.id,
              status: current.status,
              amount: current.amount,
              currency: current.currency,
              purpose: current.purpose,
              checkoutUrl: current.checkoutUrl,
              checkoutExpiresAt: current.checkoutExpiresAt,
            },
            statusToken: null,
            providerAvailable: true,
          },
        };
      }
      if (
        current &&
        (current.status === "PENDING" || current.status === "PROCESSING") &&
        !isCheckoutUsable(current) &&
        current.providerReference
      ) {
        return { kind: "reconcile" as const, paymentId: current.id };
      }

      const savedPaymentMethod =
        obligation.purpose === "RENTAL"
          ? await tx.contractCardPaymentMethod.findUnique({ where: { contractId: obligation.contractId } })
          : null;

      const reusePayment =
        current &&
        (current.status === "PENDING" || current.status === "PROCESSING") &&
        !isCheckoutUsable(current) &&
        !current.providerReference
          ? current
          : null;

      const payment = reusePayment
        ? current!
        : await tx.contractPayment.create({
            data: {
              contractId: obligation.contractId,
              purpose: obligation.purpose,
              targetId: obligation.targetId,
              amount: obligation.amount,
              currency: obligation.currency,
              method: "CARD",
              status: "PROCESSING",
              createdByUserId: input.createdByUserId ?? null,
              savePaymentMethodForFutureUse: saveForFutureUse,
              futureUseConsentAt: saveForFutureUse ? new Date() : null,
              futureUseConsentVersion: consentVersion,
              futureUseConsentLocale: saveForFutureUse ? consentLocale : null,
            },
          });

      if (obligation.purpose === "RECONCILIATION") {
        await ensureFinalSettlementAllocationsForPayment(tx, payment);
      }

      const contractCompany = await tx.contract.findUnique({
        where: { id: obligation.contractId },
        select: { company: { select: { code: true } } },
      });

      const snapshot: DesiredCheckoutSnapshot = {
        amount: obligation.amount,
        currency: obligation.currency,
        contractId: obligation.contractId,
        purpose: obligation.purpose,
        targetId: obligation.targetId,
        companyCode: contractCompany?.company.code ?? null,
        locale: consentLocale,
        savePaymentMethodForFutureUse: saveForFutureUse,
        consentVersion,
        cancelUrl: input.cancelUrl ?? "",
        stripeCustomerId,
        providerAccountKey,
      };

      const claim = await checkoutAttempts.claimCheckoutAttempt(tx, payment, snapshot);
      if (claim.kind === "ready") {
        const ready = claim.attempt;
        return {
          kind: "done" as const,
          result: {
            payment: {
              id: payment.id,
              status: payment.status,
              amount: payment.amount,
              currency: payment.currency,
              purpose: payment.purpose,
              checkoutUrl: ready.checkoutUrl,
              checkoutExpiresAt: ready.checkoutExpiresAt,
            },
            statusToken: null,
            providerAvailable: true,
          },
        };
      }

      return {
        kind: "stripe" as const,
        obligation,
        payment,
        attemptId: claim.attempt.id,
        statusToken: claim.statusToken,
        savedPaymentMethod:
          savedPaymentMethod && savedPaymentMethod.stripePaymentMethodId
            ? {
                stripeCustomerId: savedPaymentMethod.stripeCustomerId,
                stripePaymentMethodId: savedPaymentMethod.stripePaymentMethodId,
              }
            : null,
      };
    });

    if (phase.kind === "done") return phase.result;
    if (phase.kind === "reconcile") {
      const reconciled = await reconcilePaymentWithProvider(phase.paymentId, input.audit);
      if (reconciled?.status === "CONFIRMED") {
        return {
          payment: {
            id: reconciled.id,
            status: reconciled.status,
            amount: reconciled.amount,
            currency: reconciled.currency,
            purpose: reconciled.purpose,
            checkoutUrl: null,
            checkoutExpiresAt: null,
          },
          statusToken: null,
          providerAvailable: true,
          alreadySettled: true,
        };
      }
      if (reconciled && isCheckoutUsable(reconciled)) {
        return {
          payment: {
            id: reconciled.id,
            status: reconciled.status,
            amount: reconciled.amount,
            currency: reconciled.currency,
            purpose: reconciled.purpose,
            checkoutUrl: reconciled.checkoutUrl,
            checkoutExpiresAt: reconciled.checkoutExpiresAt,
          },
          statusToken: null,
          providerAvailable: true,
        };
      }
      throw contractError.paymentAlreadyProcessing();
    }

    const attemptRow = await prisma.contractPaymentAttempt.findUniqueOrThrow({
      where: { id: phase.attemptId },
    });

    let created;
    try {
      created = await payProvider.createCheckoutSession({
        checkoutAttemptId: attemptRow.id,
        idempotencyKey: attemptRow.idempotencyKey,
        paymentId: phase.payment.id,
        contractId: phase.obligation.contractId,
        purpose: phase.obligation.purpose,
        targetId: phase.obligation.targetId,
        amount: phase.obligation.amount,
        currency: phase.obligation.currency,
        companyCode: attemptRow.companyCode,
        successUrl: attemptRow.successUrl,
        cancelUrl: attemptRow.cancelUrl,
        savedPaymentMethod: phase.savedPaymentMethod,
        stripeCustomerId: attemptRow.stripeCustomerId,
        savePaymentMethodForFutureUse: attemptRow.savePaymentMethodForFutureUse,
      });
    } catch (error) {
      if (isStripeSdkError(error)) {
        await checkoutAttempts.recordAttemptFailure(phase.attemptId, stripeErrorCode(error));
      }
      throwMappedStripeCheckoutError(error);
    }

    if (!created.ok) throw contractError.paymentCheckoutPreparationFailed();
    assertTrustedCheckoutUrl(created.checkoutUrl);

    const persisted = await checkoutAttempts.persistStripeCheckoutResult(phase.attemptId, {
      provider: created.provider,
      providerReference: created.providerReference,
      providerStatus: created.providerStatus,
      checkoutUrl: created.checkoutUrl,
      checkoutExpiresAt: created.checkoutExpiresAt,
    });
    if (persisted.superseded) {
      await provider().expireCheckoutSession(created.providerReference);
      throw contractError.paymentAlreadySettled();
    }
    const updatedAttempt = persisted.attempt;

    return withTransaction(prisma, async (tx) => {
      const updated = await tx.contractPayment.findUniqueOrThrow({ where: { id: phase.payment.id } });

      await emitPayment(tx, "payment.started", phase.obligation.contractId, {
        paymentId: updated.id,
        dedupe: updated.id,
      });
      await emitPayment(tx, "payment.pending", phase.obligation.contractId, {
        paymentId: updated.id,
        dedupe: `${updated.id}:pending`,
      });

      return {
        payment: {
          id: updated.id,
          status: updated.status,
          amount: updated.amount,
          currency: updated.currency,
          purpose: updated.purpose,
          checkoutUrl: updatedAttempt.checkoutUrl,
          checkoutExpiresAt: updatedAttempt.checkoutExpiresAt,
        },
        statusToken: phase.statusToken,
        providerAvailable: true,
      };
    });
  }

  async function applyInboxPaymentEvent(row: StripeWebhookEvent): Promise<void> {
    if (!row.paymentId || !row.providerReference || !row.normalizedStatus) {
      throw new Error("INBOX_PAYMENT_INCOMPLETE");
    }
    const status = row.normalizedStatus as ProviderPaymentStatus;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const updated = await withTransaction(prisma, async (tx) => {
          const payment = await tx.contractPayment.findUnique({ where: { id: row.paymentId! } });
          if (!payment) throw contractError.paymentAttemptNotFound();
          if (payment.providerReference && payment.providerReference !== row.providerReference) {
            throw contractError.paymentProviderReferenceMismatch();
          }
          if (!payment.providerReference) {
            await tx.contractPayment.update({
              where: { id: payment.id },
              data: { providerReference: row.providerReference },
            });
          }
          return applyProviderStatusInTransaction(tx, payment, {
            status,
            providerStatus: status,
            amountMinor: row.amountMinor ?? undefined,
            currency: row.currency ?? undefined,
          });
        });
        if (updated.status === "CONFIRMED" && updated.savePaymentMethodForFutureUse) {
          await reconcileSavedPaymentMethodAfterPayment(updated);
        }
        return;
      } catch (error) {
        if (attempt === 0 && isUniqueViolation(error)) continue;
        const settled = await prisma.contractPayment.findUnique({ where: { id: row.paymentId } });
        if (settled?.status === "CONFIRMED") return;
        throw error;
      }
    }
  }

  async function applyInboxCardSetupEvent(row: StripeWebhookEvent): Promise<void> {
    if (!row.providerReference) throw new Error("INBOX_CARD_SETUP_INCOMPLETE");
    const result = await provider().getCardSetupSession(row.providerReference);
    if (result.status !== "CONFIRMED" || !result.contractId) return;
    if (
      !result.stripePaymentMethodId ||
      !result.cardBrand ||
      !result.cardLast4 ||
      !/^\d{4}$/.test(result.cardLast4)
    ) {
      return;
    }
    await withTransaction(prisma, async (tx) => {
      await persistContractCardSnapshot(tx, {
        contractId: result.contractId!,
        stripeCustomerId: result.stripeCustomerId ?? null,
        stripePaymentMethodId: result.stripePaymentMethodId!,
        cardBrand: result.cardBrand!,
        cardLast4: result.cardLast4!,
      });
    });
  }

  async function processCardSetupReturn(input: {
    contractId: string;
    providerReference: string;
  }): Promise<{
    status: Exclude<ProviderPaymentStatus, "PENDING">;
    cardLast4: string | null;
    cardBrand: string | null;
  }> {
    const result = await provider().getCardSetupSession(input.providerReference);
    if (result.contractId && result.contractId !== input.contractId) {
      throw contractError.paymentProviderReferenceMismatch();
    }
    if (result.status !== "CONFIRMED") {
      return {
        status: result.status === "PENDING" ? "PROCESSING" : result.status,
        cardLast4: null,
        cardBrand: null,
      };
    }
    if (
      !result.stripePaymentMethodId ||
      !result.cardBrand ||
      !result.cardLast4 ||
      !/^\d{4}$/.test(result.cardLast4)
    ) {
      throw contractError.paymentProviderReferenceMismatch();
    }
    const stripePaymentMethodId = result.stripePaymentMethodId;
    const cardBrand = result.cardBrand;
    const cardLast4 = result.cardLast4;
    await withTransaction(prisma, async (tx) => {
      await persistContractCardSnapshot(tx, {
        contractId: input.contractId,
        stripeCustomerId: result.stripeCustomerId ?? null,
        stripePaymentMethodId,
        cardBrand,
        cardLast4,
      });
    });
    return { status: "CONFIRMED", cardLast4, cardBrand };
  }

  async function getPaymentStatusByToken(statusToken: string) {
    const digest = hashToken(statusToken);
    const candidate = await prisma.contractPayment.findUnique({
      where: { statusTokenHash: digest },
    });
    if (!candidate) throw contractError.paymentStatusTokenInvalid();
    if (!candidate.statusTokenExpiresAt || candidate.statusTokenExpiresAt.getTime() <= Date.now()) {
      throw contractError.paymentStatusTokenExpired();
    }
    // Webhook is primary. This status read is the documented provider poll fallback
    // and must not treat the browser return URL itself as payment proof.
    if (candidate.status === "PENDING" || candidate.status === "PROCESSING") {
      try {
        await reconcilePaymentWithProviderIfNeeded(candidate);
      } catch {
        // A failed Stripe lookup must not block the status read.
      }
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await withTransaction(prisma, async (tx) => {
          const payment = await tx.contractPayment.findUnique({
            where: { statusTokenHash: digest },
          });
          if (!payment) throw contractError.paymentStatusTokenInvalid();
          if (!payment.statusTokenExpiresAt || payment.statusTokenExpiresAt.getTime() <= Date.now()) {
            throw contractError.paymentStatusTokenExpired();
          }
          const contract = await tx.contract.findUnique({
            where: { id: payment.contractId },
            include: {
              vehicle: { include: { model: { select: { name: true } } } },
              cardPaymentMethod: true,
              paymentAuthorization: true,
            },
          });
          const authorization =
            payment.status === "CONFIRMED"
              ? await tx.contractPaymentAuthorization.findUnique({
                  where: { sourcePaymentId: payment.id },
                })
              : null;
          return {
            status: payment.status,
            contractStatus: contract?.status ?? null,
            purpose: payment.purpose,
            checkoutUrl: payment.checkoutUrl,
            summary: contract
              ? {
                  contractNumber: contract.contractNumber,
                  vehicle: {
                    displayName: vehicleDisplayName({
                      vehicleName: contract.vehicle.vehicleName,
                      modelName: contract.vehicle.model?.name ?? null,
                      modelYear: contract.vehicle.modelYear,
                      plateNumber: contract.vehicle.plateNumber,
                    }),
                    plateNumber: contract.vehicle.plateNumber,
                  },
                  amount: payment.amount,
                  currency: payment.currency,
                  cardLast4: contract.cardPaymentMethod?.cardLast4 ?? null,
                  cardBrand: contract.cardPaymentMethod?.cardBrand ?? null,
                  paymentMethodSavedForFutureUse: Boolean(authorization),
                }
              : undefined,
          };
        });
      } catch (error) {
        if (attempt === 0 && isUniqueViolation(error)) continue;
        throw error;
      }
    }
    throw contractError.paymentStatusTokenInvalid();
  }

  async function applyZeroAmountSettlement(
    tx: Tx,
    purpose: ContractPaymentPurpose,
    targetId: string,
  ): Promise<void> {
    const obligation = await loadObligation(tx, purpose, targetId);
    if (obligation.amount > 0) throw contractError.paymentRequired();
    if (purpose === "RENEWAL") {
      await applyRenewalExtensionInTx(tx, targetId);
      return;
    }
    if (purpose === "RECONCILIATION") {
      const reconciliation = await tx.contractReconciliation.findUnique({ where: { id: targetId } });
      if (reconciliation && !reconciliation.settledAt) {
        await settleReconciliationWithoutPaymentInTx(tx, targetId);
        await finalizeReconciliationAndCloseInTx(tx, reconciliation.contractId);
      }
    }
  }

  async function settlePaymentFromProvider(
    paymentId: string,
    providerStatus?: string,
    amountMinor?: number,
    currency?: string,
  ): Promise<ContractPayment> {
    return withTransaction(prisma, async (tx) => {
      const payment = await tx.contractPayment.findUnique({ where: { id: paymentId } });
      if (!payment) throw contractError.paymentAttemptNotFound();
      return confirmPaymentAttempt(tx, payment, providerStatus, amountMinor, currency);
    });
  }

  /**
   * Cash rental settlement after legal signature. Server-derived amount only;
   * idempotent under concurrent retries via advisory lock + unique handling.
   */
  async function settleCashRentalInTx(
    tx: Tx,
    contractId: string,
    actorUserId?: number | null,
  ): Promise<ContractPayment> {
    await acquireAdvisoryLock(tx, CONTRACT_PAYMENT_LOCK_NS, `RENTAL:${contractId}`);
    const contract = await tx.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw contractError.notFound();
    if (contract.collectionMode !== "CASH") throw contractError.paymentNotAllowed();

    const existingConfirmed = await tx.contractPayment.findFirst({
      where: { contractId, purpose: "RENTAL", status: "CONFIRMED" },
      orderBy: { createdAt: "desc" },
    });
    if (existingConfirmed) return existingConfirmed;

    if (contract.status === "PAID") {
      throw contractError.paymentAlreadySettled();
    }
    if (contract.status !== "SIGNED") throw contractError.paymentNotAllowed();

    const obligation = await loadObligation(tx, "RENTAL", contractId);
    if (obligation.amount <= 0) throw contractError.paymentRequired();

    const active = await tx.contractPayment.findFirst({
      where: {
        purpose: "RENTAL",
        targetId: contractId,
        status: { in: ["PENDING", "PROCESSING"] },
      },
    });
    if (active) throw contractError.paymentAlreadyProcessing();

    try {
      const payment = await tx.contractPayment.create({
        data: {
          contractId: obligation.contractId,
          purpose: "RENTAL",
          targetId: obligation.targetId,
          amount: obligation.amount,
          currency: obligation.currency,
          method: "CASH",
          status: "PENDING",
          createdByUserId: actorUserId ?? null,
        },
      });
      return confirmPaymentAttempt(tx, payment);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await tx.contractPayment.findFirst({
          where: { contractId, purpose: "RENTAL", status: "CONFIRMED" },
          orderBy: { createdAt: "desc" },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async function confirmTrustedPaymentInTx(tx: Tx, paymentId: string): Promise<ContractPayment> {
    const payment = await tx.contractPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw contractError.paymentAttemptNotFound();
    return confirmPaymentAttempt(tx, payment);
  }

  async function neutralizeProviderCheckout(
    providerReference: string,
  ): Promise<"SAFE" | "ALREADY_PAID" | "BLOCKED"> {
    const payProvider = provider();
    if (!payProvider.configured) return "BLOCKED";
    const current = await payProvider.getPaymentStatus(providerReference);
    if (current.status === "CONFIRMED") return "ALREADY_PAID";
    if (current.status === "EXPIRED" || current.status === "CANCELLED" || current.status === "FAILED") {
      return "SAFE";
    }
    if (current.status === "UNKNOWN") return "BLOCKED";
    const expired = await payProvider.expireCheckoutSession(providerReference);
    if (expired.status === "EXPIRED") return "SAFE";
    if (expired.status === "CONFIRMED") return "ALREADY_PAID";
    return "BLOCKED";
  }

  /**
   * Expires payable reconciliation checkouts before cash settlement.
   * Stripe calls stay outside the cash transaction.
   */
  async function prepareReconciliationCashCollection(contractId: string): Promise<
    | { outcome: "already-settled" }
    | { outcome: "proceed"; neutralizedProviderReferences: string[] }
  > {
    const head = await prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        status: true,
        carIn: { select: { id: true } },
        reconciliation: { select: { id: true, settledAt: true } },
      },
    });
    if (!head) throw contractError.notFound();
    if (head.reconciliation?.settledAt || head.status === "CLOSED") {
      return { outcome: "already-settled" };
    }
    await withTransaction(prisma, async (tx) => {
      await ensureReconciliationShellInTx(tx, contractId);
    });
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: { carIn: true, reconciliation: true },
    });
    if (!contract) throw contractError.notFound();
    if (contract.reconciliation?.settledAt || contract.status === "CLOSED") {
      return { outcome: "already-settled" };
    }
    if (contract.status !== "REVIEW") throw contractError.paymentNotAllowed();
    if (!contract.carIn) throw contractError.carInRequired();
    if (!contract.reconciliation) throw contractError.reconciliationRequired();
    await assertNoPendingRoadLiabilities(prisma, contractId);
    const { settlementAmountDue } = await buildFinalSettlementAllocations(
      prisma,
      contract.reconciliation.id,
      contractId,
    );
    if (settlementAmountDue <= 0) throw contractError.paymentRequired();

    const active = await prisma.contractPayment.findMany({
      where: {
        purpose: "RECONCILIATION",
        targetId: contract.reconciliation.id,
        status: { in: ["PENDING", "PROCESSING"] },
      },
    });
    const neutralizedProviderReferences: string[] = [];
    for (const payment of active) {
      if (payment.method === "CASH" || !payment.providerReference) continue;
      const outcome = await neutralizeProviderCheckout(payment.providerReference);
      if (outcome === "ALREADY_PAID") {
        const reconciled = await reconcilePaymentWithProvider(payment.id);
        if (reconciled?.status === "CONFIRMED") return { outcome: "already-settled" };
        throw contractError.electronicCollectionActive();
      }
      if (outcome === "BLOCKED") throw contractError.electronicCollectionActive();
      neutralizedProviderReferences.push(payment.providerReference);
    }
    return { outcome: "proceed", neutralizedProviderReferences };
  }

  async function settleReconciliationCashInTx(
    tx: Tx,
    contractId: string,
    actorUserId: number,
    neutralizedProviderReferences: readonly string[] = [],
  ): Promise<ContractPayment> {
    await acquireAdvisoryLock(tx, CONTRACT_PAYMENT_LOCK_NS, `RECONCILIATION:${contractId}`);
    let contract = await tx.contract.findUnique({
      where: { id: contractId },
      include: { carIn: true, reconciliation: true },
    });
    if (!contract) throw contractError.notFound();
    if (!contract.carIn) throw contractError.carInRequired();

    if (contract.status === "CLOSED" || contract.reconciliation?.settledAt) {
      if (!contract.reconciliation) throw contractError.reconciliationRequired();
      await acquireAdvisoryLock(tx, CONTRACT_PAYMENT_LOCK_NS, `RECONCILIATION:${contract.reconciliation.id}`);
      const settledPayment = await tx.contractPayment.findFirst({
        where: { purpose: "RECONCILIATION", targetId: contract.reconciliation.id, status: "CONFIRMED" },
        orderBy: { createdAt: "desc" },
      });
      if (settledPayment) return settledPayment;
      throw contractError.paymentAlreadySettled();
    }

    await ensureReconciliationShellInTx(tx, contractId);
    contract = await tx.contract.findUnique({
      where: { id: contractId },
      include: { carIn: true, reconciliation: true },
    });
    if (!contract) throw contractError.notFound();
    if (!contract.reconciliation) throw contractError.reconciliationRequired();
    await acquireAdvisoryLock(tx, CONTRACT_PAYMENT_LOCK_NS, `RECONCILIATION:${contract.reconciliation.id}`);

    if (contract.status !== "REVIEW") throw contractError.paymentNotAllowed();

    await assertNoPendingRoadLiabilities(tx, contractId);
    await ensureReconciliationFinalizedInTx(tx, contractId, actorUserId);
    const reconciliation = await tx.contractReconciliation.findUniqueOrThrow({
      where: { contractId },
    });
    await recalculateReconciliationTotalsInTx(tx, reconciliation.id);
    const fresh = await tx.contractReconciliation.findUniqueOrThrow({ where: { contractId } });
    const { settlementAmountDue } = await buildFinalSettlementAllocations(
      tx,
      fresh.id,
      contractId,
    );
    if (settlementAmountDue <= 0) throw contractError.paymentRequired();

    await revokeReconciliationLinks(tx, contractId);

    const existingConfirmed = await tx.contractPayment.findFirst({
      where: { purpose: "RECONCILIATION", targetId: fresh.id, status: "CONFIRMED" },
      orderBy: { createdAt: "desc" },
    });
    if (existingConfirmed) return existingConfirmed;
    if (fresh.settledAt) throw contractError.paymentAlreadySettled();

    const activePayments = await tx.contractPayment.findMany({
      where: {
        purpose: "RECONCILIATION",
        targetId: fresh.id,
        status: { in: ["PENDING", "PROCESSING"] },
      },
    });
    const allowedRefs = new Set(neutralizedProviderReferences);
    const electronic = activePayments.filter((payment) => payment.method !== "CASH");
    for (const active of electronic) {
      if (active.providerReference) {
        if (!allowedRefs.has(active.providerReference)) throw contractError.electronicCollectionActive();
        continue;
      }
      const materializing = await tx.contractPaymentAttempt.findFirst({
        where: {
          contractPaymentId: active.id,
          status: { in: ["PREPARING", "RECOVERING"] },
        },
        select: { id: true },
      });
      if (materializing) throw contractError.electronicCollectionActive();
    }
    for (const active of electronic) {
      await markPaymentTerminal(tx, active, "CANCELLED", "replaced_by_cash");
      await tx.contractPaymentAttempt.updateMany({
        where: {
          contractPaymentId: active.id,
          status: { in: ["PREPARING", "RECOVERING", "READY"] },
        },
        data: { status: "EXPIRED" },
      });
    }

    const cashActive = activePayments.find((payment) => payment.method === "CASH");
    if (cashActive) {
      await ensureFinalSettlementAllocationsForPayment(tx, cashActive);
      return confirmPaymentAttempt(tx, cashActive);
    }

    const obligation = await loadObligation(tx, "RECONCILIATION", fresh.id);
    if (obligation.amount <= 0) throw contractError.paymentRequired();

    try {
      const payment = await tx.contractPayment.create({
        data: {
          contractId: obligation.contractId,
          purpose: "RECONCILIATION",
          targetId: obligation.targetId,
          amount: obligation.amount,
          currency: obligation.currency,
          method: "CASH",
          status: "PENDING",
          createdByUserId: actorUserId,
        },
      });
      await ensureFinalSettlementAllocationsForPayment(tx, payment);
      return confirmPaymentAttempt(tx, payment);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await tx.contractPayment.findFirst({
          where: { purpose: "RECONCILIATION", targetId: fresh.id, status: "CONFIRMED" },
          orderBy: { createdAt: "desc" },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async function settleCashRental(
    contractId: string,
    actorUserId?: number | null,
  ): Promise<ContractPayment> {
    return withTransaction(prisma, (tx) => settleCashRentalInTx(tx, contractId, actorUserId));
  }

  async function prepareOfficeRenewalRegistration(contractId: string): Promise<void> {
    const unapplied = await prisma.contractRenewal.findMany({
      where: { contractId, appliedAt: null },
      select: { id: true },
    });
    for (const renewal of unapplied) {
      const active = await prisma.contractPayment.findMany({
        where: {
          purpose: "RENEWAL",
          targetId: renewal.id,
          status: { in: ["PENDING", "PROCESSING"] },
        },
      });
      for (const payment of active) {
        if (payment.method === "CASH" || !payment.providerReference) {
          await withTransaction(prisma, async (tx) => {
            const fresh = await tx.contractPayment.findUnique({ where: { id: payment.id } });
            if (fresh && (fresh.status === "PENDING" || fresh.status === "PROCESSING")) {
              await markPaymentTerminal(tx, fresh, "CANCELLED", "superseded_by_office_renewal");
            }
          });
          continue;
        }
        const outcome = await neutralizeProviderCheckout(payment.providerReference);
        if (outcome === "ALREADY_PAID") {
          const reconciled = await reconcilePaymentWithProvider(payment.id);
          if (reconciled?.status === "CONFIRMED") {
            throw contractError.paymentAlreadySettled();
          }
          throw contractError.electronicRenewalCollectionActive();
        }
        if (outcome === "BLOCKED") throw contractError.electronicRenewalCollectionActive();
        await withTransaction(prisma, async (tx) => {
          const fresh = await tx.contractPayment.findUnique({ where: { id: payment.id } });
          if (fresh && (fresh.status === "PENDING" || fresh.status === "PROCESSING")) {
            await markPaymentTerminal(tx, fresh, "CANCELLED", "superseded_by_office_renewal");
          }
        });
      }
    }
  }

  async function settleRenewalCashInTx(
    tx: Tx,
    contractId: string,
    renewalId: string,
    actorUserId: number,
  ): Promise<ContractPayment> {
    const { renewalCollectableStatuses } = await import("../contracts-renewal-collection");
    await acquireAdvisoryLock(tx, CONTRACT_PAYMENT_LOCK_NS, `RENEWAL:${renewalId}`);
    const renewal = await tx.contractRenewal.findUnique({ where: { id: renewalId } });
    if (!renewal || renewal.contractId !== contractId) throw contractError.notFound();
    if (renewal.additionalAmount <= 0) throw contractError.paymentNotAllowed();
    if (!renewal.appliedAt) throw contractError.paymentNotAllowed();
    if (renewal.settledPaymentId) {
      const settled = await tx.contractPayment.findUnique({ where: { id: renewal.settledPaymentId } });
      if (settled) return settled;
      throw contractError.paymentAlreadySettled();
    }

    const contract = await tx.contract.findUnique({ where: { id: contractId }, select: { status: true } });
    if (contract?.status === "REVIEW") {
      throw contractError.renewalIncludedInFinalSettlement();
    }
    if (!contract || !renewalCollectableStatuses().includes(contract.status)) {
      throw contractError.paymentNotAllowed();
    }

    const existingConfirmed = await tx.contractPayment.findFirst({
      where: { purpose: "RENEWAL", targetId: renewalId, status: "CONFIRMED" },
    });
    if (existingConfirmed) {
      await linkRenewalSettlementInTx(tx, renewalId, existingConfirmed.id);
      return existingConfirmed;
    }

    const active = await tx.contractPayment.findFirst({
      where: {
        purpose: "RENEWAL",
        targetId: renewalId,
        status: { in: ["PENDING", "PROCESSING"] },
      },
    });
    if (active?.method === "CASH") {
      return confirmPaymentAttempt(tx, active);
    }
    if (active) throw contractError.paymentAlreadyProcessing();

    const obligation = await loadObligation(tx, "RENEWAL", renewalId);
    try {
      const payment = await tx.contractPayment.create({
        data: {
          contractId: obligation.contractId,
          purpose: "RENEWAL",
          targetId: renewalId,
          amount: obligation.amount,
          currency: obligation.currency,
          method: "CASH",
          status: "PENDING",
          createdByUserId: actorUserId,
        },
      });
      return confirmPaymentAttempt(tx, payment);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await tx.contractPayment.findFirst({
          where: { purpose: "RENEWAL", targetId: renewalId, status: "CONFIRMED" },
        });
        if (existing) {
          await linkRenewalSettlementInTx(tx, renewalId, existing.id);
          return existing;
        }
      }
      throw error;
    }
  }

  async function settleRenewalCash(
    contractId: string,
    renewalId: string,
    actorUserId: number,
  ): Promise<ContractPayment> {
    return withTransaction(prisma, (tx) => settleRenewalCashInTx(tx, contractId, renewalId, actorUserId));
  }

  return {
    startPayment,
    applyProviderPaymentStatus,
    reconcilePaymentWithProvider,
    reconcilePaymentWithProviderIfNeeded,
    abandonActiveRentalCheckout,
    simulateSuccessfulPayment,
    applyInboxPaymentEvent,
    applyInboxCardSetupEvent,
    processCardSetupReturn,
    getPaymentStatusByToken,
    loadObligation,
    isObligationSettled,
    applyZeroAmountSettlement,
    applyRenewalExtensionInTx,
    prepareOfficeRenewalRegistration,
    settleRenewalCash,
    settleRenewalCashInTx,
    settlePaymentFromProvider,
    settleCashRental,
    settleCashRentalInTx,
    prepareReconciliationCashCollection,
    settleReconciliationCashInTx,
    confirmTrustedPaymentInTx,
  };
}
