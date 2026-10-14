"use client";

import { create } from "zustand";
import { ApiRequestError, normalizeApiError } from "@/infrastructure/api/errors";
import {
  createArchiveRow,
  deleteArchiveRow,
  confirmArchiveImport,
  downloadArchiveExport,
  listArchiveRows,
  listArchiveVehicles,
  previewArchiveImport,
  syncArchive,
  getArchiveSyncStatus,
  restoreArchiveChargeField,
  updateArchiveRow,
} from "../api/archive.api";
import type { ArchiveSyncAutoField } from "../utils/archive-columns";
import type { ArchiveSyncResult, ArchiveSyncStatus } from "../types/archive-sync.types";
import type { ArchiveImportPreview } from "../types/archive-import.types";
import { commitAllArchiveCellDrafts } from "../utils/archive-edit-registry";
import type {
  ArchiveEditableField,
  ArchiveRow,
  ArchiveRowPatch,
  ArchiveVehicle,
} from "../types/archive.types";

export type ArchiveLoadStatus = "idle" | "loading" | "ready" | "error";

function cellKey(rowId: number, field: ArchiveEditableField): string {
  return `${rowId}:${field}`;
}

interface ArchiveState {
  vehicles: ArchiveVehicle[];
  vehiclesStatus: ArchiveLoadStatus;
  vehiclesError: ApiRequestError | null;
  selectedVehicleId: number | null;
  rows: ArchiveRow[];
  rowsStatus: ArchiveLoadStatus;
  rowsError: ApiRequestError | null;
  isCreatingRow: boolean;
  createError: ApiRequestError | null;
  deletingRowId: number | null;
  deleteError: ApiRequestError | null;
  savingCells: Record<string, boolean>;
  cellErrors: Record<string, ApiRequestError | null>;
  isExporting: boolean;
  exportError: ApiRequestError | null;
  importPreview: ArchiveImportPreview | null;
  importPreviewOpen: boolean;
  isImportPreviewLoading: boolean;
  importPreviewError: ApiRequestError | null;
  isImportConfirming: boolean;
  importConfirmError: ApiRequestError | null;
  importSuccess: boolean;
  syncStatus: ArchiveSyncStatus | null;
  isSyncing: boolean;
  syncError: ApiRequestError | null;
  syncResult: ArchiveSyncResult | null;
  loadVehicles: () => Promise<void>;
  selectVehicle: (vehicleId: number | null) => Promise<void>;
  refreshRows: () => Promise<void>;
  createRow: () => Promise<ArchiveRow | null>;
  patchCell: (
    rowId: number,
    field: ArchiveEditableField,
    patch: ArchiveRowPatch,
  ) => Promise<boolean>;
  restoreChargeField: (rowId: number, field: ArchiveSyncAutoField) => Promise<boolean>;
  deleteRow: (rowId: number) => Promise<boolean>;
  clearCellError: (rowId: number, field: ArchiveEditableField) => void;
  exportExcel: () => Promise<boolean>;
  clearExportError: () => void;
  previewImportFile: (file: File) => Promise<void>;
  confirmImport: () => Promise<boolean>;
  closeImportPreview: () => void;
  loadSyncStatus: () => Promise<void>;
  runArchiveSync: () => Promise<boolean>;
  dismissSyncResult: () => void;
}

let vehiclesInFlight: Promise<void> | null = null;
let rowsRequestId = 0;
let exportInFlight: Promise<boolean> | null = null;
let syncInFlight: Promise<boolean> | null = null;

function hasFailedCellEdits(cellErrors: Record<string, ApiRequestError | null>): boolean {
  return Object.values(cellErrors).some((error) => error !== null);
}

async function waitForArchiveSaves(
  readSavingCells: () => Record<string, boolean>,
  timeoutMs = 15_000,
): Promise<boolean> {
  const started = Date.now();
  while (Object.values(readSavingCells()).some(Boolean)) {
    if (Date.now() - started > timeoutMs) return false;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return true;
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export const useArchiveStore = create<ArchiveState>((set, get) => ({
  vehicles: [],
  vehiclesStatus: "idle",
  vehiclesError: null,
  selectedVehicleId: null,
  rows: [],
  rowsStatus: "idle",
  rowsError: null,
  isCreatingRow: false,
  createError: null,
  deletingRowId: null,
  deleteError: null,
  savingCells: {},
  cellErrors: {},
  isExporting: false,
  exportError: null,
  importPreview: null,
  importPreviewOpen: false,
  isImportPreviewLoading: false,
  importPreviewError: null,
  isImportConfirming: false,
  importConfirmError: null,
  importSuccess: false,
  syncStatus: null,
  isSyncing: false,
  syncError: null,
  syncResult: null,

  async loadVehicles() {
    if (vehiclesInFlight) return vehiclesInFlight;
    set({ vehiclesStatus: "loading", vehiclesError: null });
    vehiclesInFlight = (async () => {
      try {
        const vehicles = await listArchiveVehicles();
        set({ vehicles, vehiclesStatus: "ready", vehiclesError: null });
      } catch (error) {
        set({
          vehiclesStatus: "error",
          vehiclesError: normalizeApiError(error),
        });
      } finally {
        vehiclesInFlight = null;
      }
    })();
    return vehiclesInFlight;
  },

  async selectVehicle(vehicleId) {
    rowsRequestId += 1;
    set({
      selectedVehicleId: vehicleId,
      rows: [],
      rowsStatus: vehicleId ? "loading" : "idle",
      rowsError: null,
      savingCells: {},
      cellErrors: {},
    });
    if (!vehicleId) return;
    await get().refreshRows();
  },

  async refreshRows() {
    const vehicleId = get().selectedVehicleId;
    if (!vehicleId) return;
    const requestId = ++rowsRequestId;
    set({ rowsStatus: "loading", rowsError: null });
    try {
      const rows = await listArchiveRows(vehicleId);
      if (requestId !== rowsRequestId || get().selectedVehicleId !== vehicleId) return;
      set({ rows, rowsStatus: "ready", rowsError: null });
    } catch (error) {
      if (requestId !== rowsRequestId || get().selectedVehicleId !== vehicleId) return;
      set({
        rowsStatus: "error",
        rowsError: normalizeApiError(error),
      });
    }
  },

  async createRow() {
    const vehicleId = get().selectedVehicleId;
    if (!vehicleId) return null;
    set({ isCreatingRow: true, createError: null });
    try {
      const row = await createArchiveRow(vehicleId);
      if (get().selectedVehicleId !== vehicleId) {
        set({ isCreatingRow: false });
        return null;
      }
      set((state) => ({
        rows: [...state.rows, row].sort((a, b) => a.rowOrder - b.rowOrder),
        isCreatingRow: false,
        createError: null,
      }));
      return row;
    } catch (error) {
      if (get().selectedVehicleId !== vehicleId) {
        set({ isCreatingRow: false });
        return null;
      }
      set({ isCreatingRow: false, createError: normalizeApiError(error) });
      return null;
    }
  },

  async patchCell(rowId, field, patch) {
    const vehicleId = get().selectedVehicleId;
    const existing = get().rows.find((row) => row.id === rowId);
    if (!vehicleId || !existing || existing.vehicleId !== vehicleId) return false;

    const key = cellKey(rowId, field);
    set((state) => ({
      savingCells: { ...state.savingCells, [key]: true },
      cellErrors: { ...state.cellErrors, [key]: null },
    }));
    try {
      const updated = await updateArchiveRow(rowId, patch);
      if (get().selectedVehicleId !== vehicleId) {
        set((state) => ({
          savingCells: { ...state.savingCells, [key]: false },
        }));
        return false;
      }
      set((state) => {
        if (!state.rows.some((row) => row.id === rowId)) {
          return {
            savingCells: { ...state.savingCells, [key]: false },
          };
        }
        return {
          rows: state.rows.map((row) => (row.id === rowId ? updated : row)),
          savingCells: { ...state.savingCells, [key]: false },
        };
      });
      return true;
    } catch (error) {
      if (get().selectedVehicleId !== vehicleId) {
        set((state) => ({
          savingCells: { ...state.savingCells, [key]: false },
        }));
        return false;
      }
      const apiError = normalizeApiError(error);
      set((state) => ({
        savingCells: { ...state.savingCells, [key]: false },
        cellErrors: { ...state.cellErrors, [key]: apiError },
      }));
      return false;
    }
  },

  async restoreChargeField(rowId, field) {
    const vehicleId = get().selectedVehicleId;
    const existing = get().rows.find((row) => row.id === rowId);
    if (!vehicleId || !existing || existing.vehicleId !== vehicleId) return false;

    const key = cellKey(rowId, field);
    set((state) => ({
      savingCells: { ...state.savingCells, [key]: true },
      cellErrors: { ...state.cellErrors, [key]: null },
    }));
    try {
      const updated = await restoreArchiveChargeField(rowId, field);
      if (get().selectedVehicleId !== vehicleId) {
        set((state) => ({
          savingCells: { ...state.savingCells, [key]: false },
        }));
        return false;
      }
      set((state) => ({
        rows: state.rows.map((row) => (row.id === rowId ? updated : row)),
        savingCells: { ...state.savingCells, [key]: false },
      }));
      return true;
    } catch (error) {
      if (get().selectedVehicleId !== vehicleId) {
        set((state) => ({
          savingCells: { ...state.savingCells, [key]: false },
        }));
        return false;
      }
      const apiError = normalizeApiError(error);
      set((state) => ({
        savingCells: { ...state.savingCells, [key]: false },
        cellErrors: { ...state.cellErrors, [key]: apiError },
      }));
      return false;
    }
  },

  async deleteRow(rowId) {
    const vehicleId = get().selectedVehicleId;
    const existing = get().rows.find((row) => row.id === rowId);
    if (!vehicleId || !existing || existing.vehicleId !== vehicleId) return false;

    set({ deletingRowId: rowId, deleteError: null });
    try {
      await deleteArchiveRow(rowId);
      if (get().selectedVehicleId !== vehicleId) {
        set({ deletingRowId: null });
        return false;
      }
      set((state) => ({
        rows: state.rows.filter((row) => row.id !== rowId),
        deletingRowId: null,
        deleteError: null,
      }));
      return true;
    } catch (error) {
      if (get().selectedVehicleId !== vehicleId) {
        set({ deletingRowId: null });
        return false;
      }
      set({ deletingRowId: null, deleteError: normalizeApiError(error) });
      return false;
    }
  },

  clearCellError(rowId, field) {
    const key = cellKey(rowId, field);
    set((state) => ({
      cellErrors: { ...state.cellErrors, [key]: null },
    }));
  },

  clearExportError() {
    set({ exportError: null });
  },

  async exportExcel() {
    if (exportInFlight) return exportInFlight;

    exportInFlight = (async () => {
      set({ exportError: null });

      if (hasFailedCellEdits(get().cellErrors)) {
        set({
          exportError: new ApiRequestError(
            {
              code: "ARCHIVE_UNSAVED_CELL_ERROR",
              message: "Resolve failed archive edits before export",
            },
            400,
          ),
        });
        return false;
      }

      set({ isExporting: true });
      try {
        await commitAllArchiveCellDrafts();
        const savesCompleted = await waitForArchiveSaves(() => get().savingCells);
        if (!savesCompleted || hasFailedCellEdits(get().cellErrors)) {
          set({
            exportError: new ApiRequestError(
              {
                code: "ARCHIVE_UNSAVED_CELL_ERROR",
                message: "Resolve unsaved archive edits before export",
              },
              400,
            ),
          });
          return false;
        }

        const { blob, filename } = await downloadArchiveExport();
        triggerBrowserDownload(blob, filename);
        return true;
      } catch (error) {
        set({ exportError: normalizeApiError(error) });
        return false;
      } finally {
        set({ isExporting: false });
        exportInFlight = null;
      }
    })();

    return exportInFlight;
  },

  async previewImportFile(file) {
    set({
      isImportPreviewLoading: true,
      importPreviewError: null,
      importConfirmError: null,
      importSuccess: false,
      importPreviewOpen: true,
      importPreview: null,
    });
    try {
      const preview = await previewArchiveImport(file);
      set({
        importPreview: preview,
        isImportPreviewLoading: false,
        importPreviewOpen: true,
      });
    } catch (error) {
      set({
        isImportPreviewLoading: false,
        importPreviewError: normalizeApiError(error),
        importPreviewOpen: true,
      });
    }
  },

  async confirmImport() {
    const preview = get().importPreview;
    if (!preview?.importToken || !preview.canConfirm) return false;

    set({ isImportConfirming: true, importConfirmError: null });
    try {
      await commitAllArchiveCellDrafts();
      const savesCompleted = await waitForArchiveSaves(() => get().savingCells);
      if (!savesCompleted || hasFailedCellEdits(get().cellErrors)) {
        set({
          isImportConfirming: false,
          importConfirmError: new ApiRequestError(
            {
              code: "ARCHIVE_UNSAVED_CELL_ERROR",
              message: "Resolve unsaved archive edits before import",
            },
            400,
          ),
        });
        return false;
      }

      await confirmArchiveImport(preview.importToken);
      const selectedId = get().selectedVehicleId;
      const touchedSelected = preview.matchedVehicles.some((v) => v.vehicleId === selectedId);
      if (touchedSelected && selectedId) {
        await get().refreshRows();
      }
      set({
        isImportConfirming: false,
        importSuccess: true,
        importConfirmError: null,
      });
      return true;
    } catch (error) {
      set({
        isImportConfirming: false,
        importConfirmError: normalizeApiError(error),
      });
      return false;
    }
  },

  closeImportPreview() {
    set({
      importPreviewOpen: false,
      importPreview: null,
      isImportPreviewLoading: false,
      importPreviewError: null,
      isImportConfirming: false,
      importConfirmError: null,
      importSuccess: false,
    });
  },

  async loadSyncStatus() {
    try {
      const status = await getArchiveSyncStatus();
      set({ syncStatus: status });
    } catch {
      // UX-only; ignore status load errors
    }
  },

  dismissSyncResult() {
    set({ syncResult: null, syncError: null });
  },

  async runArchiveSync() {
    if (syncInFlight) return syncInFlight;

    syncInFlight = (async () => {
      set({ isSyncing: true, syncError: null, syncResult: null });
      try {
        await commitAllArchiveCellDrafts();
        const savesCompleted = await waitForArchiveSaves(() => get().savingCells);
        if (!savesCompleted || hasFailedCellEdits(get().cellErrors)) {
          set({
            isSyncing: false,
            syncError: new ApiRequestError(
              {
                code: "ARCHIVE_UNSAVED_CELL_ERROR",
                message: "Resolve unsaved archive edits before sync",
              },
              400,
            ),
          });
          return false;
        }

        const result = await syncArchive();
        const selectedId = get().selectedVehicleId;
        if (selectedId) {
          await get().refreshRows();
        }
        set({
          isSyncing: false,
          syncResult: result,
          syncStatus: {
            lastSuccessfulSyncAt: result.lastSuccessfulSyncAt,
            running: false,
            runningStartedAt: null,
          },
        });
        return true;
      } catch (error) {
        set({ isSyncing: false, syncError: normalizeApiError(error) });
        return false;
      } finally {
        syncInFlight = null;
      }
    })();

    return syncInFlight;
  },
}));
