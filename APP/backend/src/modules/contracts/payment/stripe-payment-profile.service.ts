import type { PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { withTransaction, type Tx } from "src/lib/db/transaction";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import {
  resolveStripeProviderAccountKey,
  stripeLivemodeConfigured,
} from "src/modules/contracts/payment/stripe-account-identity";

export const STRIPE_PROFILE_LOCK_NS = "stripe_payment_profile";

export function stripeCustomerIdempotencyKey(profileId: string): string {
  return `diamond:stripe-customer-profile:${profileId}:v1`;
}

/** @deprecated Use stripeCheckoutAttemptIdempotencyKey — keyed by immutable provider attempt. */
export function stripeCheckoutIdempotencyKey(paymentId: string): string {
  return `diamond:checkout:${paymentId}:v1`;
}

export function stripeCheckoutAttemptIdempotencyKey(attemptId: string): string {
  return `diamond:stripe:checkout:${attemptId}:v1`;
}

async function adoptLegacyStripeCustomerId(
  tx: Tx,
  customerId: number,
  providerAccountKey: string,
  livemode: boolean,
): Promise<string | null> {
  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    select: { stripeCustomerId: true },
  });
  if (!customer?.stripeCustomerId) return null;

  const conflicting = await tx.customerPaymentProfile.findFirst({
    where: {
      provider: "STRIPE",
      providerAccountKey,
      livemode,
      providerCustomerId: customer.stripeCustomerId,
      NOT: { customerId },
    },
    select: { id: true },
  });
  if (conflicting) return null;
  return customer.stripeCustomerId;
}

/**
 * Ensures a CustomerPaymentProfile row exists (providerCustomerId may be null).
 * Stripe Customer creation happens outside the transaction.
 */
export async function claimCustomerPaymentProfile(
  prisma: PrismaClient,
  customerId: number,
  stripe: Stripe,
): Promise<{ profileId: string; providerCustomerId: string | null }> {
  const providerAccountKey = await resolveStripeProviderAccountKey(stripe);
  const livemode = stripeLivemodeConfigured();

  return withTransaction(prisma, async (tx) => {
    await acquireAdvisoryLock(tx, STRIPE_PROFILE_LOCK_NS, `${customerId}:${providerAccountKey}:${livemode}`);

    const existing = await tx.customerPaymentProfile.findUnique({
      where: {
        customerId_provider_providerAccountKey_livemode: {
          customerId,
          provider: "STRIPE",
          providerAccountKey,
          livemode,
        },
      },
    });
    if (existing) {
      return { profileId: existing.id, providerCustomerId: existing.providerCustomerId };
    }

    const legacyId = await adoptLegacyStripeCustomerId(tx, customerId, providerAccountKey, livemode);
    try {
      const created = await tx.customerPaymentProfile.create({
        data: {
          customerId,
          provider: "STRIPE",
          providerAccountKey,
          livemode,
          providerCustomerId: legacyId,
        },
      });
      if (legacyId) {
        await tx.customer.update({
          where: { id: customerId },
          data: { stripeCustomerId: legacyId },
        });
      }
      return { profileId: created.id, providerCustomerId: created.providerCustomerId };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await tx.customerPaymentProfile.findUniqueOrThrow({
        where: {
          customerId_provider_providerAccountKey_livemode: {
            customerId,
            provider: "STRIPE",
            providerAccountKey,
            livemode,
          },
        },
      });
      return { profileId: raced.id, providerCustomerId: raced.providerCustomerId };
    }
  });
}

/** Creates Stripe Customer outside DB tx, then persists providerCustomerId. */
export async function ensureStripeCustomerForProfile(
  stripe: Stripe,
  prisma: PrismaClient,
  profileId: string,
  diamondCustomerId: number,
): Promise<string> {
  const profile = await prisma.customerPaymentProfile.findUnique({ where: { id: profileId } });
  if (!profile) throw new Error(`Payment profile ${profileId} not found`);
  if (profile.providerCustomerId) return profile.providerCustomerId;

  const stripeCustomer = await stripe.customers.create(
    { metadata: { diamondCustomerId: String(diamondCustomerId) } },
    { idempotencyKey: stripeCustomerIdempotencyKey(profileId) },
  );

  try {
    await prisma.customerPaymentProfile.update({
      where: { id: profileId },
      data: { providerCustomerId: stripeCustomer.id },
    });
    await prisma.customer.update({
      where: { id: diamondCustomerId },
      data: { stripeCustomerId: stripeCustomer.id },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await prisma.customerPaymentProfile.findFirst({
        where: {
          provider: "STRIPE",
          providerAccountKey: profile.providerAccountKey,
          livemode: profile.livemode,
          providerCustomerId: stripeCustomer.id,
        },
      });
      if (existing?.providerCustomerId) return existing.providerCustomerId;
    }
    throw error;
  }
  return stripeCustomer.id;
}

export async function resolveStripeCustomerForPayment(
  stripe: Stripe,
  prisma: PrismaClient,
  diamondCustomerId: number,
): Promise<string> {
  const claimed = await claimCustomerPaymentProfile(prisma, diamondCustomerId, stripe);
  if (claimed.providerCustomerId) return claimed.providerCustomerId;
  return ensureStripeCustomerForProfile(stripe, prisma, claimed.profileId, diamondCustomerId);
}

/** Read-only profile lookup for the active Stripe account/mode. */
export async function findStripeCustomerId(
  prisma: PrismaClient | Tx,
  diamondCustomerId: number,
  providerAccountKey?: string,
  livemode?: boolean,
): Promise<string | null> {
  if (providerAccountKey != null && livemode != null) {
    const profile = await prisma.customerPaymentProfile.findUnique({
      where: {
        customerId_provider_providerAccountKey_livemode: {
          customerId: diamondCustomerId,
          provider: "STRIPE",
          providerAccountKey,
          livemode,
        },
      },
      select: { providerCustomerId: true },
    });
    return profile?.providerCustomerId ?? null;
  }
  const customer = await prisma.customer.findUnique({
    where: { id: diamondCustomerId },
    select: { stripeCustomerId: true },
  });
  return customer?.stripeCustomerId ?? null;
}
