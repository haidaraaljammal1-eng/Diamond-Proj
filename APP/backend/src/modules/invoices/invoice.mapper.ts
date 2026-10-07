import type { Invoice, InvoiceDelivery, InvoiceLine, OperatingCompany } from "@prisma/client";

export function invoiceSourceLabel(invoiceType: Invoice["invoiceType"]): string {
  switch (invoiceType) {
    case "RENTAL":
      return "Rental";
    case "ROAD_LIABILITY":
      return "Road Liability";
    case "RECONCILIATION":
      return "Reconciliation";
    case "RENEWAL":
      return "Renewal";
    default:
      return invoiceType;
  }
}

export function toInvoiceListItem(
  row: Invoice & {
    company: Pick<OperatingCompany, "code" | "displayName">;
    deliveries: Pick<InvoiceDelivery, "status">[];
  },
) {
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    invoiceType: row.invoiceType,
    status: row.status,
    companyId: row.companyId,
    companyCode: row.company.code,
    companyName: row.company.displayName,
    contractId: row.contractId,
    contractNumber: row.contractNumberSnapshot,
    vehicleId: row.vehicleId,
    vehicleName: row.vehicleNameSnapshot,
    plateNumber: row.plateNumberSnapshot,
    customerId: row.customerId,
    customerName: row.customerNameSnapshot,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    currency: row.currency,
    totalAmount: row.totalAmount,
    sourceLabel: invoiceSourceLabel(row.invoiceType),
    latestDeliveryStatus: row.deliveries[0]?.status ?? null,
    createdAt: row.createdAt,
  };
}

export function toInvoiceDetail(
  row: Invoice & {
    company: Pick<OperatingCompany, "code" | "displayName">;
    lines: InvoiceLine[];
    deliveries: InvoiceDelivery[];
  },
) {
  return {
    ...toInvoiceListItem({ ...row, deliveries: row.deliveries.slice(0, 1) }),
    termsSnapshot: row.termsSnapshot,
    balanceDueSnapshot: row.balanceDueSnapshot,
    subtotalAmount: row.subtotalAmount,
    templateVersion: row.templateVersion,
    originEventKey: row.originEventKey,
    companyDisplayNameSnapshot: row.companyDisplayNameSnapshot,
    companyAddressSnapshot: row.companyAddressSnapshot,
    companyEmailSnapshot: row.companyEmailSnapshot,
    lines: row.lines.map((line) => ({
      id: line.id,
      position: line.position,
      lineType: line.lineType,
      serviceLabel: line.serviceLabel,
      description: line.description,
      quantity: line.quantity,
      unitRate: line.unitRate,
      amount: line.amount,
      sourceType: line.sourceType,
      sourceId: line.sourceId,
    })),
    deliveriesSummary: row.deliveries.map((d) => ({
      id: d.id,
      channel: d.channel,
      status: d.status,
      requestedAt: d.requestedAt,
      sentAt: d.sentAt,
      deliveredAt: d.deliveredAt,
      failedAt: d.failedAt,
      failureCode: d.failureCode,
    })),
  };
}
