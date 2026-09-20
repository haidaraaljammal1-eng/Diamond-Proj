import type { CarOutAngle } from "../../types/contract.types";

/** Walk-around order: front, driver side, rear, passenger side, then the cabin. */
export const CUSTODY_REQUIRED_ANGLES: readonly CarOutAngle[] = [
  "FRONT", "FRONT_LEFT", "REAR_LEFT", "REAR", "REAR_RIGHT", "FRONT_RIGHT", "ODOMETER", "DASHBOARD_FUEL",
];

/** Captured when they add something; never gate a custody event. */
export const CUSTODY_OPTIONAL_ANGLES: readonly CarOutAngle[] = ["LEFT", "RIGHT", "OTHER"];
