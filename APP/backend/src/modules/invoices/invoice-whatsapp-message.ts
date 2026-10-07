import { formatInvoiceAed } from "src/modules/invoices/invoice-money";

export function buildInvoiceWhatsAppMessage(input: {
  customerName: string;
  invoiceNumber: number;
  contractNumber: string;
  totalAmount: number;
  companyDisplayName: string;
}): string {
  return [
    `Dear ${input.customerName},`,
    "",
    `Please find attached Invoice ${input.invoiceNumber} related to Contract ${input.contractNumber}.`,
    "",
    `Amount: ${formatInvoiceAed(input.totalAmount)}`,
    "",
    `Thank you,`,
    input.companyDisplayName,
  ].join("\n");
}
