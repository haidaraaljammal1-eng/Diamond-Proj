import type { ContractStatus, FuelLevel, InspectionAngle, ReconciliationLineType } from "../types/contract.types";

export const INSPECTION_ANGLES: readonly InspectionAngle[] = [
  "FRONT",
  "REAR",
  "RIGHT_SIDE",
  "LEFT_SIDE",
  "FRONT_PLATE",
  "REAR_PLATE",
  "INTERIOR_ODOMETER",
  "TIRES",
];

export const FUEL_LEVELS: readonly FuelLevel[] = [
  "F",
  "7/8",
  "3/4",
  "5/8",
  "1/2",
  "3/8",
  "1/4",
  "1/8",
  "E",
];

export const RECONCILIATION_LINE_TYPES: readonly ReconciliationLineType[] = [
  "DAMAGE",
  "FUEL",
  "LATE",
  "SALIK",
  "VIOLATION",
  "OTHER",
];

export const CONTRACT_STATUSES: readonly ContractStatus[] = [
  "AWAITING",
  "FORM",
  "SIGNED",
  "PAID",
  "ACTIVE",
  "RETOUT",
  "REVIEW",
  "CLOSED",
];
