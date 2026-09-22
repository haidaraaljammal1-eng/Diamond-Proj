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
import { PAYMENT_METHOD_AUTHORIZATION_VERSION } from "src/modules/contracts/payment/payment-consent.constants";
import type { ProviderPaymentStatus } from "src/modules/contracts/payment/payment-provider.types";
import { ensureContractCustomerForPayment } from "src/modules/contracts/contract-customer-materialization";
import {
  findStripeCustomerId,
  resolveStripeCustomerForPayment,
} from "src/modules/contracts/payment/stripe-customer.service";
import { recordStripePaymentLedger } from "src/modules/finance/finance-ledger.service";
import { vehicleDisplayName } from "src/modules/vehicles/vehicles.mapper";
import Stripe from "stripe";
import { env } from "src/config/env";

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
  await emitPayment(tx, "contract.renewed", contract.id, { additionalDays: renewal.additionalDays });
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

async function persistCardPaymentMethod(
  tx: Tx,
  input: {
    contractId: string;
    stripeCustomerId?: string | null;
    stripePaymentMethodId: string;
    cardBrand: string;
    cardLast4: string;
    futureUseConsentPaymentId?: string | null;
  },
): Promise<void> {
  const contract = await tx.contract.findUnique({ where: { id: input.contractId } });
  if (!contract) throw contractError.notFound();
  await tx.contractCardPaymentMethod.upsert({
    where: { contractId: input.contractId },
    create: {
      contractId: input.contractId,
      provider: "stripe",
      stripeCustomerId: input.stripeCustomerId ?? null,
      stripePaymentMethodId: input.stripePaymentMethodId,
      cardBrand: input.cardBrand,
      cardLast4: input.cardLast4,
    },
    update: {
      provider: "stripe",
      stripeCustomerId: input.stripeCustomerId ?? null,
      stripePaymentMethodId: input.stripePaymentMethodId,
      cardBrand: input.cardBrand,
      cardLast4: input.cardLast4,
      ...(input.futureUseConsentPaymentId
        ? {
            futureUseConsentPaymentId: input.futureUseConsentPaymentId,
            futureUseAuthorizedAt: new Date(),
          }
        : {}),
    },
  });
  await tx.officialContractReviewDraft.upsert({
    where: { contractId: input.contractId },
    create: { contractId: input.contractId, cardNumberLast4: input.cardLast4, reviewedAt: new Date() },
    update: { cardNumberLast4: input.cardLast4, reviewedAt: new Date(), revision: { increment: 1 } },
  });
}

export function createContractPaymentService(prisma: PrismaClient) {
  const provider = () => createPaymentProvider();

  async function reconcileSavedPaymentMethodAfterPayment(
    tx: Tx,
    payment: ContractPayment,
  ): Promise<void> {
    if (!payment.savePaymentMethodForFutureUse || !payment.providerReference) return;
    const existing = await tx.contractCardPaymentMethod.findUnique({
      where: { contractId: payment.contractId },
    });
    if (
      existing?.futureUseConsentPaymentId === payment.id &&
      existing.stripePaymentMethodId
    ) {
      return;
    }
    const pm = await provider().getPaymentSessionPaymentMethod(payment.providerReference);
    if (!pm) return;
    await persistCardPaymentMethod(tx, {
      contractId: payment.contractId,
      stripeCustomerId: pm.stripeCustomerId ?? null,
      stripePaymentMethodId: pm.stripePaymentMethodId,
      cardBrand: pm.cardBrand,
      cardLast4: pm.cardLast4,
      futureUseConsentPaymentId: payment.id,
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
      await reconcileSavedPaymentMethodAfterPayment(tx, updated);
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

  async function applyProviderPaymentStatus(tx: Tx, paymentId: string): Promise<ContractPayment | null> {
    const payment = await tx.contractPayment.findUnique({ where: { id: paymentId } });
    if (!payment?.providerReference) return payment;
    if (payment.status !== "PENDING" && payment.status !== "PROCESSING") return payment;

    const result = await provider().getPaymentStatus(payment.providerReference);
    if (result.status === "UNKNOWN") return payment;

    if (result.status === "CONFIRMED") {
      return confirmPaymentAttempt(
        tx,
        payment,
        result.providerStatus,
        result.amountMinor,
        result.currency,
      );
    }

    if (result.status === "FAILED" || result.status === "CANCELLED" || result.status === "EXPIRED") {
      const terminalStatus: ContractPaymentStatus =
        result.status === "EXPIRED" ? "CANCELLED" : result.status;
      const updated = await markPaymentTerminal(tx, payment, terminalStatus, result.providerStatus);
      await emitPayment(tx, "payment.failed", payment.contractId, {
        paymentId: payment.id,
        status: terminalStatus,
        dedupe: payment.id,
      });
      return updated;
    }

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
    /** Overrides the default payment-callback cancel URL (e.g. public rental payment step). */
    cancelUrl?: string;
    validate?: (tx: Tx, obligation: PaymentObligation) => Promise<void>;
  }): Promise<StartPaymentResult> {
    const payProvider = provider();
    if (!payProvider.configured) throw contractError.paymentProviderNotConfigured();

    type CheckoutClaim = {
      paymentId: string;
      obligation: PaymentObligation;
      statusToken: string;
      saveForFutureUse: boolean;
      diamondCustomerId: number | null;
      stripeCustomerId: string | null;
      savedPaymentMethod: {
        stripeCustomerId: string | null;
        stripePaymentMethodId: string;
      } | null;
      companyCode: string | null;
      cancelUrl?: string;
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
      // Reuse a still-valid Checkout URL without a provider round-trip.
      const current = active
        ? isCheckoutUsable(active)
          ? active
          : (await applyProviderPaymentStatus(tx, active.id)) ?? active
        : null;
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
      if (current && (current.status === "PENDING" || current.status === "PROCESSING") && !isCheckoutUsable(current)) {
        throw contractError.paymentAlreadyProcessing();
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

      const statusToken = generateOpaqueToken(32);
      const savedPaymentMethod =
        obligation.purpose === "RENTAL"
          ? await tx.contractCardPaymentMethod.findUnique({ where: { contractId: obligation.contractId } })
          : null;
      const consentLocale = normalizePublicLocale(input.locale);
      const saveForFutureUse = Boolean(input.savePaymentMethodForFutureUse);
      let diamondCustomerId: number | null = null;
      let stripeCustomerId: string | null = null;
      if (obligation.purpose === "RENTAL") {
        const contractRow = await tx.contract.findUnique({
          where: { id: obligation.contractId },
          select: { customerId: true },
        });
        diamondCustomerId = contractRow?.customerId ?? null;
        if (saveForFutureUse) {
          diamondCustomerId = await ensureContractCustomerForPayment(tx, obligation.contractId);
          stripeCustomerId = await findStripeCustomerId(tx, diamondCustomerId);
        } else if (diamondCustomerId) {
          stripeCustomerId =
            (await findStripeCustomerId(tx, diamondCustomerId)) ??
            savedPaymentMethod?.stripeCustomerId ??
            null;
        }
      }

      const payment = await tx.contractPayment.create({
        data: {
          contractId: obligation.contractId,
          purpose: obligation.purpose,
          targetId: obligation.targetId,
          amount: obligation.amount,
          currency: obligation.currency,
          method: "CARD",
          status: "PROCESSING",
          createdByUserId: input.createdByUserId ?? null,
          statusTokenHash: hashToken(statusToken),
          statusTokenExpiresAt: expiryFromNow(PAYMENT_STATUS_TOKEN_TTL_SECONDS),
          savePaymentMethodForFutureUse: saveForFutureUse,
          futureUseConsentAt: saveForFutureUse ? new Date() : null,
          futureUseConsentVersion: saveForFutureUse ? PAYMENT_METHOD_AUTHORIZATION_VERSION : null,
          futureUseConsentLocale: saveForFutureUse ? consentLocale : null,
        },
      });

      const contractCompany = await tx.contract.findUnique({
        where: { id: obligation.contractId },
        select: { company: { select: { code: true } } },
      });

      const claim: CheckoutClaim = {
        paymentId: payment.id,
        obligation,
        statusToken,
        saveForFutureUse,
        diamondCustomerId,
        stripeCustomerId,
        savedPaymentMethod:
          savedPaymentMethod && savedPaymentMethod.stripePaymentMethodId
            ? {
                stripeCustomerId: savedPaymentMethod.stripeCustomerId,
                stripePaymentMethodId: savedPaymentMethod.stripePaymentMethodId,
              }
            : null,
        companyCode: contractCompany?.company.code ?? null,
        cancelUrl: input.cancelUrl,
      };
      return { kind: "checkout" as const, claim };
    });

    if (phase.kind === "done") return phase.result;

    let stripeCustomerId = phase.claim.stripeCustomerId;
    if (phase.claim.saveForFutureUse && phase.claim.diamondCustomerId) {
      if (!env.STRIPE_SECRET_KEY) throw contractError.paymentProviderNotConfigured();
      const stripe = new Stripe(env.STRIPE_SECRET_KEY);
      stripeCustomerId = await resolveStripeCustomerForPayment(
        stripe,
        prisma,
        phase.claim.diamondCustomerId,
        stripeCustomerId,
      );
    }

    const created = await payProvider.createCheckoutSession({
      paymentId: phase.claim.paymentId,
      contractId: phase.claim.obligation.contractId,
      purpose: phase.claim.obligation.purpose,
      targetId: phase.claim.obligation.targetId,
      amount: phase.claim.obligation.amount,
      currency: phase.claim.obligation.currency,
      companyCode: phase.claim.companyCode,
      successUrl: paymentCallbackUrl(phase.claim.statusToken, "success", input.locale),
      cancelUrl:
        phase.claim.cancelUrl ??
        paymentCallbackUrl(phase.claim.statusToken, "cancel", input.locale),
      savedPaymentMethod: phase.claim.savedPaymentMethod,
      stripeCustomerId,
      savePaymentMethodForFutureUse: phase.claim.saveForFutureUse,
    });
    if (!created.ok) throw contractError.paymentProviderNotConfigured();

    return withTransaction(prisma, async (tx) => {
      const updated = await tx.contractPayment.update({
        where: { id: phase.claim.paymentId },
        data: {
          provider: created.provider,
          providerReference: created.providerReference,
          providerStatus: created.providerStatus,
          checkoutUrl: created.checkoutUrl,
          checkoutExpiresAt: created.checkoutExpiresAt,
          processingStartedAt: new Date(),
        },
      });

      await emitPayment(tx, "payment.started", phase.claim.obligation.contractId, {
        paymentId: updated.id,
        dedupe: updated.id,
      });
      await emitPayment(tx, "payment.pending", phase.claim.obligation.contractId, {
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
          checkoutUrl: updated.checkoutUrl,
          checkoutExpiresAt: updated.checkoutExpiresAt,
        },
        statusToken: phase.claim.statusToken,
        providerAvailable: true,
      };
    });
  }

  async function processWebhookEvent(
    stripeEventId: string,
    eventType: string,
    paymentId: string,
    providerReference: string,
    status: ProviderPaymentStatus,
    amountMinor?: number,
    currency?: string,
  ): Promise<"processed" | "duplicate" | "ignored"> {
    try {
      await prisma.stripeWebhookEvent.create({
        data: { stripeEventId, eventType, outcome: "received" },
      });
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }

    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await withTransaction(prisma, async (tx) => {
            const payment = await tx.contractPayment.findUnique({ where: { id: paymentId } });
            if (!payment) throw contractError.paymentAttemptNotFound();
            if (payment.providerReference && payment.providerReference !== providerReference) {
              throw contractError.paymentProviderReferenceMismatch();
            }

            if (status === "CONFIRMED") {
              await confirmPaymentAttempt(tx, payment, "CONFIRMED", amountMinor, currency);
            } else if (status === "FAILED" || status === "CANCELLED" || status === "EXPIRED") {
              if (payment.status === "PENDING" || payment.status === "PROCESSING") {
                const terminalStatus: ContractPaymentStatus =
                  status === "EXPIRED" ? "CANCELLED" : status;
                await markPaymentTerminal(tx, payment, terminalStatus, status);
                await emitPayment(tx, "payment.failed", payment.contractId, {
                  paymentId: payment.id,
                  status: terminalStatus,
                  dedupe: payment.id,
                });
              }
            }

            await tx.stripeWebhookEvent.update({
              where: { stripeEventId },
              data: { processedAt: new Date(), outcome: "processed" },
            });
          });
          return "processed";
        } catch (error) {
          if (attempt === 0 && isUniqueViolation(error)) continue;
          throw error;
        }
      }
      return "processed";
    } catch (error) {
      const settled = await prisma.contractPayment.findUnique({ where: { id: paymentId } });
      if (settled?.status === "CONFIRMED" || isUniqueViolation(error)) {
        await prisma.stripeWebhookEvent.update({
          where: { stripeEventId },
          data: { processedAt: new Date(), outcome: "duplicate" },
        });
        return "duplicate";
      }
      await prisma.stripeWebhookEvent.update({
        where: { stripeEventId },
        data: {
          processedAt: new Date(),
          outcome: "error",
          error: error instanceof Error ? error.message : "unknown",
        },
      });
      throw error;
    }
  }

  async function processCardSetupWebhook(input: {
    stripeEventId: string;
    eventType: string;
    providerReference: string;
    contractId: string;
    stripeCustomerId?: string;
    stripePaymentMethodId: string;
    cardBrand: string;
    cardLast4: string;
  }): Promise<"processed" | "duplicate"> {
    try {
      await prisma.stripeWebhookEvent.create({
        data: { stripeEventId: input.stripeEventId, eventType: input.eventType, outcome: "received" },
      });
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
    await withTransaction(prisma, async (tx) => {
      await persistCardPaymentMethod(tx, input);
      await tx.stripeWebhookEvent.update({
        where: { stripeEventId: input.stripeEventId },
        data: { processedAt: new Date(), outcome: "processed" },
      });
    });
    return "processed";
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
      await persistCardPaymentMethod(tx, {
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
          const updated = (await applyProviderPaymentStatus(tx, payment.id)) ?? payment;
          const contract = await tx.contract.findUnique({
            where: { id: updated.contractId },
            include: {
              vehicle: { include: { model: { select: { name: true } } } },
              cardPaymentMethod: true,
            },
          });
          return {
            status: updated.status,
            contractStatus: contract?.status ?? null,
            purpose: updated.purpose,
            checkoutUrl: updated.checkoutUrl,
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
                  amount: updated.amount,
                  currency: updated.currency,
                  cardLast4: contract.cardPaymentMethod?.cardLast4 ?? null,
                  cardBrand: contract.cardPaymentMethod?.cardBrand ?? null,
                  paymentMethodSavedForFutureUse: Boolean(
                    updated.savePaymentMethodForFutureUse &&
                    updated.status === "CONFIRMED" &&
                    contract.cardPaymentMethod?.futureUseConsentPaymentId === updated.id,
                  ),
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
    simulateSuccessfulPayment,
    processWebhookEvent,
    processCardSetupWebhook,
    processCardSetupReturn,
    getPaymentStatusByToken,
    loadObligation,
    isObligationSettled,
    applyZeroAmountSettlement,
    applyRenewal,
  };
}
