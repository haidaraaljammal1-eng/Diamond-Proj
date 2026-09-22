import type Stripe from "stripe";
import type { PrismaClient } from "@prisma/client";
import type { Tx } from "src/lib/db/transaction";

/**
 * Resolves one Stripe Customer per Diamond Customer for the current Stripe account.
 * Creates and persists the Stripe id on first use; never creates duplicates per customer.
 */
export async function resolveStripeCustomerId(
  stripe: Stripe,
  tx: Tx,
  diamondCustomerId: number,
): Promise<string> {
  const customer = await tx.customer.findUnique({ where: { id: diamondCustomerId } });
  if (!customer) {
    throw new Error(`Customer ${diamondCustomerId} not found`);
  }
  if (customer.stripeCustomerId) {
    return customer.stripeCustomerId;
  }
  const stripeCustomer = await stripe.customers.create({
    metadata: { diamondCustomerId: String(diamondCustomerId) },
  });
  await tx.customer.update({
    where: { id: diamondCustomerId },
    data: { stripeCustomerId: stripeCustomer.id },
  });
  return stripeCustomer.id;
}

/**
 * Resolves or creates a Stripe Customer outside a payment transaction.
 * `knownId` may already be loaded from the DB inside the claim transaction.
 */
export async function resolveStripeCustomerForPayment(
  stripe: Stripe,
  prisma: PrismaClient,
  diamondCustomerId: number,
  knownId?: string | null,
): Promise<string> {
  if (knownId) return knownId;
  const existing = await findStripeCustomerId(prisma, diamondCustomerId);
  if (existing) return existing;
  const stripeCustomer = await stripe.customers.create({
    metadata: { diamondCustomerId: String(diamondCustomerId) },
  });
  await prisma.customer.update({
    where: { id: diamondCustomerId },
    data: { stripeCustomerId: stripeCustomer.id },
  });
  return stripeCustomer.id;
}

/** Read-only lookup without creating a Stripe Customer. */
export async function findStripeCustomerId(
  prisma: PrismaClient | Tx,
  diamondCustomerId: number,
): Promise<string | null> {
  const customer = await prisma.customer.findUnique({
    where: { id: diamondCustomerId },
    select: { stripeCustomerId: true },
  });
  return customer?.stripeCustomerId ?? null;
}
