import path from "node:path";
import type { InvoiceBrandKey } from "src/modules/invoices/invoice-company-branding";

const ASSETS_DIR = path.join(__dirname, "assets");

const LOGO_FILES: Record<InvoiceBrandKey, string> = {
  ELITE: "diamond-elite-invoice-logo.png",
  UNIQUE: "diamond-unique-invoice-logo.png",
};

/** Absolute path to the official raster logo for PDF rendering (no network). */
export function invoiceLogoAssetPath(brandKey: InvoiceBrandKey): string {
  return path.join(ASSETS_DIR, LOGO_FILES[brandKey]);
}

export const INVOICE_LOGO_DISPLAY_WIDTH_PT = 210;
