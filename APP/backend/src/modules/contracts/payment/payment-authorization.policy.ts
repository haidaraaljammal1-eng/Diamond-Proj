import type { ContractPayment, Prisma } from "@prisma/client";

export type RentalPaymentAuthorizationState =
  | "not_required"
  | "pending"
  | "complete"
  | "incomplete";

type PaymentAuthLookup = {
  savePaymentMethodForFutureUse: boolean;
  status: ContractPayment["status"];
  contract: { collectionMode: string };
};

/** Informational status only — must not gate Car-Out or rental lifecycle. */
export function rentalPaymentAuthorizationState(
  payment: PaymentAuthLookup,
  hasAuthorization: boolean,
): RentalPaymentAuthorizationState {
  if (payment.contract.collectionMode !== "ELECTRONIC") return "not_required";
  if (!payment.savePaymentMethodForFutureUse) return "not_required";
  if (payment.status !== "CONFIRMED") return "pending";
  return hasAuthorization ? "complete" : "incomplete";
}

export async function loadRentalAuthorizationState(
  prisma: Pick<Prisma.TransactionClient, "contractPayment" | "contractPaymentAuthorization">,
  paymentId: string,
): Promise<RentalPaymentAuthorizationState> {
  const payment = await prisma.contractPayment.findUnique({
    where: { id: paymentId },
    select: {
      savePaymentMethodForFutureUse: true,
      status: true,
      contract: { select: { collectionMode: true } },
    },
  });
  if (!payment || payment.contract.collectionMode !== "ELECTRONIC") return "not_required";
  if (!payment.savePaymentMethodForFutureUse) return "not_required";
  if (payment.status !== "CONFIRMED") return "pending";
  const auth = await prisma.contractPaymentAuthorization.findUnique({
    where: { sourcePaymentId: paymentId },
  });
  return auth ? "complete" : "incomplete";
}
