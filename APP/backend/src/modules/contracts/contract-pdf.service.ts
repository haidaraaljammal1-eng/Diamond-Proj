import { Readable } from "node:stream";
import type { OfficialContractSignatureSlot } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { env } from "src/config/env";
import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";
import type { ContractDetail, OfficialContractView } from "src/modules/contracts/contracts.schema";
import {
  buildContractPdfOfficialView,
  contractPdfFilename,
} from "src/modules/contracts/contract-pdf-view";
import { createContractsService } from "src/modules/contracts/contracts.service";
export type ContractPdfSignatureImages = Partial<
  Record<"hirer" | "additionalDriver" | "sponsor" | "vehicleOutHirer", string>
>;

async function streamToDataUrl(stream: Readable, mimeType: string): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const base64 = Buffer.concat(chunks).toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

const STAFF_SIGNATURE_SLOTS: Array<{
  key: keyof ContractPdfSignatureImages;
  slot: OfficialContractSignatureSlot;
  path: "hirer" | "additional-driver" | "sponsor";
}> = [
  { key: "hirer", slot: "HIRER", path: "hirer" },
  { key: "additionalDriver", slot: "ADDITIONAL_DRIVER", path: "additional-driver" },
  { key: "sponsor", slot: "SPONSOR", path: "sponsor" },
];

export function createContractPdfService(fastify: FastifyInstance) {
  const contracts = createContractsService(fastify);

  async function loadHistoricalCompany(detail: ContractDetail) {
    const row = await fastify.prisma.operatingCompany.findUnique({
      where: { id: detail.company.id },
      select: {
        code: true,
        displayName: true,
        legalNameAr: true,
        legalNameEn: true,
        accentColor: true,
      },
    });
    return row ?? undefined;
  }

  async function resolveOfficialView(detail: ContractDetail): Promise<OfficialContractView | null> {
    const company = await loadHistoricalCompany(detail);
    const draft = await contracts.getOfficialContractDraft(detail.id);
    return buildContractPdfOfficialView(detail, draft, company);
  }

  async function loadSignatureImages(
    contractId: string,
    view: OfficialContractView,
    detail: ContractDetail,
  ): Promise<ContractPdfSignatureImages> {
    const images: ContractPdfSignatureImages = {};
    for (const { key, slot } of STAFF_SIGNATURE_SLOTS) {
      if (!view.signatures[key]?.hasImage) continue;
      try {
        const { mimeType, stream } = await contracts.openStaffOfficialSignature(contractId, slot);
        images[key] = await streamToDataUrl(stream, mimeType);
      } catch {
        /* signed status remains without image */
      }
    }
    if (view.signatures.vehicleOutHirer.hasImage && detail.carOutHandover.signature.present) {
      try {
        const { mimeType, stream } = await contracts.openCarOutSignatureStream(contractId);
        images.vehicleOutHirer = await streamToDataUrl(stream, mimeType);
      } catch {
        /* optional */
      }
    }
    return images;
  }

  async function renderPdfBuffer(payload: {
    contract: OfficialContractView;
    signatureImages: ContractPdfSignatureImages;
  }): Promise<Buffer> {
    const baseUrl = (env.CONTRACT_PDF_FRONTEND_BASE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
    const locale = env.CONTRACT_PDF_LOCALE || "en";
    const bootstrapQuery = encodeURIComponent(JSON.stringify(payload));
    const target = `${baseUrl}/${locale}/internal/contract-pdf?b=${bootstrapQuery}`;

    let chromium: typeof import("playwright").chromium;
    try {
      chromium = (await import("playwright")).chromium;
    } catch {
      throw new AppError({
        code: ErrorCode.INTERNAL_ERROR,
        message: "Contract PDF rendering is unavailable (Playwright not installed).",
        statusCode: 503,
      });
    }

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForSelector('[data-testid="contract-pdf-export-ready"]', {
        state: "attached",
        timeout: 45_000,
      });
      await page.waitForSelector('[data-testid="official-contract-a4"]', {
        state: "visible",
        timeout: 45_000,
      });
      await page.waitForFunction(() => document.fonts?.ready ?? true, { timeout: 15_000 }).catch(() => undefined);
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  return {
    async generateContractPdf(contractId: string): Promise<{ buffer: Buffer; filename: string }> {
      const detail = await contracts.get(contractId);
      const contract = await resolveOfficialView(detail);
      if (!contract) {
        throw new AppError({
          code: ErrorCode.VALIDATION_ERROR,
          message: "Official contract is not available for this rental.",
          statusCode: 404,
        });
      }
      const signatureImages = await loadSignatureImages(contractId, contract, detail);
      const buffer = await renderPdfBuffer({ contract, signatureImages });
      return { buffer, filename: contractPdfFilename(detail.contractNumber) };
    },
  };
}
