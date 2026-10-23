import { ContractPdfExportScreen } from "@/modules/contracts/components/contract-pdf-export/contract-pdf-export-screen";
import type { ContractPdfExportBootstrap } from "@/modules/contracts/components/contract-pdf-export/contract-pdf-export.types";

interface ContractPdfExportPageProps {
  searchParams: Promise<{ b?: string }>;
}

function decodeBootstrap(raw: string | undefined): ContractPdfExportBootstrap | null {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as ContractPdfExportBootstrap;
  } catch {
    return null;
  }
}

/** Headless Playwright target — not linked from staff navigation. */
export default async function ContractPdfExportPage({ searchParams }: ContractPdfExportPageProps) {
  const { b } = await searchParams;
  const initialPayload = decodeBootstrap(b);
  return <ContractPdfExportScreen initialPayload={initialPayload} />;
}
