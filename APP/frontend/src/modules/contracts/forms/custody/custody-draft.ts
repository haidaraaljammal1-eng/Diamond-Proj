import type { DamageMark } from "@/modules/public-rental/types/official-contract.types";
import type { CarInDraftPatch, FuelLevel } from "../../types/contract.types";

export interface CustodyStepOneInput {
  mileage: string;
  fuel: FuelLevel | null;
  /** A signature drawn in this session, not yet uploaded. */
  signatureDrawn: boolean;
  /** A signature already stored on the server. */
  signaturePresent: boolean;
}

/** `null` when the step may be saved; otherwise the message key to show. */
export type CustodyStepOneIssue = "invalidMileage" | "stepOneRequired" | null;

/**
 * Step 1 validation for a custody event. `requireComplete` is the
 * save-then-continue gate: a plain draft save accepts partial data, moving on
 * to the photos does not.
 */
export function validateCustodyStepOne(input: CustodyStepOneInput, requireComplete: boolean): CustodyStepOneIssue {
  const mileage = input.mileage.trim();
  if (mileage) {
    const parsed = Number(mileage);
    if (!Number.isInteger(parsed) || parsed < 0) return "invalidMileage";
  }
  if (!requireComplete) return null;
  if (!mileage || !input.fuel || (!input.signatureDrawn && !input.signaturePresent)) return "stepOneRequired";
  return null;
}

/**
 * The PATCH body for a Car-In draft. Empty mileage/fuel are left out rather
 * than sent as null: the staged backend keeps whatever it already holds.
 */
export function buildCarInDraftPatch(input: { mileage: string; fuel: FuelLevel | null; damage: DamageMark[]; notes: string }): CarInDraftPatch {
  const mileage = input.mileage.trim();
  return {
    ...(mileage ? { mileageIn: Number(mileage) } : {}),
    ...(input.fuel ? { fuelIn: input.fuel } : {}),
    damageIn: input.damage,
    notes: input.notes || null,
  };
}
