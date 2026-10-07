import type { InvoiceDeliveryStatus, InvoiceStatus, InvoiceType } from "../types/invoices.types.ts";

export function invoiceTypeTranslationKey(type: InvoiceType): string {
  return `types.${type}`;
}

export function invoiceStatusTranslationKey(status: InvoiceStatus): string {
  return `status.${status}`;
}

export function deliveryStatusTranslationKey(
  status: InvoiceDeliveryStatus | null | undefined,
): string {
  if (!status) return "delivery.notSent";
  return `delivery.status.${status}`;
}

export function deliveryStatusBadgeVariant(
  status: InvoiceDeliveryStatus | null | undefined,
): "neutral" | "success" | "warning" | "danger" {
  if (!status) return "neutral";
  if (status === "DELIVERED" || status === "SENT") return "success";
  if (status === "FAILED") return "danger";
  if (status === "SENDING" || status === "PENDING") return "warning";
  return "neutral";
}
