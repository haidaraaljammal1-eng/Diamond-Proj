import { ContractPdfExportScreen } from "@/modules/contracts/components/contract-pdf-export/contract-pdf-export-screen";
import type { ContractPdfExportBootstrap } from "@/modules/contracts/components/contract-pdf-export/contract-pdf-export.types";

interface ContractPdfExportPageProps {
  searchParams: Promise<{ t?: string; b?: string }>;
}

async function loadBootstrapFromToken(token: string): Promise<ContractPdfExportBootstrap | null> {
  const backend = (
    process.env.CONTRACT_PDF_BACKEND_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://127.0.0.1:3002"
  ).replace(/\/$/, "");
  try {
    const res = await fetch(`${backend}/contracts/pdf-render/bootstrap/${token}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: ContractPdfExportBootstrap };
    return json.data ?? null;
  } catch {
    return null;
  }
}

/** @deprecated Legacy query bootstrap — do not use for new PDF renders. */
function decodeLegacyBootstrap(raw: string | undefined): ContractPdfExportBootstrap | null {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as ContractPdfExportBootstrap;
  } catch {
    return null;
  }
}

/** Headless Playwright target — not linked from staff navigation. */
export default async function ContractPdfExportPage({ searchParams }: ContractPdfExportPageProps) {
  const { t, b } = await searchParams;
  const initialPayload = t ? await loadBootstrapFromToken(t) : decodeLegacyBootstrap(b);
  return <ContractPdfExportScreen initialPayload={initialPayload} />;
}
