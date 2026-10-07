import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";

export const InvoiceErrorReason = {
  NOT_FOUND: "INVOICE_NOT_FOUND",
  SEQUENCE_NOT_CONFIGURED: "INVOICE_SEQUENCE_NOT_CONFIGURED",
  SOURCE_INCOMPLETE: "INVOICE_SOURCE_INCOMPLETE",
  DUPLICATE_SOURCE: "INVOICE_DUPLICATE_SOURCE",
  CUSTOMER_PHONE_MISSING: "INVOICE_CUSTOMER_PHONE_MISSING",
  NOT_ISSUED: "INVOICE_NOT_ISSUED",
  WHATSAPP_UNCONFIGURED: "WHATSAPP_PROVIDER_UNCONFIGURED",
} as const;

const R = InvoiceErrorReason;

export function invoiceNotFoundError(): AppError {
  return new AppError({
    code: ErrorCode.NOT_FOUND,
    message: "Invoice not found",
    context: { reason: R.NOT_FOUND },
  });
}

export function invoiceSequenceNotConfiguredError(): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "Invoice number sequence is not configured for this company",
    context: { reason: R.SEQUENCE_NOT_CONFIGURED },
  });
}

export function invoiceSourceIncompleteError(message = "Authoritative invoice source is incomplete"): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message,
    context: { reason: R.SOURCE_INCOMPLETE },
  });
}

export function invoiceDuplicateSourceError(): AppError {
  return new AppError({
    code: ErrorCode.CONFLICT,
    message: "An invoice already exists for this source",
    context: { reason: R.DUPLICATE_SOURCE },
  });
}

export function invoiceCustomerPhoneMissingError(): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "Customer phone is required for WhatsApp delivery",
    context: { reason: R.CUSTOMER_PHONE_MISSING },
  });
}

export function whatsAppProviderUnconfiguredError(): AppError {
  return new AppError({
    code: ErrorCode.INTERNAL_ERROR,
    statusCode: 503,
    message: "WhatsApp provider is not configured",
    context: { reason: R.WHATSAPP_UNCONFIGURED },
  });
}

export function invoiceNotIssuedError(): AppError {
  return new AppError({
    code: ErrorCode.VALIDATION_ERROR,
    message: "Only issued invoices can be delivered",
    context: { reason: R.NOT_ISSUED },
  });
}
