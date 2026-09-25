import { randomUUID } from "node:crypto";
import type { ContractPayment, ContractPaymentAttempt, PrismaClient } from "@prisma/client";
import type { PublicFrontendLocale } from "src/lib/http/public-frontend-url";
import { withTransaction, type Tx } from "src/lib/db/transaction";
import { expiryFromNow, generateOpaqueToken, hashToken } from "src/lib/security/tokens";
import { PAYMENT_STATUS_TOKEN_TTL_SECONDS } from "src/modules/contracts/contracts.constants";
import { contractError } from "src/modules/contracts/contracts.errors";
import {
  ACTIVE_CHECKOUT_ATTEMPT_STATUSES,
} from "src/modules/contracts/payment/payment-attempt.constants";
import { buildPaymentCallbackUrls } from "src/modules/contracts/payment/payment-callback-urls";
import {
  buildCheckoutRequestFingerprint,
  type CheckoutFingerprintInput,
} from "src/modules/contracts/payment/payment-attempt-fingerprint";
import { stripeCheckoutAttemptIdempotencyKey } from "src/modules/contracts/payment/stripe-payment-profile.service";
import { stripeLivemodeConfigured } from "src/modules/contracts/payment/stripe-account-identity";

export interface DesiredCheckoutSnapshot {
  amount: number;
  currency: string;
  contractId: string;
  purpose: ContractPayment["purpose"];
  targetId: string;
  companyCode: string | null;
  locale: PublicFrontendLocale;
  savePaymentMethodForFutureUse: boolean;
  consentVersion: string | null;
  cancelUrl: string;
  stripeCustomerId: string | null;
  providerAccountKey: string | null;
}

export type CheckoutAttemptClaim =
  | { kind: "ready"; attempt: ContractPaymentAttempt; statusToken: null }
  | { kind: "stripe"; attempt: ContractPaymentAttempt; statusToken: string | null };

function isAttemptCheckoutUsable(attempt: ContractPaymentAttempt): boolean {
  if (attempt.status !== "READY") return false;
  if (!attempt.checkoutUrl || !attempt.providerReference) return false;
  if (attempt.checkoutExpiresAt && attempt.checkoutExpiresAt.getTime() <= Date.now()) return false;
  return true;
}

async function markAttemptSuperseded(tx: Tx, attemptId: string): Promise<void> {
  await tx.contractPaymentAttempt.update({
    where: { id: attemptId },
    data: { status: "SUPERSEDED" },
  });
}

async function createImmutableAttempt(
  tx: Tx,
  payment: ContractPayment,
  snapshot: DesiredCheckoutSnapshot,
): Promise<{ attempt: ContractPaymentAttempt; statusToken: string }> {
  const statusToken = generateOpaqueToken(32);
  const { successUrl, cancelUrl: callbackCancelUrl } = buildPaymentCallbackUrls(
    statusToken,
    snapshot.locale,
  );
  const cancelUrl = snapshot.cancelUrl || callbackCancelUrl;
  const fingerprintInput: CheckoutFingerprintInput = {
    amount: snapshot.amount,
    currency: snapshot.currency,
    contractId: snapshot.contractId,
    purpose: snapshot.purpose,
    targetId: snapshot.targetId,
    companyCode: snapshot.companyCode,
    successUrl,
    cancelUrl,
    savePaymentMethodForFutureUse: snapshot.savePaymentMethodForFutureUse,
    consentVersion: snapshot.consentVersion,
    stripeCustomerId: snapshot.stripeCustomerId,
  };
  const attemptId = randomUUID();
  const attempt = await tx.contractPaymentAttempt.create({
    data: {
      id: attemptId,
      contractPaymentId: payment.id,
      provider: "stripe",
      livemode: stripeLivemodeConfigured(),
      providerAccountKey: snapshot.providerAccountKey,
      amount: snapshot.amount,
      currency: snapshot.currency,
      purpose: snapshot.purpose,
      contractId: snapshot.contractId,
      companyCode: snapshot.companyCode,
      locale: snapshot.locale,
      savePaymentMethodForFutureUse: snapshot.savePaymentMethodForFutureUse,
      consentVersion: snapshot.consentVersion,
      statusTokenHash: hashToken(statusToken),
      successUrl,
      cancelUrl,
      stripeCustomerId: snapshot.stripeCustomerId,
      idempotencyKey: stripeCheckoutAttemptIdempotencyKey(attemptId),
      requestFingerprint: buildCheckoutRequestFingerprint(fingerprintInput),
      status: "PREPARING",
    },
  });
  await tx.contractPayment.update({
    where: { id: payment.id },
    data: {
      status: "PROCESSING",
      statusTokenHash: attempt.statusTokenHash,
      statusTokenExpiresAt: expiryFromNow(PAYMENT_STATUS_TOKEN_TTL_SECONDS),
      savePaymentMethodForFutureUse: snapshot.savePaymentMethodForFutureUse,
      futureUseConsentVersion: snapshot.consentVersion,
      futureUseConsentLocale: snapshot.savePaymentMethodForFutureUse ? snapshot.locale : null,
      futureUseConsentAt: snapshot.savePaymentMethodForFutureUse ? new Date() : null,
    },
  });
  return { attempt, statusToken };
}

function fingerprintMatches(attempt: ContractPaymentAttempt, snapshot: DesiredCheckoutSnapshot): boolean {
  const { successUrl, cancelUrl } = {
    successUrl: attempt.successUrl,
    cancelUrl: attempt.cancelUrl,
  };
  const expected = buildCheckoutRequestFingerprint({
    amount: snapshot.amount,
    currency: snapshot.currency,
    contractId: snapshot.contractId,
    purpose: snapshot.purpose,
    targetId: snapshot.targetId,
    companyCode: snapshot.companyCode,
    successUrl,
    cancelUrl,
    savePaymentMethodForFutureUse: snapshot.savePaymentMethodForFutureUse,
    consentVersion: snapshot.consentVersion,
    stripeCustomerId: snapshot.stripeCustomerId,
  });
  return expected === attempt.requestFingerprint;
}

export function createCheckoutAttemptService(prisma: PrismaClient) {
  async function claimCheckoutAttempt(
    tx: Tx,
    payment: ContractPayment,
    snapshot: DesiredCheckoutSnapshot,
  ): Promise<CheckoutAttemptClaim> {
    const active = await tx.contractPaymentAttempt.findFirst({
      where: {
        contractPaymentId: payment.id,
        status: { in: ACTIVE_CHECKOUT_ATTEMPT_STATUSES },
      },
      orderBy: { createdAt: "desc" },
    });

    if (active) {
      if (!fingerprintMatches(active, snapshot)) {
        await markAttemptSuperseded(tx, active.id);
      } else if (isAttemptCheckoutUsable(active)) {
        return { kind: "ready", attempt: active, statusToken: null };
      } else if (
        active.status === "PREPARING" ||
        active.status === "RECOVERING" ||
        (active.status === "READY" && !isAttemptCheckoutUsable(active))
      ) {
        if (active.status === "READY" && active.checkoutExpiresAt && active.checkoutExpiresAt.getTime() <= Date.now()) {
          await tx.contractPaymentAttempt.update({
            where: { id: active.id },
            data: { status: "EXPIRED" },
          });
        } else {
          await tx.contractPaymentAttempt.update({
            where: { id: active.id },
            data: { status: "RECOVERING" },
          });
          const recovering = await tx.contractPaymentAttempt.findUniqueOrThrow({ where: { id: active.id } });
          return { kind: "stripe", attempt: recovering, statusToken: null };
        }
      }
    }

    const created = await createImmutableAttempt(tx, payment, snapshot);
    return { kind: "stripe", attempt: created.attempt, statusToken: created.statusToken };
  }

  async function persistStripeCheckoutResult(
    attemptId: string,
    result: {
      provider: string;
      providerReference: string;
      providerStatus: string;
      checkoutUrl: string;
      checkoutExpiresAt: Date;
    },
  ): Promise<{ attempt: ContractPaymentAttempt; superseded: boolean }> {
    return withTransaction(prisma, async (tx) => {
      const existing = await tx.contractPaymentAttempt.findUniqueOrThrow({
        where: { id: attemptId },
        select: { contractPaymentId: true },
      });
      const payment = await tx.contractPayment.findUniqueOrThrow({
        where: { id: existing.contractPaymentId },
        select: { status: true },
      });
      const superseded = payment.status !== "PENDING" && payment.status !== "PROCESSING";
      const attempt = await tx.contractPaymentAttempt.update({
        where: { id: attemptId },
        data: {
          provider: result.provider,
          providerReference: result.providerReference,
          checkoutUrl: result.checkoutUrl,
          checkoutExpiresAt: result.checkoutExpiresAt,
          status: superseded ? "EXPIRED" : "READY",
          lastErrorCode: superseded ? "REPLACED_BY_CASH" : null,
          lastErrorAt: superseded ? new Date() : null,
        },
      });
      if (!superseded) {
        await tx.contractPayment.update({
          where: { id: attempt.contractPaymentId },
          data: {
            provider: result.provider,
            providerReference: result.providerReference,
            providerStatus: result.providerStatus,
            checkoutUrl: result.checkoutUrl,
            checkoutExpiresAt: result.checkoutExpiresAt,
            processingStartedAt: new Date(),
            status: "PROCESSING",
          },
        });
      }
      return { attempt, superseded };
    });
  }

  async function recordAttemptFailure(attemptId: string, errorCode: string): Promise<void> {
    await prisma.contractPaymentAttempt.update({
      where: { id: attemptId },
      data: {
        status: "FAILED",
        lastErrorCode: errorCode,
        lastErrorAt: new Date(),
      },
    });
  }

  async function isCheckoutRecoverable(contractPaymentId: string): Promise<boolean> {
    const attempt = await prisma.contractPaymentAttempt.findFirst({
      where: {
        contractPaymentId,
        status: { in: ["PREPARING", "RECOVERING", "FAILED"] },
      },
      orderBy: { createdAt: "desc" },
    });
    return Boolean(attempt);
  }

  async function markAttemptCompleted(attemptId: string): Promise<void> {
    await prisma.contractPaymentAttempt.update({
      where: { id: attemptId },
      data: { status: "COMPLETED" },
    });
  }

  return {
    claimCheckoutAttempt,
    persistStripeCheckoutResult,
    recordAttemptFailure,
    isCheckoutRecoverable,
    markAttemptCompleted,
    isAttemptCheckoutUsable,
  };
}

export type CheckoutAttemptService = ReturnType<typeof createCheckoutAttemptService>;
