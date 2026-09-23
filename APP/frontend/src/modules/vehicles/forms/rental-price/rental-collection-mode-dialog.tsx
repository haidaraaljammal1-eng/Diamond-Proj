"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import type { RentalCollectionMode } from "@/modules/contracts/types/contract.types";
import styles from "./rental-collection-mode-dialog.module.css";

export interface RentalCollectionModeDialogProps {
  open: boolean;
  onClose: () => void;
  onContinue: (mode: RentalCollectionMode) => void;
}

export function RentalCollectionModeDialog({
  open,
  onClose,
  onContinue,
}: RentalCollectionModeDialogProps) {
  const t = useTranslations("Vehicles");
  const [mode, setMode] = useState<RentalCollectionMode | null>(null);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("collectionMode.title")}
      description={t("collectionMode.description")}
      closeLabel={t("setPrice.cancel")}
    >
      <div
        className={styles.options}
        role="radiogroup"
        aria-label={t("collectionMode.title")}
        data-testid="rental-collection-mode-options"
      >
        <button
          type="button"
          role="radio"
          aria-checked={mode === "ELECTRONIC"}
          className={[styles.option, mode === "ELECTRONIC" ? styles.selected : ""]
            .filter(Boolean)
            .join(" ")}
          onClick={() => setMode("ELECTRONIC")}
          data-testid="rental-collection-mode-electronic"
        >
          <span className={styles.icon} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <path d="M2 10h20" />
            </svg>
          </span>
          <span className={styles.copy}>
            <strong>{t("collectionMode.electronic.title")}</strong>
            <span>{t("collectionMode.electronic.description")}</span>
          </span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === "CASH"}
          className={[styles.option, mode === "CASH" ? styles.selected : ""]
            .filter(Boolean)
            .join(" ")}
          onClick={() => setMode("CASH")}
          data-testid="rental-collection-mode-cash"
        >
          <span className={styles.icon} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75">
              <rect x="2" y="6" width="20" height="12" rx="2" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
          </span>
          <span className={styles.copy}>
            <strong>{t("collectionMode.cash.title")}</strong>
            <span>{t("collectionMode.cash.description")}</span>
          </span>
        </button>
      </div>
      <div className={styles.actions}>
        <Button type="button" variant="ghost" size="md" onClick={onClose}>
          {t("setPrice.cancel")}
        </Button>
        <Button
          type="button"
          size="md"
          disabled={!mode}
          onClick={() => {
            if (!mode) return;
            onContinue(mode);
          }}
        >
          {t("collectionMode.continue")}
        </Button>
      </div>
    </Dialog>
  );
}
