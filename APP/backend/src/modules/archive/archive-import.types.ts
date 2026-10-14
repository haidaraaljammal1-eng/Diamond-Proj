import type { Prisma } from "@prisma/client";
import type { ArchiveManualOverridesDto } from "src/modules/archive/archive.schema";

export type ArchiveImportRowData = Omit<
  Prisma.ArchiveRowUncheckedCreateInput,
  "vehicleId" | "rowOrder" | "contractId"
>;

export interface ArchiveImportPreparedVehicle {
  vehicleId: number;
  sheetName: string;
  rows: ArchiveImportRowData[];
  /** Parallel to `rows` (index 0 = rowOrder 1). From hidden export metadata when present. */
  contractIds: Array<string | null>;
  /** Parallel to `rows`; `undefined` when legacy export has no meta row for that index. */
  manualOverridesByRow: Array<ArchiveManualOverridesDto | undefined>;
  /** Parallel to `rows`; from hidden export metadata when present. */
  manualCellValuesByRow: Array<Record<string, string> | undefined>;
}
