import type { OperatingCompany } from "@prisma/client";

export type InvoiceBrandKey = "ELITE" | "UNIQUE";

export interface InvoiceCompanyBranding {
  brandKey: InvoiceBrandKey;
  displayName: string;
  legalHeaderEn: string;
  serviceLabelRental: string;
  addressLine: string;
  email: string;
  pdfFilenamePrefix: string;
}

const BRANDING: Record<InvoiceBrandKey, Omit<InvoiceCompanyBranding, "brandKey">> = {
  ELITE: {
    displayName: "DIAMOND ELITE RENT CAR",
    legalHeaderEn: "DIAMOND ELITE CAR RENTALS CO. LLC S.O.C",
    serviceLabelRental: "Rental Income",
    addressLine: "Dubai, United Arab Emirates",
    email: "info@diamondelite.ae",
    pdfFilenamePrefix: "Diamond-Elite-Invoice",
  },
  UNIQUE: {
    displayName: "DIAMOND UNIQUE RENT CAR",
    legalHeaderEn: "DIAMOND UNIQUE CAR RENTALS CO. LLC S.O.C",
    serviceLabelRental: "Car Rental Income",
    addressLine: "Dubai, United Arab Emirates",
    email: "info@diamondunique.ae",
    pdfFilenamePrefix: "Diamond-Unique-Invoice",
  },
};

export function resolveInvoiceBrandKey(company: Pick<OperatingCompany, "code">): InvoiceBrandKey {
  const code = company.code.trim().toUpperCase();
  if (code === "ELITE") return "ELITE";
  if (code === "UNIQUE") return "UNIQUE";
  return "UNIQUE";
}

export function invoiceBrandingForCompany(company: OperatingCompany): InvoiceCompanyBranding {
  const brandKey = resolveInvoiceBrandKey(company);
  const base = BRANDING[brandKey];
  return {
    brandKey,
    displayName: base.displayName,
    legalHeaderEn: company.legalNameEn.trim() || base.legalHeaderEn,
    serviceLabelRental: base.serviceLabelRental,
    addressLine: base.addressLine,
    email: base.email,
    pdfFilenamePrefix: base.pdfFilenamePrefix,
  };
}
