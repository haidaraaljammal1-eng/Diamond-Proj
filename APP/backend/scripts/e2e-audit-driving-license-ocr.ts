/**
 * Audits driving-licence OCR persistence for Playwright B7.
 * Usage: npx tsx scripts/e2e-audit-driving-license-ocr.ts --token=<rentalToken>
 */
import "./e2e-script-env";
import { hashToken } from "src/lib/security/tokens";
import { buildApp } from "src/app";

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

function formatDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

async function main() {
  const token = arg("token");
  if (!token) throw new Error("Pass --token=<rentalToken>");

  const app = await buildApp();
  const prisma = app.prisma;

  const ctxRes = await app.inject({ method: "GET", url: `/contracts/rental/${token}` });
  if (ctxRes.statusCode !== 200) {
    throw new Error(`GET context failed (${ctxRes.statusCode}): ${ctxRes.body}`);
  }
  const ctx = ctxRes.json().data;

  const contractNumber = ctx.contract.contractNumber as string;
  const contract = await prisma.contract.findFirst({
    where: { contractNumber },
    select: { id: true },
  });
  if (!contract) throw new Error(`Contract not found: ${contractNumber}`);

  const document = await prisma.contractDocument.findFirst({
    where: {
      contractId: contract.id,
      type: "DRIVING_LICENSE",
      supersededAt: null,
    },
    orderBy: { createdAt: "desc" },
  });
  const extraction = document
    ? await prisma.drivingLicenseExtraction.findUnique({
        where: { documentId: document.id },
      })
    : null;
  const verification = await prisma.drivingLicenseVerification.findFirst({
    where: { contractId: contract.id },
    orderBy: { createdAt: "desc" },
  });
  const customer = await prisma.customer.findFirst({
    where: { contracts: { some: { id: contract.id } } },
  });

  const payload = {
    contractId: contract.id,
    contractNumber,
    contextHasExtraction: Boolean(ctx.drivingLicenseExtraction),
    licenseVerificationStatus: ctx.licenseVerification?.status ?? null,
    documentId: document?.id ?? null,
    extraction: extraction
      ? {
          id: extraction.id,
          placeOfIssue: extraction.placeOfIssue,
          holderNameEn: extraction.holderNameEn,
          licenseNumber: extraction.licenseNumber,
          engineDocumentStatus: extraction.engineDocumentStatus,
        }
      : null,
    verification: verification
      ? {
          id: verification.id,
          status: verification.status,
          extractionId: verification.extractionId,
          licenseNumber: verification.licenseNumber,
        }
      : null,
    customer: customer
      ? {
          name: customer.name,
          nationality: customer.nationality,
          dateOfBirth: formatDate(customer.dateOfBirth),
          drivingLicenseIssueDate: formatDate(customer.drivingLicenseIssueDate),
          drivingLicensePlaceOfIssue: customer.drivingLicensePlaceOfIssue,
          drivingLicenseNumber: customer.drivingLicenseNumber,
          drivingLicenseExpiry: formatDate(customer.drivingLicenseExpiry),
        }
      : null,
  };

  console.log(`E2E_DL_OCR_AUDIT_JSON=${JSON.stringify(payload)}`);
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
