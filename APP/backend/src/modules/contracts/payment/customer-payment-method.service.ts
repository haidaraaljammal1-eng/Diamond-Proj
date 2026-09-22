import type { PrismaClient } from "@prisma/client";
import type { Tx } from "src/lib/db/transaction";
import { contractError } from "src/modules/contracts/contracts.errors";
import type { PaymentConsentDefinition } from "src/modules/contracts/payment/payment-consent.catalog";

export type SavedCardDetails = {
  stripeCustomerId: string;
  stripePaymentMethodId: string;
  cardBrand: string;
  cardLast4: string;
  expMonth?: number | null;
  expYear?: number | null;
};

export async function upsertCustomerPaymentMethod(
  tx: Tx,
  profileId: string,
  details: SavedCardDetails,
): Promise<string> {
  const profile = await tx.customerPaymentProfile.findUnique({
    where: { id: profileId },
    select: { providerCustomerId: true },
  });
  if (!profile?.providerCustomerId || profile.providerCustomerId !== details.stripeCustomerId) {
    throw contractError.paymentProviderReferenceMismatch();
  }

  const row = await tx.customerPaymentMethod.upsert({
    where: {
      profileId_providerPaymentMethodId: {
        profileId,
        providerPaymentMethodId: details.stripePaymentMethodId,
      },
    },
    create: {
      profileId,
      providerPaymentMethodId: details.stripePaymentMethodId,
      type: "CARD",
      cardBrand: details.cardBrand,
      cardLast4: details.cardLast4,
      expMonth: details.expMonth ?? null,
      expYear: details.expYear ?? null,
      status: "ACTIVE",
      lastUsedAt: new Date(),
    },
    update: {
      cardBrand: details.cardBrand,
      cardLast4: details.cardLast4,
      expMonth: details.expMonth ?? null,
      expYear: details.expYear ?? null,
      status: "ACTIVE",
      lastUsedAt: new Date(),
    },
  });
  return row.id;
}

export async function createContractPaymentAuthorization(
  tx: Tx,
  input: {
    contractId: string;
    customerId: number;
    customerPaymentMethodId: string;
    sourcePaymentId: string;
    consent: PaymentConsentDefinition;
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<void> {
  const existing = await tx.contractPaymentAuthorization.findUnique({
    where: { contractId: input.contractId },
  });
  if (existing) return;

  await tx.contractPaymentAuthorization.create({
    data: {
      contractId: input.contractId,
      customerId: input.customerId,
      customerPaymentMethodId: input.customerPaymentMethodId,
      sourcePaymentId: input.sourcePaymentId,
      consentVersion: input.consent.version,
      consentLocale: input.consent.locale,
      consentTextHash: input.consent.hash,
      scope: input.consent.scope,
      authorizedAt: new Date(),
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}

/** Historical contract-level card snapshot for A4 rendering. */
export async function persistContractCardSnapshot(
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
  await tx.contractCardPaymentMethod.upsert({
    where: { contractId: input.contractId },
    create: {
      contractId: input.contractId,
      provider: "stripe",
      stripeCustomerId: input.stripeCustomerId ?? null,
      stripePaymentMethodId: input.stripePaymentMethodId,
      cardBrand: input.cardBrand,
      cardLast4: input.cardLast4,
      futureUseConsentPaymentId: input.futureUseConsentPaymentId ?? null,
      futureUseAuthorizedAt: input.futureUseConsentPaymentId ? new Date() : null,
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

export async function findProfileIdForCustomer(
  prisma: PrismaClient | Tx,
  customerId: number,
  providerAccountKey: string,
  livemode: boolean,
): Promise<string | null> {
  const profile = await prisma.customerPaymentProfile.findUnique({
    where: {
      customerId_provider_providerAccountKey_livemode: {
        customerId,
        provider: "STRIPE",
        providerAccountKey,
        livemode,
      },
    },
    select: { id: true },
  });
  return profile?.id ?? null;
}
