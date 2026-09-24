"use client";

import { create } from "zustand";
import { ApiRequestError, normalizeApiError } from "@/infrastructure/api/errors";
import {
  createArchiveRow,
  deleteArchiveRow,
  downloadArchiveExport,
  listArchiveRows,
  listArchiveVehicles,
  updateArchiveRow,
} from "../api/archive.api";
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
  loadVehicles: () => Promise<void>;
  selectVehicle: (vehicleId: number | null) => Promise<void>;
  refreshRows: () => Promise<void>;
  createRow: () => Promise<ArchiveRow | null>;
  patchCell: (
    rowId: number,
    field: ArchiveEditableField,
    patch: ArchiveRowPatch,
  ) => Promise<boolean>;
  deleteRow: (rowId: number) => Promise<boolean>;
  clearCellError: (rowId: number, field: ArchiveEditableField) => void;
  exportExcel: () => Promise<boolean>;
  clearExportError: () => void;
}

let vehiclesInFlight: Promise<void> | null = null;
let rowsRequestId = 0;
let exportInFlight: Promise<boolean> | null = null;

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
}));
