"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Icon } from "@/shared/components/ui/icon";
import { EmptyState } from "@/shared/components/ui/empty-state";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { ARCHIVE_COLUMNS } from "../../utils/archive-columns";
import { resolveArchiveErrorMessage } from "../../utils/resolve-archive-error";
import type { ArchiveEditableField, ArchiveRow } from "../../types/archive.types";
import { ArchiveEditableCell } from "../archive-editable-cell/archive-editable-cell";
import styles from "./archive-table.module.css";

export interface ArchiveTableProps {
  vehicleHeader: string;
  rows: ArchiveRow[];
  canManage: boolean;
  isCreatingRow: boolean;
  deletingRowId: number | null;
  savingCells: Record<string, boolean>;
  cellErrors: Record<string, ApiRequestError | null>;
  onAddRow: () => void;
  onDeleteRow: (row: ArchiveRow) => void;
  onSaveCell: (
    rowId: number,
    field: ArchiveEditableField,
    patch: Partial<ArchiveRow>,
  ) => Promise<boolean>;
  onClearCellError: (rowId: number, field: ArchiveEditableField) => void;
}

export function ArchiveTable({
  vehicleHeader,
  rows,
  canManage,
  isCreatingRow,
  deletingRowId,
  savingCells,
  cellErrors,
  onAddRow,
  onDeleteRow,
  onSaveCell,
  onClearCellError,
}: ArchiveTableProps) {
  const t = useTranslations("Archive");

  return (
    <section className={styles.panel} data-testid="archive-table">
      <div className={styles.vehicleHeader} data-testid="archive-vehicle-header">
        {vehicleHeader}
      </div>

      <div className={styles.scroll} data-testid="archive-table-scroll">
        <table className={styles.table}>
          <thead>
            <tr>
              {ARCHIVE_COLUMNS.map((column) => (
                <th
                  key={column.field}
                  scope="col"
                  className={styles[column.widthClass]}
                  data-testid={`archive-column-${column.field}`}
                >
                  {t(`columns.${column.labelKey}`)}
                </th>
              ))}
              {canManage ? (
                <th scope="col" className={styles.actionsCol}>{t("table.actions")}</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} data-testid={`archive-row-${row.id}`}>
                {ARCHIVE_COLUMNS.map((column) => {
                  const key = `${row.id}:${column.field}`;
                  const error = cellErrors[key] ?? null;
                  const errorMessage = resolveArchiveErrorMessage(t, error);
                  return (
                    <td key={column.field} className={styles[column.widthClass]}>
                      <ArchiveEditableCell
                        row={row}
                        column={column}
                        canManage={canManage}
                        isSaving={Boolean(savingCells[key])}
                        errorMessage={errorMessage}
                        onSave={onSaveCell}
                        onClearError={onClearCellError}
                      />
                    </td>
                  );
                })}
                {canManage ? (
                  <td className={styles.actionsCol}>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={deletingRowId === row.id}
                      onClick={() => onDeleteRow(row)}
                      aria-label={t("delete.rowAction", { rowOrder: row.rowOrder })}
                    >
                      <Icon name="mdi:trash-can-outline" size={16} />
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={t("emptyRows.title")}
          description={t("emptyRows.description")}
        />
      ) : null}

      {canManage ? (
        <div className={styles.footer}>
          <Button
            type="button"
            variant="primary"
            onClick={onAddRow}
            disabled={isCreatingRow}
            data-testid="archive-add-row"
          >
            {isCreatingRow ? t("actions.addingRow") : t("actions.addRow")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
