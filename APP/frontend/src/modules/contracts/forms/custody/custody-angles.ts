import type { CarOutAngle } from "../../types/contract.types";

/** Required custody slots (display order). */
export const CUSTODY_REQUIRED_ANGLES: readonly CarOutAngle[] = [
  "FRONT",
  "REAR",
  "LEFT",
  "RIGHT",
];

/** Optional; never gates completion. */
export const CUSTODY_OPTIONAL_ANGLES: readonly CarOutAngle[] = ["OTHER"];
