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
import { completeRentalLinks } from "src/modules/contracts/contracts-links";
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
import { recordStripePaymentLedger } from "src/modules/finance/finance-ledger.service";
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
      if (reconciliation.finalAmount <= 0) {
        return {
          contractId: reconciliation.contractId,
          purpose,
          targetId: reconciliation.id,
          amount: 0,
          currency: contract.currency,
        };
      }
      assertPositiveAedAmount(reconciliation.finalAmount);
      return {
        contractId: reconciliation.contractId,
        purpose,
        targetId: reconciliation.id,
        amount: reconciliation.finalAmount,
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
  if (purpose === "RENEWAL") {
    const renewal = await tx.contractRenewal.findUnique({ where: { id: targetId } });
    return Boolean(renewal?.appliedAt);
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

async function settleRoadLiabilitiesForReconciliation(tx: Tx, reconciliationId: string): Promise<void> {
  const lines = await tx.contractReconciliationLine.findMany({
    where: { reconciliationId, roadLiabilityId: { not: null } },
    select: { roadLiabilityId: true },
  });
  const ids = lines.map((line) => line.roadLiabilityId).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return;
  await tx.roadLiability.updateMany({
    where: { id: { in: ids } },
    data: { collectionStatus: "SETTLED" },
  });
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
async function applyRenewal(
  tx: Tx,
  renewalId: string,
  paymentId?: string | null,
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
      ...(paymentId ? { settledPaymentId: paymentId } : {}),
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
      const reconciliation = await tx.contractReconciliation.findUnique({
        where: { id: payment.targetId },
      });
      if (!reconciliation) throw contractError.notFound();
      if (!reconciliation.settledAt) {
        await tx.contractReconciliation.update({
          where: { id: reconciliation.id },
          data: { settledAt: new Date(), settledPaymentId: payment.id },
        });
        await settleRoadLiabilitiesForReconciliation(tx, reconciliation.id);
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
    case "RENEWAL": {
      // The provider already captured the money, so the payment itself stays
      // CONFIRMED; only the extension is withheld and staff are told to settle it.
      const applied = await applyRenewal(tx, payment.targetId, payment.id, "skip");
      if (!applied) {
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
    try {
      const updated = await markPaymentTerminal(tx, payment, "CONFIRMED", providerStatus);
      await applyDomainSettlement(tx, updated);
      await recordStripePaymentLedger(tx, updated);
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
        if (existing) return existing;
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

    const updatedAttempt = await checkoutAttempts.persistStripeCheckoutResult(phase.attemptId, {
      provider: created.provider,
      providerReference: created.providerReference,
      providerStatus: created.providerStatus,
      checkoutUrl: created.checkoutUrl,
      checkoutExpiresAt: created.checkoutExpiresAt,
    });

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
      await applyRenewal(tx, targetId, null);
      return;
    }
    if (purpose === "RECONCILIATION") {
      const reconciliation = await tx.contractReconciliation.findUnique({ where: { id: targetId } });
      if (reconciliation && !reconciliation.settledAt) {
        await tx.contractReconciliation.update({
          where: { id: targetId },
          data: { settledAt: new Date() },
        });
      }
    }
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
    applyRenewal,
  };
}
