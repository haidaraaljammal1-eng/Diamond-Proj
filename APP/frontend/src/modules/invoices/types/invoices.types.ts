export const INVOICES_PAGE_SIZE = 20;

export type InvoiceType = "RENTAL" | "RECONCILIATION" | "ROAD_LIABILITY" | "RENEWAL";
export type InvoiceStatus = "ISSUED" | "VOID";
export type InvoiceCompanyCodeFilter = "ALL" | "ELITE" | "UNIQUE";
export type InvoiceTypeFilter = "ALL" | InvoiceType;

export type InvoiceDeliveryStatus =
  | "PENDING"
  | "SENDING"
  | "SENT"
  | "DELIVERED"
  | "FAILED";

export interface InvoicePageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface InvoiceListItemDto {
  id: string;
  invoiceNumber: number;
  invoiceType: InvoiceType;
  status: InvoiceStatus;
  companyId: number;
  companyCode: string;
  companyName: string;
  contractId: string;
  contractNumber: string;
  vehicleId: number;
  vehicleName: string;
  plateNumber: string;
  customerId: number;
  customerName: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  totalAmount: number;
  sourceLabel: string;
  latestDeliveryStatus: InvoiceDeliveryStatus | null;
  createdAt: string;
}

export interface InvoiceLineDto {
  id: string;
  position: number;
  lineType: string;
  serviceLabel: string;
  description: string;
  quantity: number;
  unitRate: number;
  amount: number;
  sourceType: string;
  sourceId: string;
}

export interface InvoiceDeliverySummaryDto {
  id: string;
  channel: string;
  status: InvoiceDeliveryStatus;
  requestedAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  failureCode: string | null;
}

export interface InvoiceDetailDto extends InvoiceListItemDto {
  termsSnapshot: string;
  balanceDueSnapshot: number;
  subtotalAmount: number;
  templateVersion: string;
  originEventKey: string;
  companyDisplayNameSnapshot: string;
  companyAddressSnapshot: string | null;
  companyEmailSnapshot: string | null;
  lines: InvoiceLineDto[];
  deliveriesSummary: InvoiceDeliverySummaryDto[];
}

export interface InvoiceDeliveryDto {
  id: string;
  channel: string;
  status: InvoiceDeliveryStatus;
  recipientPhoneSnapshot: string;
  recipientNameSnapshot: string | null;
  messageSnapshot: string;
  provider: string | null;
  requestedAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  requestedByUserId: number;
}

export interface InvoicesListQuery {
  search: string;
  companyCode: InvoiceCompanyCodeFilter;
  invoiceType: InvoiceTypeFilter;
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: number;
}

export interface InvoicePdfDownload {
  blob: Blob;
  filename: string;
}
