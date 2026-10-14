import { computeArchiveExtrasTotal } from "src/modules/archive/archive-sync.recompute";

export type ArchiveChargeSnapshot = {
  fuel: number | null;
  salik: number | null;
  parking: number | null;
  blackPoints: number | null;
  fines: number | null;
};

/** Server-side Archive `total` — extras only (excludes rentalTotal and payment columns). */
export function archiveTotalFromCharges(row: ArchiveChargeSnapshot): number | null {
  return computeArchiveExtrasTotal({
    fuel: row.fuel,
    salik: row.salik,
    parking: row.parking,
    blackPoints: row.blackPoints,
    fines: row.fines,
  });
}
