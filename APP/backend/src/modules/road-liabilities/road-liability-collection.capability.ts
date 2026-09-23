import type { ContractPaymentAuthorization, CustomerPaymentMethod, PrismaClient } from "@prisma/client";
import { isCashCollectionContract } from "src/modules/contracts/contract-collection-mode";
import { OFF_SESSION_ELIGIBLE_CONSENT_SCOPES } from "src/modules/contracts/payment/payment-consent.catalog";
import {
  resolveStripeProviderAccountKey,
  stripeLivemodeConfigured,
} from "src/modules/contracts/payment/stripe-account-identity";
import { createPaymentProvider } from "src/modules/contracts/payment/payment-provider.factory";
import type { RoadLiabilityCollectionCapabilitySchema } from "src/modules/road-liabilities/road-liability-collection.schema";
import type { z } from "zod";

type Capability = z.infer<typeof RoadLiabilityCollectionCapabilitySchema>;

export async function resolveCollectionAuthorization(
  prisma: PrismaClient,
  contractId: string,
  expectedCustomerId: number | null,
): Promise<{
  authorization: ContractPaymentAuthorization & {
    customerPaymentMethod: CustomerPaymentMethod & {
      profile: { providerAccountKey: string; livemode: boolean; providerCustomerId: string | null };
    };
  };
  capability: Capability;
} | { authorization: null; capability: Capability }> {
  const payProvider = createPaymentProvider();
  const electronicPaymentLinkAvailable = payProvider.configured;

  const base: Capability = {
    offSessionAvailable: false,
    paymentLinkAvailable: electronicPaymentLinkAvailable,
    cashCollectionRequired: false,
    authorizationStatus: "missing",
    savedPaymentMethod: null,
    reasonCode: "AUTHORIZATION_MISSING",
  };

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: {
      collectionMode: true,
      payments: {
        where: { purpose: "RENTAL", status: "CONFIRMED" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { purpose: true, method: true, status: true },
      },
    },
  });
  if (contract && isCashCollectionContract(contract)) {
    return {
      authorization: null,
      capability: {
        ...base,
        cashCollectionRequired: true,
        paymentLinkAvailable: false,
        offSessionAvailable: false,
        reasonCode: "CASH_COLLECTION_REQUIRED",
      },
    };
  }

  const authorization = await prisma.contractPaymentAuthorization.findUnique({
    where: { contractId },
    include: {
      customerPaymentMethod: { include: { profile: true } },
    },
  });
  if (!authorization) return { authorization: null, capability: base };
  if (authorization.revokedAt) {
    return {
      authorization: null,
      capability: {
        ...base,
        authorizationStatus: "revoked",
        reasonCode: "AUTHORIZATION_REVOKED",
      },
    };
  }
  if (expectedCustomerId != null && authorization.customerId !== expectedCustomerId) {
    return {
      authorization: null,
      capability: {
        ...base,
        authorizationStatus: "contract_mismatch",
        reasonCode: "AUTHORIZATION_CONTRACT_MISMATCH",
      },
    };
  }
  if (!OFF_SESSION_ELIGIBLE_CONSENT_SCOPES.includes(authorization.scope as (typeof OFF_SESSION_ELIGIBLE_CONSENT_SCOPES)[number])) {
    return {
      authorization: null,
      capability: {
        ...base,
        authorizationStatus: "scope_ineligible",
        reasonCode: "CONSENT_SCOPE_INELIGIBLE",
        savedPaymentMethod: {
          brand: authorization.customerPaymentMethod.cardBrand,
          last4: authorization.customerPaymentMethod.cardLast4,
        },
      },
    };
  }
  if (!payProvider.configured) {
    return {
      authorization: null,
      capability: {
        ...base,
        authorizationStatus: "provider_mismatch",
        reasonCode: "PAYMENT_PROVIDER_NOT_CONFIGURED",
        savedPaymentMethod: {
          brand: authorization.customerPaymentMethod.cardBrand,
          last4: authorization.customerPaymentMethod.cardLast4,
        },
      },
    };
  }

  if (authorization.customerPaymentMethod.status !== "ACTIVE") {
    return {
      authorization: null,
      capability: {
        ...base,
        authorizationStatus: "method_inactive",
        reasonCode: "PAYMENT_METHOD_INACTIVE",
        savedPaymentMethod: {
          brand: authorization.customerPaymentMethod.cardBrand,
          last4: authorization.customerPaymentMethod.cardLast4,
        },
      },
    };
  }

  if (payProvider.configured) {
    const Stripe = (await import("stripe")).default;
    const { env } = await import("src/config/env");
    const stripe = new Stripe(env.STRIPE_SECRET_KEY!);
    const accountKey = await resolveStripeProviderAccountKey(stripe);
    const livemode = stripeLivemodeConfigured();
    const profile = authorization.customerPaymentMethod.profile;
    if (profile.providerAccountKey !== accountKey || profile.livemode !== livemode) {
      return {
        authorization: null,
        capability: {
          ...base,
          authorizationStatus: "provider_mismatch",
          reasonCode: "PROVIDER_ACCOUNT_MISMATCH",
          savedPaymentMethod: {
            brand: authorization.customerPaymentMethod.cardBrand,
            last4: authorization.customerPaymentMethod.cardLast4,
          },
        },
      };
    }
  }

  return {
    authorization,
    capability: {
      offSessionAvailable: true,
      paymentLinkAvailable: true,
      cashCollectionRequired: false,
      authorizationStatus: "active",
      savedPaymentMethod: {
        brand: authorization.customerPaymentMethod.cardBrand,
        last4: authorization.customerPaymentMethod.cardLast4,
      },
      reasonCode: null,
    },
  };
}
