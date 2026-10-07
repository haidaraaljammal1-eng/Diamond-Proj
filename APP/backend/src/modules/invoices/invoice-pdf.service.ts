import fs from "node:fs";
import PDFDocument from "pdfkit";
import type { Invoice, InvoiceLine } from "@prisma/client";
import { registerReportFonts, REPORT_FONT_REGULAR, REPORT_FONT_BOLD } from "src/modules/reports/report-fonts";
import { formatInvoiceAed, formatInvoiceDateDdMmYyyy } from "src/modules/invoices/invoice-money";
import { invoiceNotFoundError } from "src/modules/invoices/invoices.errors";
import { INVOICE_TEMPLATE_VERSION } from "src/modules/invoices/invoices.constants";
import type { InvoiceBrandKey } from "src/modules/invoices/invoice-company-branding";
import { INVOICE_LOGO_DISPLAY_WIDTH_PT, invoiceLogoAssetPath } from "src/modules/invoices/invoice-logo";
import type { FastifyInstance } from "fastify";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 48;

export type InvoicePdfSnapshot = Invoice & { lines: InvoiceLine[] };

function renderV1(doc: InstanceType<typeof PDFDocument>, invoice: InvoicePdfSnapshot): void {
  registerReportFonts(doc);
  doc.font(REPORT_FONT_REGULAR);

  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  let y = MARGIN;

  doc.font(REPORT_FONT_BOLD).fontSize(11).text(invoice.companyDisplayNameSnapshot, MARGIN, y, {
    width: contentWidth * 0.55,
    align: "left",
  });

  const brandKey = (invoice.companyBrandKeySnapshot === "ELITE" ? "ELITE" : "UNIQUE") as InvoiceBrandKey;
  const logoPath = invoiceLogoAssetPath(brandKey);
  if (fs.existsSync(logoPath)) {
    const logoX = MARGIN + contentWidth - INVOICE_LOGO_DISPLAY_WIDTH_PT;
    doc.image(logoPath, logoX, y - 4, { width: INVOICE_LOGO_DISPLAY_WIDTH_PT });
  }

  y += 36;
  doc.font(REPORT_FONT_REGULAR).fontSize(9);
  if (invoice.companyAddressSnapshot) {
    doc.text(invoice.companyAddressSnapshot, MARGIN, y, { width: contentWidth * 0.55 });
  }
  if (invoice.companyEmailSnapshot) {
    doc.text(invoice.companyEmailSnapshot, MARGIN, y + 12, { width: contentWidth * 0.55 });
  }

  y += 48;
  doc.font(REPORT_FONT_BOLD).fontSize(18).text("INVOICE", MARGIN, y);
  y += 28;
  doc.font(REPORT_FONT_REGULAR).fontSize(10);
  doc.text("BILL TO", MARGIN, y);
  doc.font(REPORT_FONT_BOLD).text(invoice.customerNameSnapshot, MARGIN, y + 14);

  const metaX = MARGIN + contentWidth * 0.55;
  const metaRows: Array<[string, string]> = [
    ["INVOICE", String(invoice.invoiceNumber)],
    ["DATE", formatInvoiceDateDdMmYyyy(invoice.issueDate)],
    ["TERMS", invoice.termsSnapshot],
    ["DUE DATE", formatInvoiceDateDdMmYyyy(invoice.dueDate)],
  ];
  let metaY = y;
  for (const [label, value] of metaRows) {
    doc.font(REPORT_FONT_BOLD).text(label, metaX, metaY, { width: 80 });
    doc.font(REPORT_FONT_REGULAR).text(value, metaX + 82, metaY, { width: contentWidth * 0.4 });
    metaY += 16;
  }

  y = Math.max(y + 50, metaY + 10);
  const colWidths = [90, contentWidth - 90 - 50 - 70 - 70, 50, 70, 70];
  const headers = ["SERVICE", "DESCRIPTION", "QTY", "RATE", "AMOUNT"];
  doc.font(REPORT_FONT_BOLD).fontSize(9);
  let x = MARGIN;
  headers.forEach((header, i) => {
    const width = colWidths[i] ?? 70;
    doc.text(header, x, y, { width });
    x += width;
  });
  y += 18;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + contentWidth, y).stroke("#cccccc");
  y += 8;

  doc.font(REPORT_FONT_REGULAR).fontSize(9);
  for (const line of invoice.lines) {
    if (y > PAGE_HEIGHT - MARGIN - 80) {
      doc.addPage({ size: [PAGE_WIDTH, PAGE_HEIGHT], margin: MARGIN });
      y = MARGIN;
    }
    x = MARGIN;
    const cells = [
      line.serviceLabel,
      line.description,
      String(line.quantity),
      formatInvoiceAed(line.unitRate),
      formatInvoiceAed(line.amount),
    ];
    cells.forEach((cell, i) => {
      const width = colWidths[i] ?? 70;
      doc.text(cell, x, y, { width });
      x += width;
    });
    y += Math.max(16, doc.heightOfString(line.description, { width: colWidths[1] ?? 200 }) + 4);
  }

  y = Math.max(y + 24, PAGE_HEIGHT - MARGIN - 60);
  doc.font(REPORT_FONT_BOLD).fontSize(11).text("BALANCE DUE", MARGIN, y);
  doc.font(REPORT_FONT_BOLD).fontSize(12).text(formatInvoiceAed(invoice.balanceDueSnapshot), MARGIN, y, {
    width: contentWidth,
    align: "right",
  });

  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i += 1) {
    doc.switchToPage(i);
    doc.font(REPORT_FONT_REGULAR).fontSize(8).text(
      `Page ${i + 1} of ${pages.count}`,
      MARGIN,
      PAGE_HEIGHT - MARGIN + 12,
      { width: contentWidth, align: "center" },
    );
  }
}

export function renderInvoicePdfBuffer(invoice: InvoicePdfSnapshot): Promise<Buffer> {
  if (invoice.templateVersion !== INVOICE_TEMPLATE_VERSION) {
    throw new Error(`Unsupported invoice template version: ${invoice.templateVersion}`);
  }
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [PAGE_WIDTH, PAGE_HEIGHT],
      margin: MARGIN,
      bufferPages: true,
      info: { Title: `Invoice ${invoice.invoiceNumber}` },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    renderV1(doc, invoice);
    doc.end();
  });
}

export function invoicePdfFilename(invoice: Pick<Invoice, "companyBrandKeySnapshot" | "invoiceNumber">): string {
  const prefix =
    invoice.companyBrandKeySnapshot === "ELITE" ? "Diamond-Elite-Invoice" : "Diamond-Unique-Invoice";
  return `${prefix}-${invoice.invoiceNumber}.pdf`;
}

export function createInvoicePdfService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  return {
    async generateInvoicePdf(invoiceId: string): Promise<{ buffer: Buffer; filename: string }> {
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: { lines: { orderBy: { position: "asc" } } },
      });
      if (!invoice) throw invoiceNotFoundError();
      const buffer = await renderInvoicePdfBuffer(invoice);
      return { buffer, filename: invoicePdfFilename(invoice) };
    },
  };
}
