"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import type { ArchiveImportPreview } from "../../types/archive-import.types";
import { resolveArchiveErrorMessage } from "../../utils/resolve-archive-error";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import styles from "./archive-import-preview-dialog.module.css";

export interface ArchiveImportPreviewDialogProps {
  open: boolean;
  preview: ArchiveImportPreview | null;
  isLoading: boolean;
  previewError: string | null;
  isConfirming: boolean;
  confirmError: ApiRequestError | null;
  importSuccess: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function formatVehicleTitle(displayName: string, plateNumber: string | null): string {
  if (plateNumber?.trim()) {
    return `${displayName} — ${plateNumber}`;
  }
  return displayName;
}

export function ArchiveImportPreviewDialog({
  open,
  preview,
  isLoading,
  previewError,
  isConfirming,
  confirmError,
  importSuccess,
  onClose,
  onConfirm,
}: ArchiveImportPreviewDialogProps) {
  const t = useTranslations("Archive");
  const confirmErrorMessage = resolveArchiveErrorMessage(t, confirmError);
  const errorCount = preview?.summary.totalErrorCount ?? 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      closeLabel={t("actions.close")}
      title={t("import.previewTitle")}
      description={
        preview
          ? t("import.previewDescription", { filename: preview.filename })
          : t("import.previewDescriptionGeneric")
      }
    >
      {isLoading ? (
        <p className={styles.status} role="status">{t("import.analyzing")}</p>
      ) : null}
      {previewError ? <p className={styles.error} role="alert">{previewError}</p> : null}
      {!preview || isLoading ? null : importSuccess ? (
        <p className={styles.statusSuccess} role="status">{t("import.success")}</p>
      ) : (
        <div className={styles.content}>
          <section className={styles.stats} aria-label={t("import.previewTitle")}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>{t("import.summary.totalSheets")}</span>
              <span className={styles.statValue}>{preview.summary.totalSheets}</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>{t("import.summary.matched")}</span>
              <span className={styles.statValue}>{preview.summary.matchedVehicleCount}</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>{t("import.summary.matchedRows")}</span>
              <span className={styles.statValue}>{preview.summary.totalValidRows}</span>
            </div>
            <div
              className={styles.statCard}
              data-emphasis={errorCount > 0 ? "alert" : undefined}
            >
              <span className={styles.statLabel}>{t("import.summary.errors")}</span>
              <span className={styles.statValue}>{errorCount}</span>
            </div>
          </section>

          {preview.summary.unmatchedSheetCount > 0 ? (
            <p className={styles.unmatchedSummary}>
              {t("import.summary.unmatched")}: {preview.summary.unmatchedSheetCount}
            </p>
          ) : null}

          {preview.matchedVehicles.length > 0 ? (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>{t("import.matchedVehiclesTitle")}</h3>
              <ul className={styles.vehicleList}>
                {preview.matchedVehicles.map((vehicle) => (
                  <li key={vehicle.vehicleId} className={styles.vehicleRow}>
                    <div className={styles.vehicleIdentity}>
                      <p className={styles.vehicleName}>
                        {formatVehicleTitle(vehicle.displayName, vehicle.plateNumber)}
                      </p>
                      <p className={styles.vehicleSheet}>
                        {t("import.sheetLabel", { sheet: vehicle.sheetName })}
                      </p>
                    </div>
                    <dl className={styles.vehicleCounts}>
                      <div>
                        <dt>{t("import.existingRows")}</dt>
                        <dd>{vehicle.existingRowCount}</dd>
                      </div>
                      <div>
                        <dt>{t("import.importRows")}</dt>
                        <dd>{vehicle.importRowCount}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {preview.unmatchedSheets.length > 0 ? (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>{t("import.unmatchedTitle")}</h3>
              <ul className={styles.plainList}>
                {preview.unmatchedSheets.map((sheet) => (
                  <li key={sheet.sheetName} className={styles.plainListItem}>
                    <span className={styles.plainListPrimary}>{sheet.sheetName}</span>
                    {sheet.headerText ? (
                      <span className={styles.plainListMeta}>({sheet.headerText})</span>
                    ) : null}
                    <span className={styles.plainListReason}>{sheet.reason}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {preview.errors.length > 0 ? (
            <section className={styles.section} data-section="errors">
              <h3 className={styles.sectionTitle}>{t("import.errorsTitle")}</h3>
              <ul className={styles.errorList}>
                {preview.errors.slice(0, 20).map((error, index) => (
                  <li key={`${error.sheetName}-${error.row}-${error.column}-${index}`}>
                    {t("import.errorLine", {
                      sheet: error.sheetName,
                      row: error.row,
                      column: error.column,
                      value: error.value || "—",
                      reason: error.reason,
                    })}
                  </li>
                ))}
              </ul>
              {preview.errors.length > 20 ? (
                <p className={styles.moreErrors}>
                  {t("import.moreErrors", { count: preview.errors.length - 20 })}
                </p>
              ) : null}
            </section>
          ) : null}

          {confirmErrorMessage ? (
            <p className={styles.error} role="alert">{confirmErrorMessage}</p>
          ) : null}
        </div>
      )}

      <div className={styles.actions}>
        {importSuccess ? (
          <Button type="button" variant="primary" onClick={onClose}>
            {t("actions.close")}
          </Button>
        ) : preview ? (
          <>
            <Button type="button" variant="secondary" onClick={onClose} disabled={isConfirming}>
              {t("actions.cancel")}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={onConfirm}
              disabled={!preview.canConfirm || isConfirming}
              data-testid="archive-import-confirm"
            >
              {isConfirming ? t("import.confirming") : t("import.confirm")}
            </Button>
          </>
        ) : (
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("actions.close")}
          </Button>
        )}
      </div>
    </Dialog>
  );
}
