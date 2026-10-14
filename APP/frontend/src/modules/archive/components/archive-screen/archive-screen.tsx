"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { Select } from "@/shared/components/ui/select";
import { useArchive } from "../../hooks/use-archive";
import type { ArchiveRow } from "../../types/archive.types";
import { resolveArchiveErrorMessage } from "../../utils/resolve-archive-error";
import { ArchiveDeleteRowDialog } from "../archive-delete-row-dialog/archive-delete-row-dialog";
import { ArchiveImportPreviewDialog } from "../archive-import-preview-dialog/archive-import-preview-dialog";
import { ArchiveTable } from "../archive-table/archive-table";
import styles from "./archive-screen.module.css";

export function ArchiveScreen() {
  const t = useTranslations("Archive");
  const archive = useArchive();
  const [deleteTarget, setDeleteTarget] = useState<ArchiveRow | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleVehicleChange = useCallback(
    (value: string | null) => {
      void archive.selectVehicle(value ? Number(value) : null);
    },
    [archive],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    const ok = await archive.deleteRow(deleteTarget.id);
    if (ok) setDeleteTarget(null);
  }, [archive, deleteTarget]);

  const vehiclesError = resolveArchiveErrorMessage(t, archive.vehiclesError);
  const rowsError = resolveArchiveErrorMessage(t, archive.rowsError);
  const createError = resolveArchiveErrorMessage(t, archive.createError);
  const exportError = resolveArchiveErrorMessage(t, archive.exportError);
  const importPreviewError = resolveArchiveErrorMessage(t, archive.importPreviewError);
  const syncError = resolveArchiveErrorMessage(t, archive.syncError);

  const lastSyncLabel =
    archive.syncStatus?.lastSuccessfulSyncAt ?? archive.syncResult?.lastSuccessfulSyncAt;

  if (!archive.isAllowed) {
    return (
      <div className={styles.page}>
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <section className={styles.denied} role="status">
          <p className={styles.deniedTitle}>{t("denied.title")}</p>
          <p>{t("denied.description")}</p>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page} data-testid="archive-screen">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          archive.selectedVehicleId ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void archive.refreshRows()}
              disabled={archive.rowsLoading}
            >
              {t("actions.refresh")}
            </Button>
          ) : null
        }
      />

      <div className={styles.toolbar}>
        <label className={styles.selectorLabel} data-testid="archive-vehicle-select">
          <span>{t("vehicleSelect.label")}</span>
          <Select
            options={archive.vehicleOptions}
            value={archive.selectedVehicleId ? String(archive.selectedVehicleId) : null}
            onChange={handleVehicleChange}
            searchable
            placeholder={t("vehicleSelect.placeholder")}
            disabled={archive.vehiclesLoading}
            variant="ghost"
            size="sm"
          />
        </label>
        <div className={styles.excelActions}>
        <Button
          type="button"
          variant="primary"
          size="sm"
          data-testid="archive-download-excel"
          disabled={
            archive.isExporting ||
            archive.hasFailedCellEdits ||
            archive.vehiclesLoading
          }
          onClick={() => {
            archive.clearExportError();
            void archive.exportExcel();
          }}
        >
          {archive.isExporting ? t("actions.downloadingExcel") : t("actions.downloadExcel")}
        </Button>
        {archive.canImport ? (
          <>
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className={styles.hiddenFileInput}
              data-testid="archive-import-file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void archive.previewImportFile(file);
              }}
            />
            <Button
              type="button"
              variant="primary"
              size="sm"
              data-testid="archive-import-excel"
              disabled={
                archive.isImportPreviewLoading ||
                archive.isImportConfirming ||
                archive.hasFailedCellEdits
              }
              onClick={() => importInputRef.current?.click()}
            >
              {archive.isImportPreviewLoading
                ? t("actions.importingExcel")
                : t("actions.importExcel")}
            </Button>
          </>
        ) : null}
        {archive.canManage ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            data-testid="archive-sync"
            disabled={
              archive.isSyncing ||
              archive.hasFailedCellEdits ||
              archive.isImportPreviewLoading ||
              archive.isImportConfirming
            }
            onClick={() => void archive.runArchiveSync()}
          >
            {archive.isSyncing ? t("actions.syncingArchive") : t("actions.syncArchive")}
          </Button>
        ) : null}
        </div>
      </div>

      {lastSyncLabel && archive.canManage && !archive.syncResult ? (
        <p className={styles.syncMeta}>
          {t("sync.lastSuccessful")}:{" "}
          {new Date(lastSyncLabel).toLocaleString()}
        </p>
      ) : null}

      {archive.syncResult ? (
        <section className={styles.syncSummary} data-testid="archive-sync-summary">
          <p className={styles.syncSummaryTitle}>{t("sync.successTitle")}</p>
          <div className={styles.syncSummaryGrid}>
            <span>{t("sync.created")}: {archive.syncResult.created}</span>
            <span>{t("sync.updated")}: {archive.syncResult.updated}</span>
          </div>
          {archive.syncResult.failed > 0 ? (
            <p className={styles.syncSummaryError} role="alert">
              {t("sync.partialFailure", { count: archive.syncResult.failed })}
            </p>
          ) : null}
          {lastSyncLabel ? (
            <p className={styles.syncMeta}>
              {t("sync.lastSuccessful")}: {new Date(lastSyncLabel).toLocaleString()}
            </p>
          ) : null}
          <div className={styles.syncSummaryActions}>
            <Button type="button" variant="secondary" size="sm" onClick={() => archive.dismissSyncResult()}>
              {t("sync.dismiss")}
            </Button>
          </div>
        </section>
      ) : null}

      {syncError ? (
        <p className={styles.error} role="alert">{syncError}</p>
      ) : null}

      {exportError ? (
        <p className={styles.error} role="alert">{exportError}</p>
      ) : null}

      {importPreviewError && !archive.importPreviewOpen ? (
        <p className={styles.error} role="alert">{importPreviewError}</p>
      ) : null}

      {vehiclesError ? (
        <p className={styles.error} role="alert">{vehiclesError}</p>
      ) : null}

      {archive.vehiclesLoading ? (
        <p className={styles.loading} role="status">{t("loading.vehicles")}</p>
      ) : null}

      {!archive.selectedVehicleId ? (
        <EmptyState
          title={t("emptySelection.title")}
          description={t("emptySelection.description")}
        />
      ) : null}

      {archive.selectedVehicleId && archive.selectedVehicleHeader ? (
        <>
          {rowsError ? <p className={styles.error} role="alert">{rowsError}</p> : null}
          {createError ? <p className={styles.error} role="alert">{createError}</p> : null}
          {archive.rowsLoading && !archive.rowsReady ? (
            <p className={styles.loading} role="status">{t("loading.rows")}</p>
          ) : (
            <ArchiveTable
              vehicleHeader={archive.selectedVehicleHeader}
              rows={archive.rows}
              canManage={archive.canManage}
              isCreatingRow={archive.isCreatingRow}
              deletingRowId={archive.deletingRowId}
              savingCells={archive.savingCells}
              cellErrors={archive.cellErrors}
              onAddRow={() => void archive.createRow()}
              onDeleteRow={setDeleteTarget}
              onSaveCell={archive.patchCell}
              onClearCellError={archive.clearCellError}
            />
          )}
        </>
      ) : null}

      <ArchiveDeleteRowDialog
        open={deleteTarget !== null}
        rowOrder={deleteTarget?.rowOrder ?? null}
        isDeleting={deleteTarget ? archive.deletingRowId === deleteTarget.id : false}
        error={archive.deleteError}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteConfirm()}
      />

      <ArchiveImportPreviewDialog
        open={archive.importPreviewOpen}
        preview={archive.importPreview}
        isLoading={archive.isImportPreviewLoading}
        previewError={importPreviewError}
        isConfirming={archive.isImportConfirming}
        confirmError={archive.importConfirmError}
        importSuccess={archive.importSuccess}
        onClose={() => archive.closeImportPreview()}
        onConfirm={() => void archive.confirmImport()}
      />
    </div>
  );
}
