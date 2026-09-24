"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { Select } from "@/shared/components/ui/select";
import { useArchive } from "../../hooks/use-archive";
import type { ArchiveRow } from "../../types/archive.types";
import { resolveArchiveErrorMessage } from "../../utils/resolve-archive-error";
import { ArchiveDeleteRowDialog } from "../archive-delete-row-dialog/archive-delete-row-dialog";
import { ArchiveTable } from "../archive-table/archive-table";
import styles from "./archive-screen.module.css";

export function ArchiveScreen() {
  const t = useTranslations("Archive");
  const archive = useArchive();
  const [deleteTarget, setDeleteTarget] = useState<ArchiveRow | null>(null);

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
        <Button
          type="button"
          variant="secondary"
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
      </div>

      {exportError ? (
        <p className={styles.error} role="alert">{exportError}</p>
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
    </div>
  );
}
