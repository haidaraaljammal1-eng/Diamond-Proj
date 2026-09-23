import type Stripe from "stripe";
import { contractError } from "src/modules/contracts/contracts.errors";

export function isStripeSdkError(error: unknown): error is Stripe.errors.StripeError {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    typeof (error as Stripe.errors.StripeError).type === "string" &&
    (error as Stripe.errors.StripeError).type.startsWith("Stripe")
  );
}

export function stripeErrorCode(error: Stripe.errors.StripeError): string {
  return error.code ?? error.type ?? "stripe_error";
}

export function stripeCheckoutErrorContext(
  error: Stripe.errors.StripeError,
): Record<string, string | undefined> {
  return {
    stripeType: error.type,
    stripeCode: error.code ?? undefined,
    stripeParam: typeof error.param === "string" ? error.param : undefined,
    stripeRequestId: error.requestId ?? undefined,
  };
}

export function throwMappedStripeCheckoutError(error: unknown): never {
  if (isStripeSdkError(error)) {
    if (error.type === "StripeIdempotencyError") {
      throw contractError.paymentAttemptRecoveryFailed();
    }
    if (error.statusCode === 429 || error.code === "lock_timeout") {
      throw contractError.paymentProviderTemporarilyUnavailable();
    }
    if (error.type === "StripeInvalidRequestError") {
      throw contractError.paymentCheckoutConfigurationError(stripeCheckoutErrorContext(error));
    }
    throw contractError.paymentCheckoutPreparationFailed();
  }
  throw contractError.paymentCheckoutPreparationFailed();
}
