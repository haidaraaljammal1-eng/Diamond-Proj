import type { DamageMark } from "@/modules/public-rental/types/official-contract.types";
import type { FuelLevel } from "../../types/contract.types";

/** "done" = saved on the server; "unsaved" = typed here but not yet persisted. */
export type CustodyItemState = "done" | "missing" | "unsaved" | "optional";

/** What the server currently holds for this custody event. */
export interface CustodySavedValues {
  mileage: number | null;
  fuel: string | null;
  damage: DamageMark[];
  signaturePresent: boolean;
}

/** What the staff member has typed/drawn in this dialog session. */
export interface CustodyDraftValues {
  mileage: string;
  fuel: FuelLevel | null;
  damage: DamageMark[];
  signatureDrawn: boolean;
}

export interface CustodyPhotoProgress {
  required: number;
  completed: number;
}

export interface CustodyLedgerModel {
  mileage: CustodyItemState;
  fuel: CustodyItemState;
  damage: CustodyItemState;
  signature: CustodyItemState;
  /** Saved detail requirements (mileage, fuel, signature) — damage is optional. */
  detailsDone: number;
  done: number;
  total: number;
  missingCount: number;
}

function sameDamage(a: DamageMark[], b: DamageMark[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Ledger state for one custody event (OUT or IN). Identical rules on both sides:
 * three required details plus the required photo slots, and a local edit reads
 * as "not saved" until the draft is persisted.
 */
export function custodyLedgerModel(
  saved: CustodySavedValues,
  draft: CustodyDraftValues,
  photos: CustodyPhotoProgress,
): CustodyLedgerModel {
  const savedMileage = saved.mileage == null ? "" : String(saved.mileage);
  const savedFuel = saved.fuel ?? null;
  const savedDamage = saved.damage ?? [];

  const mileage: CustodyItemState = draft.mileage.trim() !== savedMileage ? "unsaved" : savedMileage ? "done" : "missing";
  const fuel: CustodyItemState = (draft.fuel ?? null) !== savedFuel ? "unsaved" : savedFuel ? "done" : "missing";
  const damage: CustodyItemState = !sameDamage(draft.damage, savedDamage) ? "unsaved" : savedDamage.length ? "done" : "optional";
  const signature: CustodyItemState = draft.signatureDrawn ? "unsaved" : saved.signaturePresent ? "done" : "missing";

  const detailsDone = [mileage, fuel, signature].filter((state) => state === "done").length;
  const total = 3 + photos.required;
  const done = detailsDone + photos.completed;
  return { mileage, fuel, damage, signature, detailsDone, done, total, missingCount: total - done };
}
