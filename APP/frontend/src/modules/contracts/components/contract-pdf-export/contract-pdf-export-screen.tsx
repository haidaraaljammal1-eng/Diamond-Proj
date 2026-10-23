"use client";

import { useSyncExternalStore } from "react";
import { OfficialContractA4 } from "@/modules/public-rental/components/official-contract-a4/official-contract-a4";
import type { ContractPdfExportBootstrap } from "@/modules/contracts/components/contract-pdf-export/contract-pdf-export.types";
import styles from "./contract-pdf-export-screen.module.css";

declare global {
  interface Window {
    __DIAMOND_CONTRACT_PDF__?: ContractPdfExportBootstrap;
  }
}

const BOOTSTRAP_EVENT = "diamond-contract-pdf-bootstrap";

function readBootstrap(): ContractPdfExportBootstrap | null {
  if (typeof window === "undefined") return null;
  return window.__DIAMOND_CONTRACT_PDF__ ?? null;
}

function subscribeBootstrap(onChange: () => void) {
  window.addEventListener(BOOTSTRAP_EVENT, onChange);
  const interval = window.setInterval(onChange, 50);
  const stop = window.setTimeout(() => window.clearInterval(interval), 10_000);
  return () => {
    window.removeEventListener(BOOTSTRAP_EVENT, onChange);
    window.clearInterval(interval);
    window.clearTimeout(stop);
  };
}

interface ContractPdfExportScreenProps {
  initialPayload?: ContractPdfExportBootstrap | null;
}

/** Headless Playwright target — not linked from staff navigation. */
export function ContractPdfExportScreen({ initialPayload = null }: ContractPdfExportScreenProps) {
  const windowPayload = useSyncExternalStore(subscribeBootstrap, readBootstrap, () => null);
  const payload = initialPayload ?? windowPayload;

  if (!payload?.contract) {
    return (
      <div className={styles.wait} data-testid="contract-pdf-export-wait">
        …
      </div>
    );
  }

  return (
    <div className={styles.root} data-testid="contract-pdf-export-ready">
      <OfficialContractA4
        contract={payload.contract}
        mode="READONLY"
        signatureImageUrl={(slot) => payload.signatureImages[slot] ?? null}
      />
    </div>
  );
}
